-- ==============================================================================
-- Supabase Schema v6.0 (Refined for Stability)
-- Changes from v5:
-- 1. Added `cloze_index` to `cards` as the stable anchor.
-- 2. Added composite UNIQUE constraint (note_id, cloze_index).
-- 3. Removed `content_hash` from cards (redundant with stable ID, content updates should just overwrite).
-- ==============================================================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Cleanup
DROP FUNCTION IF EXISTS submit_review;
DROP TABLE IF EXISTS public.review_logs CASCADE;
DROP TABLE IF EXISTS public.cards CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.vaults CASCADE;

-- ------------------------------------------------------------------------------
-- 1. Vaults
-- ------------------------------------------------------------------------------
CREATE TABLE public.vaults (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage vaults" ON public.vaults FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. Notes
-- ------------------------------------------------------------------------------
CREATE TABLE public.notes (
    id UUID PRIMARY KEY, -- Maps to Frontmatter 'mp-id'
    vault_id UUID REFERENCES public.vaults(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    title TEXT,
    relative_path TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    
    -- Sync Metadata
    content_hash CHAR(64), -- Hash of the full file content to skip processing unmodified files
    is_deleted BOOLEAN DEFAULT false,
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_tags ON public.notes USING GIN(tags);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage notes" ON public.notes FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. Cards (Stable Identity)
-- ------------------------------------------------------------------------------
CREATE TABLE public.cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL, -- CASCADE: Note delete = Cards delete
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Identity Anchor
    cloze_index INTEGER NOT NULL, -- The '1' in {{c1::...}}
    
    -- Grouping
    block_id UUID NOT NULL DEFAULT uuid_generate_v4(), -- Logic grouping for UI (multiple cards in same para)
    
    -- Content
    content_raw TEXT NOT NULL, -- Full paragraph text with cloze syntax
    section_path TEXT[] DEFAULT '{}',
    
    -- Tags (Denormalized)
    tags TEXT[] DEFAULT '{}', 
    
    is_suspended BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    
    -- FSRS State
    state INTEGER NOT NULL DEFAULT 0,
    due TIMESTAMPTZ,
    stability DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_review TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX uq_card_identity_active
ON public.cards (note_id, cloze_index)
WHERE is_deleted = false;
CREATE INDEX idx_cards_note_id ON public.cards(note_id);
CREATE INDEX idx_cards_due ON public.cards(due); -- Critical for "Get Due Cards"
CREATE INDEX idx_cards_tags ON public.cards USING GIN(tags); 
CREATE INDEX idx_cards_content_search ON public.cards USING GIN(content_raw gin_trgm_ops);

-- RLS
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage cards" ON public.cards FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. Review Logs
-- ------------------------------------------------------------------------------
CREATE TABLE public.review_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    grade INTEGER NOT NULL,
    state INTEGER NOT NULL,
    due TIMESTAMPTZ NOT NULL,
    stability DOUBLE PRECISION NOT NULL,
    difficulty DOUBLE PRECISION NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    reviewed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Extended FSRS stats for history reconstruction
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_review_logs_user_reviewed_at ON public.review_logs(user_id, reviewed_at);
CREATE INDEX idx_review_logs_card ON public.review_logs(card_id);

ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage logs" ON public.review_logs FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. Updated RPC (No change logic-wise, just compatibility)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_review(
    p_note_id UUID,
    p_cloze_index INTEGER,
    p_card_update JSONB,
    p_review_log JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_card_id UUID;
BEGIN
    -- 1. Get User
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Find Card ID (Hidden Lookup)
    SELECT id INTO v_card_id
    FROM public.cards
    WHERE note_id = p_note_id
      AND cloze_index = p_cloze_index
      AND user_id = v_user_id
    LIMIT 1;

    IF v_card_id IS NULL THEN
        RAISE EXCEPTION 'Card not found for note % cloze %', p_note_id, p_cloze_index;
    END IF;

    -- 3. Update Card
    UPDATE public.cards SET
        state = (p_card_update->>'state')::int,
        due = (p_card_update->>'due')::timestamptz,
        stability = (p_card_update->>'stability')::float,
        difficulty = (p_card_update->>'difficulty')::float,
        elapsed_days = (p_card_update->>'elapsed_days')::float,
        scheduled_days = (p_card_update->>'scheduled_days')::int,
        learning_steps = (p_card_update->>'learning_steps')::int,
        reps = (p_card_update->>'reps')::int,
        lapses = (p_card_update->>'lapses')::int,
        last_review = (p_card_update->>'last_review')::timestamptz,
        updated_at = NOW()
    WHERE id = v_card_id;

    -- 4. Insert Log
    -- FIXED: Read scheduled_days, elapsed_days, last_elapsed_days from p_review_log
    INSERT INTO public.review_logs (
        card_id, user_id, 
        grade, state, due, stability, difficulty, 
        duration_ms, reviewed_at,
        scheduled_days, elapsed_days, last_elapsed_days, learning_steps
    ) VALUES (
        v_card_id,
        v_user_id,
        (p_review_log->>'grade')::int,
        (p_review_log->>'state')::int,
        (p_review_log->>'due')::timestamptz,
        (p_review_log->>'stability')::float,
        (p_review_log->>'difficulty')::float,
        (p_review_log->>'duration_ms')::int,
        (p_review_log->>'reviewed_at')::timestamptz,
        
        -- Fix: Use log values, fallback to 0/update if missing (though Adapter should provide them now)
        COALESCE((p_review_log->>'scheduled_days')::int, 0),
        COALESCE((p_review_log->>'elapsed_days')::float, 0),
        COALESCE((p_review_log->>'last_elapsed_days')::float, 0),
        COALESCE((p_review_log->>'learning_steps')::int, 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION server_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

-- ------------------------------------------------------------------------------
-- 6. Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql';

CREATE TRIGGER update_vaults_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notes_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cards_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataService, NoteMetadata } from './types';
import { MarkdownSplitter } from '../markdown/splitter';
import { parseNote } from '../markdown/parser';

export class SupabaseAdapter implements DataService {
  private supabase: SupabaseClient | null = null;

  constructor(private supabaseUrl: string, private supabaseKey: string) {}

  async init(): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn("Supabase credentials missing. Adapter will not work.");
      return;
    }
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }

  /**
   * Syncs a note's content to Supabase.
   * - Splits content into cards
   * - Upserts cards to 'cards' table
   */
  async syncNote(filepath: string, content: string, noteId: string): Promise<void> {
      if (!this.supabase) return;
      const user = await this.supabase.auth.getUser();
      if (!user.data.user) return;
      const userId = user.data.user.id;

      // 1. Parse Note Metadata
      const parsed = parseNote(content);
      const tags = parsed.frontmatter.tags || [];

      // 2. Upsert Note Record
      const { error: noteError } = await this.supabase
        .from('notes')
        .upsert({
            id: noteId,
            user_id: userId,
            // TODO: Get vault_id from context or default vault
            // For MVP we might need a 'default' vault or look it up
            vault_id: '00000000-0000-0000-0000-000000000000', // Placeholder, needs real Vault ID
            relative_path: filepath,
            title: parsed.frontmatter.title || filepath.split('/').pop(),
            tags: tags,
            content_hash: await this.sha256(content),
            last_sync_at: new Date().toISOString()
        }, { onConflict: 'id' });
        
      if (noteError) {
          // If vault FK fails, we might need to create a default vault first.
          // Ignoring for now, assume setup is done.
          console.error('Sync Note Error', noteError);
      }

      // 3. Split & Sync Cards
      const cardsData = MarkdownSplitter.split(parsed.content, tags);
      
      // Flatten to DB Rows (One Cloze = One Row)
      const flattenedCards = MarkdownSplitter.flattenToCards(noteId, cardsData);

      // Prepare Upsert Data
      const upsertRows = flattenedCards.map(card => ({
          note_id: card.note_id,
          cloze_index: card.cloze_index,
          block_id: card.block_id,
          user_id: userId,
          content_raw: card.content_raw,
          section_path: card.section_path,
          tags: card.tags,
          updated_at: new Date().toISOString()
          // We do NOT overwrite state/reps/etc on sync, 
          // Supabase `onConflict` will handle this if we configure it right.
          // But `upsert` overwrites by default.
      }));

      if (upsertRows.length > 0) {
          // We want to update Content/Tags but PRESERVE FSRS State.
          // Supabase upsert with ignoreDuplicates: false (default) updates all columns provided.
          // So we should NOT include state columns in `upsertRows` unless they are new.
          // But we can't easily know if they are new without querying.
          // Standard pattern: Upsert only "Sync" fields.
          
          const { error: cardError } = await this.supabase
              .from('cards')
              .upsert(upsertRows, { 
                  onConflict: 'note_id,cloze_index', // The stable anchor
                  ignoreDuplicates: false 
              });
              
          if (cardError) {
              console.error('Sync Cards Error', cardError);
          }
      }
      
      // Optional: Handle Deletions (Cards that exist in DB but not in current parse)
      // We can find all cards for this note_id and delete those NOT in flattenedCards IDs.
      // For now, we skip this to avoid accidental data loss during MVP.
  }

  private async sha256(message: string) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async saveReview(noteId: string, card: Card, log: ReviewLog): Promise<void> {
    // Schema v5 uses 'card_id', not 'note_id' for reviews.
    // But the appStore passes 'noteId' (which is actually the Note ID).
    // We need to know WHICH card we are reviewing.
    // The appStore needs to be updated to track 'currentCardId'.
    
    // For backward compatibility with the current appStore which assumes 1 Note = 1 Card (MVP):
    // We will look up the FIRST card associated with this note_id.
    if (!this.supabase) throw new Error("Supabase not initialized");

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) throw new Error("User not logged in");
    // const userId = user.data.user.id; // Unused

    // Find any card for this note (MVP Hack)
    const { data: cardData } = await this.supabase
        .from('cards')
        .select('id')
        .eq('note_id', noteId)
        .limit(1)
        .single();
        
    if (!cardData) {
        console.warn("No card found for note, cannot save review");
        return;
    }
    
    const cardId = cardData.id;

    // Call RPC
    const { error } = await this.supabase.rpc('submit_review', {
        p_card_id: cardId,
        p_card_update: {
            state: card.state,
            due: card.due,
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.elapsed_days,
            scheduled_days: card.scheduled_days,
            reps: card.reps,
            lapses: card.lapses,
            last_review: new Date().toISOString()
        },
        p_review_log: {
            grade: log.rating,
            state: log.state,
            due: log.due,
            stability: log.stability,
            difficulty: log.difficulty,
            duration_ms: log.elapsed_days * 24 * 60 * 60 * 1000,
            reviewed_at: log.review.toISOString()
        }
    });

    if (error) throw error;
  }

  async getMetadata(noteId: string, filepath: string): Promise<NoteMetadata> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    // MVP: Fetch the first card for this note
    const { data, error } = await this.supabase
      .from('cards')
      .select('*')
      .eq('note_id', noteId)
      .limit(1)
      .single();

    if (!data) {
      return {
        noteId,
        filepath,
        card: createEmptyCard(),
      };
    }

    // Map DB fields back to Card
    const card: Card = {
        ...createEmptyCard(), // Fix missing props
        state: data.state,
        due: new Date(data.due),
        stability: data.stability,
        difficulty: data.difficulty,
        elapsed_days: data.elapsed_days,
        scheduled_days: data.scheduled_days,
        reps: data.reps,
        lapses: data.lapses,
        last_review: data.last_review ? new Date(data.last_review) : undefined
    };

    return {
      noteId,
      filepath,
      card,
      lastReview: undefined, 
    };
  }

  async getAllMetadata(): Promise<NoteMetadata[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { data, error } = await this.supabase
      .from('cards')
      .select(`
        *,
        notes (
            relative_path
        )
      `);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      noteId: row.note_id, // This maps back to Note ID
      filepath: row.notes?.relative_path || '',
      card: {
        ...createEmptyCard(),
        state: row.state,
        due: new Date(row.due),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        last_review: row.last_review ? new Date(row.last_review) : undefined
      } as Card,
    }));
  }
}

import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataService, NoteMetadata } from './types';
import { MarkdownSplitter } from '../markdown/splitter';
import { parseNote } from '../markdown/parser';

// Singleton Supabase client to avoid multiple GoTrueClient instances
let supabaseSingleton: SupabaseClient | null = null;

export class SupabaseAdapter implements DataService {
  private supabase: SupabaseClient | null = null;

  constructor(private supabaseUrl: string, private supabaseKey: string) {}

  /**
   * Ensures there is at least one vault for the current user and returns its ID.
   * For now we use a single "Default Vault" per user.
   */
  private async getOrCreateDefaultVault(userId: string): Promise<string | null> {
    if (!this.supabase) return null;

    const defaultName = 'Default Vault';

    // Try to find an existing default vault for this user
    const { data: existing, error: selectError } = await this.supabase
      .from('vaults')
      .select('id')
      .eq('user_id', userId)
      .eq('name', defaultName)
      .limit(1);

    if (selectError) {
      console.error('Failed to fetch default vault', selectError);
      return null;
    }

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    // Create a new default vault for this user
    const { data: inserted, error: insertError } = await this.supabase
      .from('vaults')
      .insert({
        user_id: userId,
        name: defaultName,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create default vault', insertError);
      return null;
    }

    return inserted?.id ?? null;
  }

  async init(): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn("Supabase credentials missing. Adapter will not work.");
      return;
    }
    if (!supabaseSingleton) {
      supabaseSingleton = createClient(this.supabaseUrl, this.supabaseKey);
    }
    this.supabase = supabaseSingleton;
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

      // Ensure we have a vault to attach this note to
      const vaultId = await this.getOrCreateDefaultVault(userId);
      if (!vaultId) {
          console.error('No vault available for user; skipping note sync');
          return;
      }

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
            vault_id: vaultId,
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

  async saveReview(noteId: string, clozeIndex: number, card: Card, log: ReviewLog): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    // If we don't have a noteId (e.g. Demo Vault), skip remote save
    if (!noteId) {
      console.warn("Supabase saveReview skipped: missing noteId");
      return;
    }

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) throw new Error("User not logged in");

    // 2. Call RPC to update card and insert log atomically
    // Note: We now pass note_id + cloze_index directly, letting the DB find the card_id
    const { error: rpcError } = await this.supabase.rpc('submit_review', {
      p_note_id: noteId,
      p_cloze_index: clozeIndex,
      p_card_update: {
        state: card.state,
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
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
        duration_ms: log.elapsed_days * 24 * 60 * 60 * 1000, // approx
        reviewed_at: log.review
      }
    });

    if (rpcError) {
      console.error("Failed to submit review via RPC", rpcError);
      throw rpcError;
    }
  }

  async getMetadata(noteId: string, filepath: string): Promise<NoteMetadata> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    // If noteId is empty (e.g. demo notes), avoid making an invalid note_id=eq. request
    if (!noteId) {
      return {
        noteId,
        filepath,
        cards: {},
        lastReviews: {},
      };
    }

    // Fetch ALL cards for this note
    const { data } = await this.supabase
      .from('cards')
      .select('*')
      .eq('note_id', noteId);

    const cards: Record<number, Card> = {};
    const lastReviews: Record<number, ReviewLog> = {}; // We don't fetch logs yet in getMetadata for perf

    if (data) {
        data.forEach((row: any) => {
            cards[row.cloze_index] = {
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
            };
        });
    }

    return {
      noteId,
      filepath,
      cards,
      lastReviews, 
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

    // Aggregate cards by note_id
    const map: Record<string, NoteMetadata> = {};

    (data || []).forEach((row: any) => {
        const nid = row.note_id;
        if (!map[nid]) {
            map[nid] = {
                noteId: nid,
                filepath: row.notes?.relative_path || '',
                cards: {},
                lastReviews: {}
            };
        }
        
        map[nid].cards[row.cloze_index] = {
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
        };
    });

    return Object.values(map);
  }

  async getReviewHistory(start: Date, end: Date): Promise<ReviewLog[]> {
      if (!this.supabase) throw new Error("Supabase not initialized");

      const { data, error } = await this.supabase
          .from('review_logs')
          .select('*')
          .gte('reviewed_at', start.toISOString())
          .lte('reviewed_at', end.toISOString())
          .order('reviewed_at', { ascending: true });
      
      if (error) {
          console.error("Failed to fetch review history", error);
          return [];
      }

      return (data || []).map((row: any) => {
          const elapsedDays = row.duration_ms / (24 * 60 * 60 * 1000);
          return {
              rating: row.grade,
              state: row.state,
              due: new Date(row.due),
              stability: row.stability,
              difficulty: row.difficulty,
              elapsed_days: elapsedDays, // approx reverse
              last_elapsed_days: elapsedDays,
              scheduled_days: 0,
              learning_steps: 0,
              review: new Date(row.reviewed_at)
          };
      });
  }
}

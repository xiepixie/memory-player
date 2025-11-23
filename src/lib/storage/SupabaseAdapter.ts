import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataService, NoteMetadata, Vault } from './types';
import { MarkdownSplitter } from '../markdown/splitter';
import { parseNote } from '../markdown/parser';

// Singleton Supabase client to avoid multiple GoTrueClient instances
let supabaseSingleton: SupabaseClient | null = null;

export class SupabaseAdapter implements DataService {
  private supabase: SupabaseClient | null = null;

  constructor(private supabaseUrl: string, private supabaseKey: string) { }

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

  // --- Vault Management ---
  async getVaults(): Promise<Vault[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) {
      console.warn('getVaults called without authenticated user');
      return [];
    }
    const userId = user.data.user.id;

    const { data, error } = await this.supabase
      .from('vaults')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch vaults', error);
      return [];
    }

    return (data || []) as Vault[];
  }

  async createVault(name: string, config?: Vault['config']): Promise<Vault | null> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) throw new Error("User not logged in");

    const userId = user.data.user.id;
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('vaults')
      .insert({
        user_id: userId,
        name,
        config: config || {},
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create vault', error);
      return null;
    }

    return data as Vault;
  }

  async updateVault(id: string, updates: Partial<Vault>): Promise<Vault | null> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const patch: Partial<Vault> = {};
    if (typeof updates.name !== 'undefined') {
      patch.name = updates.name;
    }
    if (typeof updates.config !== 'undefined') {
      patch.config = updates.config;
    }

    if (Object.keys(patch).length === 0) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('vaults')
      .update(patch as any)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to update vault', error);
      return null;
    }

    return data as Vault;
  }

  // --- Note Management ---
  async softDeleteNote(noteId: string): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { error } = await this.supabase
      .from('notes')
      .update({ is_deleted: true })
      .eq('id', noteId);

    if (error) {
      console.error('Failed to soft delete note', error);
    }
  }

  async getDeletedNotes(): Promise<NoteMetadata[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) {
      console.warn('getDeletedNotes called without authenticated user');
      return [];
    }
    const userId = user.data.user.id;

    const { data, error } = await this.supabase
      .from('notes')
      .select('id, relative_path')
      .eq('is_deleted', true)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load deleted notes', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      noteId: row.id,
      filepath: row.relative_path,
      cards: {},
      lastReviews: {},
    }));
  }

  async restoreNote(noteId: string): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { error } = await this.supabase
      .from('notes')
      .update({ is_deleted: false })
      .eq('id', noteId);

    if (error) {
      console.error('Failed to restore note', error);
    }
  }

  private levenshtein(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const dist = this.levenshtein(a, b);
    const maxLength = Math.max(a.length, b.length);
    return 1 - (dist / maxLength);
  }

  /**
   * Syncs a note's content to Supabase.
   * - Uses content_hash to skip unchanged files
   * - Splits content into cards when changed
   * - Upserts cards to 'cards' table
   * - Applies stability penalty if content changes significantly
   */
  async syncNote(filepath: string, content: string, noteId: string, vaultId?: string): Promise<void> {
    if (!this.supabase) return;
    const user = await this.supabase.auth.getUser();
    if (!user.data.user) return;
    const userId = user.data.user.id;

    // Resolve vault: prefer explicit vaultId, fallback to default vault
    let resolvedVaultId = vaultId;
    if (!resolvedVaultId) {
      resolvedVaultId = await this.getOrCreateDefaultVault(userId) || '';
    }
    if (!resolvedVaultId) {
      console.error('No vault available for user; skipping note sync');
      return;
    }

    const hash = await this.sha256(content);

    // Check existing note hash to potentially skip heavy work
    let existingHash: string | null = null;
    if (noteId) {
      const { data: existingRows, error: existingError } = await this.supabase
        .from('notes')
        .select('content_hash')
        .eq('id', noteId)
        .limit(1);

      if (existingError) {
        console.error('Failed to fetch existing note for hash check', existingError);
      } else if (existingRows && existingRows.length > 0) {
        existingHash = existingRows[0].content_hash;
      }
    }

    if (existingHash && existingHash === hash) {
      // Content unchanged: only touch last_sync_at
      const { error: touchError } = await this.supabase
        .from('notes')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', noteId);

      if (touchError) {
        console.error('Failed to update last_sync_at for unchanged note', touchError);
      }
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
        vault_id: resolvedVaultId,
        relative_path: filepath,
        title: parsed.frontmatter.title || filepath.split('/').pop(),
        tags,
        content_hash: hash,
        is_deleted: false,
        last_sync_at: new Date().toISOString(),
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

    // Fetch existing cards to compare content for stability adjustment
    const { data: existingCards } = await this.supabase
      .from('cards')
      .select('cloze_index, content_raw, stability')
      .eq('note_id', noteId);

    const existingMap = new Map<number, { content_raw: string; stability: number }>();
    if (existingCards) {
      existingCards.forEach((c: any) => existingMap.set(c.cloze_index, c));
    }

    // Prepare Upsert Data
    const upsertRows = flattenedCards.map(card => {
      const base = {
        note_id: card.note_id,
        cloze_index: card.cloze_index,
        block_id: card.block_id,
        user_id: userId,
        content_raw: card.content_raw,
        section_path: card.section_path,
        tags: card.tags,
        updated_at: new Date().toISOString()
      };

      // Check for significant content change
      const existing = existingMap.get(card.cloze_index);
      if (existing && existing.content_raw !== card.content_raw) {
        const similarity = this.calculateSimilarity(existing.content_raw, card.content_raw);
        // Threshold for "significant": similarity < 0.60 (more than 40% changed)
        if (similarity < 0.60) {
          const newStability = (existing.stability || 0) * 0.75;
          // Include stability in update to apply penalty
          return { ...base, stability: newStability };
        }
      }

      // Default: do NOT overwrite state/reps/etc on sync,
      // Supabase `onConflict` will preserve existing values for missing columns.
      return base;
    });

    if (upsertRows.length > 0) {
      // We want to update Content/Tags but PRESERVE FSRS State (unless penalized).
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
    const currentClozeIndices = flattenedCards.map(c => c.cloze_index);

    if (currentClozeIndices.length > 0) {
      const { error: deleteError } = await this.supabase
        .from('cards')
        .delete()
        .eq('note_id', noteId)
        .not('cloze_index', 'in', `(${currentClozeIndices.join(',')})`);

      if (deleteError) {
        console.error('Delete Stale Cards Error', deleteError);
      }
    } else {
      // If no cards remain, delete ALL cards for this note
      const { error: deleteAllError } = await this.supabase
        .from('cards')
        .delete()
        .eq('note_id', noteId);

      if (deleteAllError) {
        console.error('Delete All Cards Error', deleteAllError);
      }
    }
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
            relative_path,
            is_deleted
        )
      `);

    if (error) throw error;

    // Aggregate cards by note_id
    const map: Record<string, NoteMetadata> = {};

    (data || []).forEach((row: any) => {
      // Skip cards that belong to soft-deleted notes
      if (row.notes && row.notes.is_deleted) {
        return;
      }
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

  subscribeToRealtime(onCardUpdate: (payload: any) => void): () => void {
    if (!this.supabase) return () => { };

    const channel = this.supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cards',
        },
        (payload) => {
          onCardUpdate(payload.new);
        }
      )
      .subscribe();

    return () => {
      this.supabase?.removeChannel(channel);
    };
  }

  // --- Smart Queue & Actions ---

  async getDueCards(limit: number = 50): Promise<any[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { data, error } = await this.supabase
      .from('cards')
      .select(`
        id,
        note_id,
        cloze_index,
        due,
        notes (
          relative_path,
          is_deleted
        )
      `)
      .lte('due', new Date().toISOString())
      .eq('is_suspended', false)
      .eq('notes.is_deleted', false)
      .order('due', { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch due cards", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      cardId: row.id,
      noteId: row.note_id,
      filepath: row.notes?.relative_path || '',
      clozeIndex: row.cloze_index,
      due: new Date(row.due)
    }));
  }

  async searchCards(query: string): Promise<any[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { data, error } = await this.supabase
      .from('cards')
      .select(`
        *,
        notes (
          relative_path,
          title,
          is_deleted
        )
      `)
      .ilike('content_raw', `%${query}%`)
      .eq('notes.is_deleted', false)
      .limit(20);

    if (error) {
      console.error("Failed to search cards", error);
      return [];
    }

    return data || [];
  }

  async suspendCard(cardId: string, isSuspended: boolean): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { error } = await this.supabase
      .from('cards')
      .update({ is_suspended: isSuspended })
      .eq('id', cardId);

    if (error) throw error;
  }

  async resetCard(cardId: string): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { error } = await this.supabase
      .from('cards')
      .update({
        state: 0, // New
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        last_review: null,
        due: new Date().toISOString() // Due now
      })
      .eq('id', cardId);

    if (error) throw error;
  }
}

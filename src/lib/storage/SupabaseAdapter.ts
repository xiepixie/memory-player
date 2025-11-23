import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { SupabaseClient } from '@supabase/supabase-js';
import { DataService, NoteMetadata, Vault } from './types';
import { getSupabaseClient } from '../supabaseClient';
import { MarkdownSplitter } from '../markdown/splitter';
import { parseNote } from '../markdown/parser';

export class SupabaseAdapter implements DataService {
  private supabase: SupabaseClient | null = null;
  private vaultRootCache = new Map<string, string | null>();

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
    const client = getSupabaseClient();
    if (!client) {
      console.warn("Supabase credentials missing. Adapter will not work.");
      return;
    }
    this.supabase = client;
  }

  // --- Vault Management ---
  async getVaults(): Promise<Vault[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");
    let userId: string | null = null;
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user) {
        return [];
      }
      userId = user.data.user.id;
    } catch (e) {
      console.error('Failed to get user for vaults', e);
      return [];
    }

    const { data, error } = await this.supabase
      .from('vaults')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch vaults', error);
      throw error;
    }

    return (data || []) as Vault[];
  }

  async createVault(name: string, config?: Vault['config']): Promise<Vault | null> {
    if (!this.supabase) throw new Error("Supabase not initialized");
    let userId: string | null = null;
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user) throw new Error("User not logged in");
      userId = user.data.user.id;
    } catch (e) {
      console.error('Failed to get user for createVault', e);
      throw e;
    }
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
      throw error;
    }

    return data as Vault;
  }

  // --- Note Management ---
  async softDeleteNote(noteId: string): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const now = new Date().toISOString();

    // 1. Soft delete the note
    const { error: noteError } = await this.supabase
      .from('notes')
      .update({ is_deleted: true, updated_at: now })
      .eq('id', noteId);

    if (noteError) {
      console.error('Failed to soft delete note', noteError);
      throw noteError;
    }

    // 2. Soft delete all associated cards to ensure incremental sync picks them up
    const { error: cardError } = await this.supabase
      .from('cards')
      .update({ is_deleted: true, updated_at: now })
      .eq('note_id', noteId);

    if (cardError) {
      console.error('Failed to soft delete associated cards', cardError);
      // We don't throw here to avoid breaking the flow if note was already deleted?
      // But for consistency we should probably log it.
    }
  }

  async getDeletedNotes(): Promise<NoteMetadata[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) {
      // console.debug('getDeletedNotes called without authenticated user');
      return [];
    }
    const userId = user.data.user.id;

    const { data, error } = await this.supabase
      .from('notes')
      .select('id, relative_path, vault_id')
      .eq('is_deleted', true)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load deleted notes', error);
      throw error;
    }

    const rows = data || [];
    const results: NoteMetadata[] = [];
    for (const row of rows as any[]) {
      const rootPath = await this.getVaultRootPath(row.vault_id as string | null | undefined);
      const filepath = this.toAbsolutePath(row.relative_path, rootPath);
      results.push({
        noteId: row.id,
        filepath,
        cards: {},
        lastReviews: {},
      });
    }
    return results;
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

  private extractRootPathFromConfig(config: any): string | null {
    if (!config) return null;
    const rootPath = (config as any).rootPath;
    if (typeof rootPath !== 'string') return null;
    const trimmed = rootPath.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toRelativePath(filepath: string, rootPath: string | null): string {
    if (!filepath) return '';
    const normalizedFile = filepath.replace(/\\/g, '/');
    if (!rootPath) return normalizedFile;
    const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalizedFile.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
      return normalizedFile;
    }
    let rel = normalizedFile.slice(normalizedRoot.length);
    rel = rel.replace(/^\/+/, '');
    return rel;
  }

  private toAbsolutePath(relativePath: string, rootPath: string | null): string {
    if (!relativePath) return rootPath || '';

    const normalized = relativePath.replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('\\\\') || normalized.startsWith('/')) {
      return relativePath;
    }

    if (!rootPath) return relativePath;
    const hasBackslash = rootPath.includes('\\');
    const sep = hasBackslash ? '\\' : '/';
    const root = rootPath.replace(/[\\/]+$/, '');
    const rel = relativePath.replace(/^[\\/]+/, '');
    const normalizedRel = hasBackslash ? rel.replace(/\//g, '\\') : rel;
    return root + sep + normalizedRel;
  }

  private async getVaultRootPath(vaultId: string | null | undefined): Promise<string | null> {
    if (!this.supabase) return null;
    if (!vaultId) return null;
    if (this.vaultRootCache.has(vaultId)) {
      return this.vaultRootCache.get(vaultId) || null;
    }
    const { data, error } = await this.supabase
      .from('vaults')
      .select('config')
      .eq('id', vaultId)
      .single();

    if (error) {
      console.error('Failed to load vault config', error);
      this.vaultRootCache.set(vaultId, null);
      return null;
    }

    const rootPath = this.extractRootPathFromConfig((data as any)?.config);
    this.vaultRootCache.set(vaultId, rootPath);
    return rootPath;
  }

  /**
   * Syncs a note's content to Supabase.
   * - Uses content_hash to skip unchanged files
   * - Splits content into cards when changed
   * - Upserts cards to 'cards' table
   * - Applies stability penalty if content changes significantly
   */
  async syncNote(filepath: string, content: string, noteId: string, vaultId?: string): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase not initialized");
    }

    const user = await this.supabase.auth.getUser();
    if (!user.data.user) {
      throw new Error("User not logged in");
    }
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

    const rootPath = await this.getVaultRootPath(resolvedVaultId);
    const relativePath = this.toRelativePath(filepath, rootPath);
    const pathForTitle = relativePath || filepath;
    const normalizedTitlePath = pathForTitle.replace(/\\/g, '/');
    const fileName = normalizedTitlePath.split('/').pop() || '';
    const title = parsed.frontmatter.title || fileName || noteId;

    // 2. Upsert Note Record
    const { error: noteError } = await this.supabase
      .from('notes')
      .upsert({
        id: noteId,
        user_id: userId,
        vault_id: resolvedVaultId,
        relative_path: relativePath,
        title,
        tags,
        content_hash: hash,
        is_deleted: false,
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (noteError) {
      console.error('Sync Note Error', noteError);
      throw noteError;
    }

    // 3. Split & Sync Cards
    const cardsData = MarkdownSplitter.split(parsed.content, tags);

    // Flatten to DB Rows (One Cloze = One Row)
    const flattenedCards = MarkdownSplitter.flattenToCards(noteId, cardsData);

    const clozeMap = new Map<number, any>();
    for (const card of flattenedCards) {
      const existing = clozeMap.get(card.cloze_index);
      if (!existing) {
        clozeMap.set(card.cloze_index, card);
      } else {
        // MERGE STRATEGY: Concatenate content to support split-context clozes (e.g. {{c1}} in two diff paragraphs).
        // Since flattenedCards are in document order, we append the new content to the existing one.
        // We use double newline to preserve paragraph separation.
        const mergedContent = existing.content_raw + '\n\n' + card.content_raw;
        
        const mergedTags = Array.from(
          new Set([...(existing.tags || []), ...(card.tags || [])])
        );
        
        // We keep the section_path of the *first* occurrence as the primary location anchor
        // (or we could merge them, but the UI usually just needs one location to jump to).
        
        clozeMap.set(card.cloze_index, {
          ...existing,
          content_raw: mergedContent,
          tags: mergedTags,
        });
      }
    }

    const normalizedCards = Array.from(clozeMap.values());

    if (normalizedCards.length < flattenedCards.length) {
      console.warn('Normalized duplicate cloze indices for note', {
        noteId,
        originalCount: flattenedCards.length,
        normalizedCount: normalizedCards.length,
      });
    }

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
    const upsertRows = normalizedCards.map(card => {
      const base = {
        note_id: card.note_id,
        cloze_index: card.cloze_index,
        block_id: card.block_id,
        user_id: userId,
        content_raw: card.content_raw,
        section_path: card.section_path,
        tags: card.tags,
        is_deleted: false, // Ensure it is active
        updated_at: new Date().toISOString()
      };

      // Check for significant content change
      const existing = existingMap.get(card.cloze_index);
      if (existing) {
        if (existing.content_raw !== card.content_raw) {
          const similarity = this.calculateSimilarity(existing.content_raw, card.content_raw);
          // Threshold for "significant": similarity < 0.60 (more than 40% changed)
          if (similarity < 0.60) {
            const newStability = (existing.stability || 0) * 0.75;
            // Include stability in update to apply penalty
            return { ...base, stability: newStability };
          }
        }
        // Existing card: preserve state (don't include state/due/etc in update)
        return base;
      } else {
        // New Card: Must provide initial FSRS state
        // defaults: state=0 (New), due=Now
        return {
          ...base,
          state: 0,
          due: new Date().toISOString(),
          stability: 0,
          difficulty: 0,
          elapsed_days: 0,
          scheduled_days: 0,
          learning_steps: 0,
          reps: 0,
          lapses: 0,
          last_review: null
        };
      }
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
        throw cardError;
      }
    }

    // Optional: Handle Deletions (Cards that exist in DB but not in current parse)
    // We can find all cards for this note_id and delete those NOT in normalizedCards IDs.
    const currentClozeIndices = normalizedCards.map(c => c.cloze_index);

    if (currentClozeIndices.length > 0) {
      const { error: deleteError } = await this.supabase
        .from('cards')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('note_id', noteId)
        .not('cloze_index', 'in', `(${currentClozeIndices.join(',')})`);

      if (deleteError) {
        console.error('Soft Delete Stale Cards Error', deleteError);
      }
    } else {
      // If no cards remain, soft delete ALL cards for this note
      const { error: deleteAllError } = await this.supabase
        .from('cards')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('note_id', noteId);

      if (deleteAllError) {
        console.error('Soft Delete All Cards Error', deleteAllError);
      }
    }
  }

  private async sha256(message: string) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async saveReview(noteId: string, clozeIndex: number, card: Card, log: ReviewLog, durationMs?: number): Promise<void> {
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
        elapsed_days: log.elapsed_days,
        scheduled_days: log.scheduled_days,
        last_elapsed_days: (log as any).last_elapsed_days || 0, // Use if available
        learning_steps: 0, // Not tracked in log yet
        duration_ms: typeof durationMs === 'number' ? Math.max(0, Math.round(durationMs)) : 0, // Duration in ms from frontend (fallback to 0)
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

    // Fetch ALL ACTIVE cards for this note
    const { data } = await this.supabase
      .from('cards')
      .select('*')
      .eq('note_id', noteId)
      .eq('is_deleted', false);

    const cards: Record<number, Card> = {};
    const lastReviews: Record<number, ReviewLog> = {}; // We don't fetch logs yet in getMetadata for perf

    if (data) {
      data.forEach((row: any) => {
        const baseCard = createEmptyCard();
        cards[row.cloze_index] = {
          ...baseCard,
          state: row.state,
          due: row.due ? new Date(row.due) : baseCard.due,
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

  private async getServerNow(): Promise<string> {
    if (!this.supabase) {
      throw new Error("Supabase not initialized");
    }

    try {
      const { data, error } = await this.supabase.rpc('server_now');
      if (error || !data) {
        return new Date().toISOString();
      }
      if (typeof data === 'string') {
        return data;
      }
      return new Date(data as any).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  async getAllMetadata(vaultId?: string, after?: string | Date | null): Promise<{ items: NoteMetadata[], serverNow: string }> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    // Use strict inner join if filtering by vault, otherwise default left join
    const notesJoin = vaultId ? 'notes!inner' : 'notes';

    let query = this.supabase
      .from('cards')
      .select(`
        *,
        ${notesJoin} (
            relative_path,
            is_deleted,
            vault_id,
            updated_at
        )
      `);

    if (vaultId) {
      query = query.eq('notes.vault_id', vaultId);
    }

    if (after) {
      // Incremental Sync: Get all cards updated after 'after'
      const afterISO = after instanceof Date ? after.toISOString() : after;
      query = query.gt('updated_at', afterISO);
    } else {
       // Full Sync: Only return active cards for active notes
       // We only fetch active cards to rebuild local cache.
       // Note: If we want to be purely incremental even for full sync, we could return everything,
       // but usually full sync implies "current state".
       query = query.eq('is_deleted', false).eq('notes.is_deleted', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = data || [];
    
    // Calculate max updated_at to use as new cursor.
    // When there are no rows, fall back to a server-side now() via RPC to avoid
    // relying on the client clock for the incremental sync cursor.
    let maxUpdatedAt: string;
    if (rows.length > 0) {
        const maxRow = rows.reduce((prev, current) => {
            return (prev.updated_at > current.updated_at) ? prev : current;
        });
        maxUpdatedAt = maxRow.updated_at;
    } else {
        maxUpdatedAt = await this.getServerNow();
    }

    const vaultIds = new Set<string>();
    (rows as any[]).forEach((row: any) => {
      if (row.notes && row.notes.vault_id) {
        vaultIds.add(row.notes.vault_id as string);
      }
    });

    const vaultRootMap = new Map<string, string | null>();
    for (const id of vaultIds) {
      const rootPath = await this.getVaultRootPath(id);
      vaultRootMap.set(id, rootPath);
    }

    const map: Record<string, NoteMetadata> = {};

    (rows as any[]).forEach((row: any) => {
      // For Incremental Sync (after != null), we DO want to return deleted items so the Store can remove them.
      // For Full Sync (after == null), we filtered them out in SQL.

      const nid = row.note_id;
      if (!map[nid]) {
        const vaultId = row.notes ? (row.notes.vault_id as string | null | undefined) : null;
        const rootPath = vaultId ? vaultRootMap.get(vaultId) || null : null;
        const filepath = this.toAbsolutePath(row.notes?.relative_path || '', rootPath);
        map[nid] = {
          noteId: nid,
          filepath,
          cards: {},
          lastReviews: {},
          isDeleted: row.notes?.is_deleted, // Propagate note deletion status
          remoteUpdatedAt: row.updated_at
        };
      }

      const baseCard = createEmptyCard();
      const constructedCard = {
        ...baseCard,
        state: row.state,
        due: row.due ? new Date(row.due) : baseCard.due,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        last_review: row.last_review ? new Date(row.last_review) : undefined,
        // Inject deletion flag for incremental merging
      };
      
      if (row.is_deleted && after) {
         // Mark as deleted so Store can remove it
         (constructedCard as any).isDeleted = true;
      } else if (row.is_deleted && !after) {
         // Full sync: skip deleted cards (should be filtered by SQL anyway but double check)
         return; 
      }

      map[nid].cards[row.cloze_index] = constructedCard;
    });

    return {
        items: Object.values(map),
        serverNow: maxUpdatedAt
    };
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
      throw error;
    }

    return (data || []).map((row: any) => {
      return {
        rating: row.grade,
        state: row.state,
        due: new Date(row.due),
        stability: row.stability,
        difficulty: row.difficulty,
        // Use the explicit FSRS fields stored in review_logs
        elapsed_days: typeof row.elapsed_days === 'number' ? row.elapsed_days : 0,
        last_elapsed_days: typeof row.last_elapsed_days === 'number' ? row.last_elapsed_days : (row.elapsed_days ?? 0),
        scheduled_days: typeof row.scheduled_days === 'number' ? row.scheduled_days : 0,
        learning_steps: typeof row.learning_steps === 'number' ? row.learning_steps : 0,
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
          is_deleted,
          vault_id
        )
      `)
      .lte('due', new Date().toISOString())
      .eq('is_suspended', false)
      .eq('is_deleted', false)
      .eq('notes.is_deleted', false)
      .order('due', { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch due cards", error);
      throw error;
    }

    const rows = data || [];
    const vaultIds = new Set<string>();
    (rows as any[]).forEach((row: any) => {
      if (row.notes && row.notes.vault_id) {
        vaultIds.add(row.notes.vault_id as string);
      }
    });

    const vaultRootMap = new Map<string, string | null>();
    for (const id of vaultIds) {
      const rootPath = await this.getVaultRootPath(id);
      vaultRootMap.set(id, rootPath);
    }

    return (rows as any[]).map((row: any) => {
      const vaultId = row.notes ? (row.notes.vault_id as string | null | undefined) : null;
      const rootPath = vaultId ? vaultRootMap.get(vaultId) || null : null;
      const filepath = this.toAbsolutePath(row.notes?.relative_path || '', rootPath);
      return {
        cardId: row.id,
        noteId: row.note_id,
        filepath,
        clozeIndex: row.cloze_index,
        due: new Date(row.due)
      };
    });
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
          is_deleted,
          vault_id
        )
      `)
      .ilike('content_raw', `%${query}%`)
      .eq('is_deleted', false)
      .eq('notes.is_deleted', false)
      .limit(20);

    if (error) {
      console.error("Failed to search cards", error);
      throw error;
    }

    const rows = data || [];
    const vaultIds = new Set<string>();
    (rows as any[]).forEach((row: any) => {
      if (row.notes && row.notes.vault_id) {
        vaultIds.add(row.notes.vault_id as string);
      }
    });

    const vaultRootMap = new Map<string, string | null>();
    for (const id of vaultIds) {
      const rootPath = await this.getVaultRootPath(id);
      vaultRootMap.set(id, rootPath);
    }

    return (rows as any[]).map((row: any) => {
      const vaultId = row.notes ? (row.notes.vault_id as string | null | undefined) : null;
      const rootPath = vaultId ? vaultRootMap.get(vaultId) || null : null;
      const filepath = this.toAbsolutePath(row.notes?.relative_path || '', rootPath);
      return { ...row, filepath };
    });
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

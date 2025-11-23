import { Card, ReviewLog } from 'ts-fsrs';

export interface NoteMetadata {
  noteId: string;
  filepath: string;
  // Map cloze_index (1, 2, 3...) to its FSRS Card state
  cards: Record<number, Card>;
  // Optional: track last review per card for history
  lastReviews?: Record<number, ReviewLog>;
}

export interface QueueItem {
  cardId?: string;
  noteId: string;
  filepath: string;
  clozeIndex: number;
  due: Date;
}

export interface Vault {
  id: string;
  user_id: string;
  name: string;
  config: {
    rootPath?: string;
    fsrsParams?: any;
    dailyGoals?: {
      newCards: number;
      reviewCards: number;
    };
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface DataService {
  /**
   * Initialize the adapter (e.g. connect to DB)
   */
  init(): Promise<void>;

  // --- Vault Management ---
  getVaults(): Promise<Vault[]>;
  createVault(name: string, config?: Vault['config']): Promise<Vault | null>;
  updateVault(id: string, updates: Partial<Vault>): Promise<Vault | null>;

  // --- Note Management ---

  /**
   * Sync a note to the backend
   */
  syncNote(filepath: string, content: string, noteId: string, vaultId?: string): Promise<void>;

  /**
   * Soft delete a note
   */
  softDeleteNote(noteId: string): Promise<void>;

  /**
   * Get all deleted notes (for Recycle Bin)
   */
  getDeletedNotes(): Promise<NoteMetadata[]>;

  /**
   * Restore a soft-deleted note
   */
  restoreNote(noteId: string): Promise<void>;

  /**
   * Save the review result for a specific cloze in a note
   * @param noteId The unique ID of the note
   * @param clozeIndex The index of the cloze (1-based)
   * @param card The updated FSRS Card state
   * @param log The review log entry
   * @throws Error if save fails
   */
  saveReview(noteId: string, clozeIndex: number, card: Card, log: ReviewLog): Promise<void>;

  /**
   * Get the metadata (FSRS state) for a note.
   * If no state exists, returns empty record.
   * @param noteId The unique ID of the note
   * @param filepath Fallback filepath if ID lookup fails (optional)
   */
  getMetadata(noteId: string, filepath: string): Promise<NoteMetadata>;

  /**
   * Get all tracked notes metadata
   */
  getAllMetadata(): Promise<NoteMetadata[]>;

  /**
   * Get review history within a date range
   */
  getReviewHistory(start: Date, end: Date): Promise<ReviewLog[]>;

  /**
   * Subscribe to realtime changes from the backend
   * @param onCardUpdate Callback when a card is updated externally
   */
  subscribeToRealtime(onCardUpdate: (payload: any) => void): () => void;

  // --- Smart Queue & Actions ---

  /**
   * Get due cards for the "Smart Queue".
   * Filters by due date <= now and is_suspended = false.
   * @param limit Max number of cards to fetch (default 50)
   */
  getDueCards(limit?: number): Promise<QueueItem[]>;

  /**
   * Search for cards by content.
   * @param query Search term
   */
  searchCards(query: string): Promise<any[]>;

  /**
   * Suspend or unsuspend a card.
   */
  suspendCard(cardId: string, isSuspended: boolean): Promise<void>;

  /**
   * Reset a card's FSRS progress to initial state (New).
   */
  resetCard(cardId: string): Promise<void>;
}

export type { ReviewLog };

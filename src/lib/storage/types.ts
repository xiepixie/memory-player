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
  noteId: string;
  filepath: string;
  clozeIndex: number;
  due: Date;
}

export interface DataService {
  /**
   * Initialize the adapter (e.g. connect to DB)
   */
  init(): Promise<void>;

  /**
   * Sync a note to the backend
   */
  syncNote(filepath: string, content: string, noteId: string): Promise<void>;

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
}

export type { ReviewLog };

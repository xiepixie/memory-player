import { Card, ReviewLog } from 'ts-fsrs';

export interface NoteMetadata {
  noteId: string;
  filepath: string;
  card: Card;
  lastReview?: ReviewLog;
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
   * Save the review result for a specific note
   * @param noteId The unique ID of the note
   * @param card The updated FSRS Card state
   * @param log The review log entry
   */
  saveReview(noteId: string, card: Card, log: ReviewLog): Promise<void>;

  /**
   * Get the metadata (FSRS state) for a note.
   * If no state exists, returns a fresh state.
   * @param noteId The unique ID of the note
   * @param filepath Fallback filepath if ID lookup fails (optional)
   */
  getMetadata(noteId: string, filepath: string): Promise<NoteMetadata>;

  /**
   * Get all tracked notes metadata
   */
  getAllMetadata(): Promise<NoteMetadata[]>;
}

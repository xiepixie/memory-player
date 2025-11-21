import { Card, ReviewLog } from 'ts-fsrs';

export interface NoteMetadata {
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
   * Save the review result for a specific note
   * @param filepath The absolute path to the note
   * @param card The updated FSRS Card state
   * @param log The review log entry
   */
  saveReview(filepath: string, card: Card, log: ReviewLog): Promise<void>;

  /**
   * Get the metadata (FSRS state) for a note.
   * If no state exists, returns a fresh state.
   * @param filepath The absolute path to the note
   */
  getMetadata(filepath: string): Promise<NoteMetadata>;

  /**
   * Get all tracked notes metadata
   */
  getAllMetadata(): Promise<NoteMetadata[]>;
}

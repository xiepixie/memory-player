import { Card, ReviewLog } from 'ts-fsrs';
import { DataService, NoteMetadata } from './types';

const STORAGE_KEY = 'memory-player-data';

interface LocalStorageSchemaEntry {
  filepath: string;
  cards: Record<number, Card>;
  history: ReviewLog[];
}

interface LocalStorageSchema {
  [key: string]: LocalStorageSchemaEntry;
}

export class MockAdapter implements DataService {
  private data: LocalStorageSchema = {};

  async init(): Promise<void> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.data = JSON.parse(raw);
        // Migration check: if old format (has 'card' instead of 'cards'), reset or migrate
        // Simple reset for MVP refactor
        const firstKey = Object.keys(this.data)[0];
        if (firstKey && (this.data[firstKey] as any).card) {
            console.warn("Detected old storage format, resetting mock data");
            this.data = {} as LocalStorageSchema;
        } else {
            // Ensure every entry has a filepath; if missing, fall back to its key
            Object.entries(this.data).forEach(([key, entry]: [string, any]) => {
                if (!entry.filepath) {
                    entry.filepath = key;
                }
            });
        }
      } catch (e) {
        console.error('Failed to parse local storage data', e);
        this.data = {} as LocalStorageSchema;
      }
    }
  }

  async syncNote(filepath: string, _content: string, noteId: string): Promise<void> {
    // In mock mode we don't sync content remotely, but we DO keep a stable
    // mapping between noteId and its latest filepath so that getAllMetadata
    // can report correct paths for Library/Dashboard.
    const key = noteId || filepath;
    if (!key) return;

    const existing = this.data[key];
    if (existing) {
      if (filepath && existing.filepath !== filepath) {
        existing.filepath = filepath;
        this.persist();
      }
    } else {
      this.data[key] = { filepath, cards: {}, history: [] };
      this.persist();
    }

    console.log(`[Mock] Syncing note: ${filepath} (${noteId})`);
  }

  async saveReview(noteId: string, clozeIndex: number, card: Card, log: ReviewLog): Promise<void> {
    // Use noteId as the stable key in mock mode; filepath is stored inside entry
    if (!noteId) {
      console.warn('Mock saveReview skipped: missing noteId');
      return;
    }

    const key = noteId;
    if (!this.data[key]) {
      this.data[key] = { filepath: key, cards: {}, history: [] };
    }

    this.data[key].cards[clozeIndex] = card;
    this.data[key].history.push(log);

    this.persist();
  }

  async getMetadata(noteId: string, filepath: string): Promise<NoteMetadata> {
    // Prefer noteId as stable identity; fall back to filepath for demo/legacy
    const key = noteId || filepath;
    let entry = this.data[key];
    
    if (!entry) {
      entry = { filepath, cards: {}, history: [] };
      this.data[key] = entry;
      this.persist();
    } else if (filepath && entry.filepath !== filepath) {
      // File was moved/renamed; update mapping
      entry.filepath = filepath;
      this.persist();
    }

    return {
      noteId: key,
      filepath: entry.filepath || filepath,
      cards: entry.cards,
      lastReviews: {}, // TODO: reconstruct from history if needed
    };
  }

  async getAllMetadata(): Promise<NoteMetadata[]> {
    // Expose proper filepath for each note so that Library/Dashboard can
    // aggregate by real file path just like the Supabase adapter.
    return Object.entries(this.data).map(([key, entry]) => ({
      noteId: key,
      filepath: entry.filepath || key,
      cards: entry.cards,
      lastReviews: {},
    }));
  }

  async getReviewHistory(start: Date, end: Date): Promise<ReviewLog[]> {
    const allLogs: ReviewLog[] = [];
    Object.values(this.data).forEach(entry => {
      if (entry.history) {
        // Filter logs within range
        const logs = entry.history.filter(log => {
            const d = new Date(log.review);
            return d >= start && d <= end;
        });
        allLogs.push(...logs);
      }
    });
    // Sort by date asc
    return allLogs.sort((a, b) => new Date(a.review).getTime() - new Date(b.review).getTime());
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}

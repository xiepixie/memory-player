import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { DataService, NoteMetadata } from './types';

const STORAGE_KEY = 'memory-player-data';

interface LocalStorageSchema {
  [filepath: string]: {
    card: Card;
    history: ReviewLog[];
  };
}

export class MockAdapter implements DataService {
  private data: LocalStorageSchema = {};

  async init(): Promise<void> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.data = JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse local storage data', e);
        this.data = {};
      }
    }
  }

  async syncNote(filepath: string, content: string, noteId: string): Promise<void> {
    // Mock adapter doesn't sync to cloud, but we could log it or update local state if needed.
    console.log(`[Mock] Syncing note: ${filepath} (${noteId})`);
    return Promise.resolve();
  }

  async saveReview(noteId: string, card: Card, log: ReviewLog): Promise<void> {
    // Mock adapter still uses filepath as key for now, or we can use noteId if available
    // For backward compatibility in mock mode, we'll use noteId as the key
    const key = noteId;
    if (!this.data[key]) {
      this.data[key] = { card, history: [] };
    }

    this.data[key].card = card;
    this.data[key].history.push(log);

    this.persist();
  }

  async getMetadata(noteId: string, filepath: string): Promise<NoteMetadata> {
    // Try noteId first
    let entry = this.data[noteId];
    
    if (!entry) {
      return {
        noteId,
        filepath,
        card: createEmptyCard(),
        lastReview: undefined,
      };
    }

    return {
      noteId,
      filepath,
      card: entry.card,
      lastReview: entry.history[entry.history.length - 1],
    };
  }

  async getAllMetadata(): Promise<NoteMetadata[]> {
    return Object.entries(this.data).map(([filepath, entry]) => ({
      noteId: '',
      filepath,
      card: entry.card,
      lastReview: entry.history[entry.history.length - 1],
    }));
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}

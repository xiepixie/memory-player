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

  async saveReview(filepath: string, card: Card, log: ReviewLog): Promise<void> {
    if (!this.data[filepath]) {
      this.data[filepath] = { card, history: [] };
    }

    this.data[filepath].card = card;
    this.data[filepath].history.push(log);

    this.persist();
  }

  async getMetadata(filepath: string): Promise<NoteMetadata> {
    const entry = this.data[filepath];
    if (!entry) {
      return {
        filepath,
        card: createEmptyCard(),
        lastReview: undefined,
      };
    }

    return {
      filepath,
      card: entry.card,
      lastReview: entry.history[entry.history.length - 1],
    };
  }

  async getAllMetadata(): Promise<NoteMetadata[]> {
    return Object.entries(this.data).map(([filepath, entry]) => ({
      filepath,
      card: entry.card,
      lastReview: entry.history[entry.history.length - 1],
    }));
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}

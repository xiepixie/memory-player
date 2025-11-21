import { create } from 'zustand';
import { DataService, NoteMetadata } from '../lib/storage/types';
import { MockAdapter } from '../lib/storage/MockAdapter';
import { SupabaseAdapter } from '../lib/storage/SupabaseAdapter';
import { parseNote, ParsedNote } from '../lib/markdown/parser';
import { fsrs } from 'ts-fsrs';
import { useToastStore } from './toastStore';

export type ViewMode = 'library' | 'review' | 'test' | 'master' | 'edit' | 'summary';

interface AppState {
  dataService: DataService;
  initDataService: (type: 'mock' | 'supabase') => Promise<void>;

  rootPath: string | null;
  files: string[];
  fileMetadatas: Record<string, NoteMetadata>;

  setRootPath: (path: string) => void;
  setFiles: (files: string[]) => void;
  loadAllMetadata: () => Promise<void>;

  queue: string[];
  sessionTotal: number;
  sessionStats: {
      timeStarted: number;
      reviewedCount: number;
      ratings: Record<number, number>;
  };
  setQueue: (files: string[]) => void;
  startSession: () => void;

  currentFilepath: string | null;
  currentNote: ParsedNote | null;
  currentMetadata: NoteMetadata | null;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  loadNote: (filepath: string) => Promise<void>;
  saveReview: (rating: number) => Promise<void>;
  closeNote: () => void;

  loadSettings: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  dataService: new MockAdapter(),

  rootPath: null,
  files: [],
  fileMetadatas: {},
  queue: [],
  sessionTotal: 0,
  sessionStats: { timeStarted: 0, reviewedCount: 0, ratings: {} },

  currentFilepath: null,
  currentNote: null,
  currentMetadata: null,

  viewMode: 'library',

  initDataService: async (type) => {
    let service: DataService;
    if (type === 'supabase') {
       service = new SupabaseAdapter(
         import.meta.env.VITE_SUPABASE_URL || '',
         import.meta.env.VITE_SUPABASE_ANON_KEY || ''
       );
    } else {
       service = new MockAdapter();
    }
    await service.init();
    set({ dataService: service });
  },

  loadSettings: () => {
      const savedPath = localStorage.getItem('rootPath');
      if (savedPath) {
          set({ rootPath: savedPath });
      }
  },

  setRootPath: (path) => {
      localStorage.setItem('rootPath', path);
      set({ rootPath: path });
  },

  setFiles: (files) => {
      set({ files });
      get().loadAllMetadata();
  },

  loadAllMetadata: async () => {
      const { dataService } = get();
      const allTracked = await dataService.getAllMetadata();
      const map: Record<string, NoteMetadata> = {};
      allTracked.forEach(m => { map[m.filepath] = m; });
      set({ fileMetadatas: map });
  },

  setQueue: (queue) => set({ queue }),

  startSession: () => {
      const { queue, loadNote } = get();
      if (queue.length > 0) {
          set({
              sessionTotal: queue.length,
              sessionStats: {
                  timeStarted: Date.now(),
                  reviewedCount: 0,
                  ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }
              }
          });
          loadNote(queue[0]);
          set({ viewMode: 'test' });
          useToastStore.getState().addToast(`Starting session with ${queue.length} notes`, 'info');
      }
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  loadNote: async (filepath) => {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filepath);

      const parsed = parseNote(content);
      const metadata = await get().dataService.getMetadata(filepath);

      set({
        currentFilepath: filepath,
        currentNote: parsed,
        currentMetadata: metadata,
        viewMode: 'review'
      });
    } catch (e) {
      console.error("Failed to load note:", e);
      useToastStore.getState().addToast(`Failed to load note: ${filepath}`, 'error');
    }
  },

  saveReview: async (rating) => {
    const { currentFilepath, currentMetadata, dataService, queue, loadNote, loadAllMetadata, sessionStats } = get();
    if (!currentFilepath || !currentMetadata) return;

    const f = fsrs();
    const scheduling_cards = f.repeat(currentMetadata.card, new Date());
    const record = scheduling_cards[rating as 1|2|3|4];

    if (!record) {
        useToastStore.getState().addToast("Grading failed", 'error');
        return;
    }

    await dataService.saveReview(currentFilepath, record.card, record.log);

    set({
        sessionStats: {
            ...sessionStats,
            reviewedCount: sessionStats.reviewedCount + 1,
            ratings: { ...sessionStats.ratings, [rating]: (sessionStats.ratings[rating] || 0) + 1 }
        }
    });

    await loadAllMetadata();

    const currentIndex = queue.indexOf(currentFilepath);
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
        const nextFile = queue[currentIndex + 1];
        await loadNote(nextFile);
        set({ viewMode: 'test' });
    } else if (queue.length > 0) {
        set({ currentFilepath: null, currentNote: null, viewMode: 'summary' });
        useToastStore.getState().addToast("Session Complete!", 'success');
    } else {
        set({
            currentMetadata: { ...currentMetadata, card: record.card, lastReview: record.log }
        });
        set({ viewMode: 'library' });
        useToastStore.getState().addToast("Review saved", 'success');
    }
  },

  closeNote: () => set({ currentFilepath: null, currentNote: null, viewMode: 'library' })
}));

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

  recentVaults: string[];
  removeRecentVault: (path: string) => void;

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

  contentCache: Record<string, string>;
  
  loadNote: (filepath: string) => Promise<void>;
  saveReview: (rating: number) => Promise<void>;
  closeNote: () => void;

  loadSettings: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  dataService: new MockAdapter(),

  rootPath: null,
  recentVaults: [],
  files: [],
  fileMetadatas: {},
  contentCache: {},
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
    const savedRecents = localStorage.getItem('recentVaults');
    set({
      rootPath: savedPath,
      recentVaults: savedRecents ? JSON.parse(savedRecents) : []
    });
  },

  setRootPath: (path) => {
    localStorage.setItem('rootPath', path);
    const { recentVaults } = get();
    // Only add to recents if it's not the Demo Vault
    if (path !== 'DEMO_VAULT') {
      const updatedRecents = [path, ...recentVaults.filter(p => p !== path)].slice(0, 5);
      localStorage.setItem('recentVaults', JSON.stringify(updatedRecents));
      set({ rootPath: path, recentVaults: updatedRecents, contentCache: {} }); // Clear cache on vault switch
    } else {
      set({ rootPath: path, contentCache: {} });
    }
  },

  removeRecentVault: (path) => {
    const { recentVaults } = get();
    const updated = recentVaults.filter(p => p !== path);
    localStorage.setItem('recentVaults', JSON.stringify(updated));
    set({ recentVaults: updated });
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
      const { contentCache, rootPath } = get();
      let content = contentCache[filepath] || '';

      if (!content) {
        if (rootPath === 'DEMO_VAULT') {
            // Generate demo content
            const fileName = filepath.split('/').pop() || 'Demo';
            content = `---
title: ${fileName.replace('.md', '')}
tags: [demo, spaced-repetition]
---

# ${fileName.replace('.md', '')}

This is a **demo note** to showcase the Memory Player's spaced repetition features.

## What is Spaced Repetition?

{{c1::Spaced repetition}} is a learning technique that incorporates increasing intervals of time between subsequent review of previously learned material.

## Key Principles

- Review material ==just before you forget it==
- The spacing effect: distributed practice is more effective than massed practice
- Active recall strengthens memory

## Try it out!

What is the capital of France? {{c1::Paris}}

What is 2 + 2? {{c2::4}}

The ==Ebbinghaus== forgetting curve shows how information is lost over time when there is no attempt to retain it.

---

*This is a demo note. Start by grading your recall of the information above!*
`;
        } else {
            // Check if we're in Tauri environment
            if (typeof window.__TAURI__ === 'undefined') {
            useToastStore.getState().addToast("File system access is only available in the desktop app", 'error');
            return;
            }
            const { readTextFile } = await import('@tauri-apps/plugin-fs');
            content = await readTextFile(filepath);
        }
        
        // Update cache
        set(state => ({ contentCache: { ...state.contentCache, [filepath]: content } }));
      }

      const parsed = parseNote(content);
      const metadata = await get().dataService.getMetadata(filepath);

      const { viewMode } = get();
      const targetMode = ['edit', 'test', 'master'].includes(viewMode) ? viewMode : 'review';

      set({
        currentFilepath: filepath,
        currentNote: parsed,
        currentMetadata: metadata,
        viewMode: targetMode
      });
    } catch (e) {
      console.error("Failed to load note:", e);
      useToastStore.getState().addToast(`Failed to load note: ${filepath}`, 'error');
    }
  },

  saveReview: async (rating) => {
    const { currentFilepath, currentMetadata, dataService, queue, loadNote, fileMetadatas, sessionStats } = get();
    if (!currentFilepath || !currentMetadata) return;

    const f = fsrs();
    const scheduling_cards = f.repeat(currentMetadata.card, new Date());
    const record = scheduling_cards[rating as 1 | 2 | 3 | 4];

    if (!record) {
      useToastStore.getState().addToast("Grading failed", 'error');
      return;
    }

    await dataService.saveReview(currentFilepath, record.card, record.log);

    const newMetadata: NoteMetadata = {
        ...currentMetadata,
        card: record.card,
        lastReview: record.log
    };

    // Optimistic update of metadata map
    set({
      sessionStats: {
        ...sessionStats,
        reviewedCount: sessionStats.reviewedCount + 1,
        ratings: { ...sessionStats.ratings, [rating]: (sessionStats.ratings[rating] || 0) + 1 }
      },
      fileMetadatas: {
          ...fileMetadatas,
          [currentFilepath]: newMetadata
      }
    });

    // Removed: await loadAllMetadata();

    const currentIndex = queue.indexOf(currentFilepath);
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      const nextFile = queue[currentIndex + 1];
      await loadNote(nextFile);

      // viewMode is preserved by loadNote
    } else if (queue.length > 0) {
      set({ currentFilepath: null, currentNote: null, viewMode: 'summary' });
      useToastStore.getState().addToast("Session Complete!", 'success');
    } else {
      set({
        currentMetadata: newMetadata
      });
      set({ viewMode: 'library' });
      useToastStore.getState().addToast("Review saved", 'success');
    }
  },

  closeNote: () => set({ currentFilepath: null, currentNote: null, viewMode: 'library' })
}));

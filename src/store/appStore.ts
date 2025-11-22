import { create, StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { DataService, NoteMetadata, QueueItem, ReviewLog } from '../lib/storage/types';
import { MockAdapter } from '../lib/storage/MockAdapter';
import { SupabaseAdapter } from '../lib/storage/SupabaseAdapter';
import { fileSystem } from '../lib/services/fileSystem';
import { isTauri } from '../lib/tauri';
import { parseNote, ParsedNote } from '../lib/markdown/parser';
import { fsrs, createEmptyCard } from 'ts-fsrs';
import { useToastStore } from './toastStore';

export type ViewMode = 'library' | 'review' | 'test' | 'master' | 'edit' | 'summary';

interface AppState {
  dataService: DataService;
  initDataService: (type: 'mock' | 'supabase') => Promise<void>;

  syncMode: 'mock' | 'supabase';
  lastSyncAt: Date | null;
  pendingSyncCount: number;

  rootPath: string | null;
  files: string[];
  fileMetadatas: Record<string, NoteMetadata>;
  idMap: Record<string, string>;
  pathMap: Record<string, string>;

  recentVaults: string[];
  removeRecentVault: (path: string) => void;

  setRootPath: (path: string | null) => void;
  setFiles: (files: string[]) => void;
  loadAllMetadata: () => Promise<void>;
  loadReviewHistory: () => Promise<void>;
  reviewHistory: ReviewLog[]; // For Activity Grid

  queue: QueueItem[];
  sessionTotal: number;
  sessionIndex: number; // Track explicit position in queue
  sessionStats: {
    timeStarted: number;
    reviewedCount: number;
    ratings: Record<number, number>;
  };
  setQueue: (items: QueueItem[]) => void;
  startSession: () => void;

  currentFilepath: string | null;
  currentNote: ParsedNote | null;
  currentMetadata: NoteMetadata | null;
  currentClozeIndex: number | null;
  
  isGrading: boolean;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  theme: string;
  setTheme: (theme: string) => void;

  contentCache: Record<string, string>;
  
  loadNote: (filepath: string, targetClozeIndex?: number | null) => Promise<void>;
  saveReview: (rating: number) => Promise<boolean>;
  closeNote: () => void;

  loadSettings: () => void;
  updateLastSync: () => void;
}

type VaultSlice = Pick<
  AppState,
  | 'rootPath'
  | 'files'
  | 'fileMetadatas'
  | 'idMap'
  | 'pathMap'
  | 'recentVaults'
  | 'contentCache'
  | 'setRootPath'
  | 'setFiles'
  | 'loadAllMetadata'
  | 'loadSettings'
  | 'removeRecentVault'
>;

type HistorySlice = Pick<
  AppState,
  | 'reviewHistory'
  | 'loadReviewHistory'
  | 'pendingSyncCount'
>;

type SessionSlice = Pick<
  AppState,
  | 'queue'
  | 'sessionTotal'
  | 'sessionIndex'
  | 'sessionStats'
  | 'setQueue'
  | 'startSession'
  | 'saveReview'
  | 'isGrading'
>;

type NoteSlice = Pick<
  AppState,
  | 'currentFilepath'
  | 'currentNote'
  | 'currentMetadata'
  | 'currentClozeIndex'
  | 'loadNote'
  | 'closeNote'
>;

type UISlice = Pick<
  AppState,
  | 'viewMode'
  | 'setViewMode'
  | 'theme'
  | 'setTheme'
>;

type ServiceSlice = Pick<
  AppState,
  | 'dataService'
  | 'initDataService'
  | 'syncMode'
  | 'lastSyncAt'
  | 'updateLastSync'
>;

type AppStateCreator<T> = StateCreator<
  AppState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  T
>;

const createServiceSlice: AppStateCreator<ServiceSlice> = (set, get) => ({
  dataService: new MockAdapter(),

  syncMode: 'mock',
  lastSyncAt: null,

  initDataService: async (type) => {
    try {
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
      set({ dataService: service, syncMode: type, lastSyncAt: new Date() });
      await get().loadAllMetadata();
      await get().loadReviewHistory();
    } catch (e) {
      console.error("Failed to initialize data service", e);
      useToastStore.getState().addToast("Failed to initialize sync service", 'error');
    }
  },

  updateLastSync: () => {
    set({ lastSyncAt: new Date() });
  },
});

const createVaultSlice: AppStateCreator<VaultSlice> = (set, get) => ({
  rootPath: null,
  recentVaults: [],
  files: [],
  fileMetadatas: {},
  idMap: {},
  pathMap: {},
  contentCache: {},

  loadSettings: () => {
    const persistedStore = localStorage.getItem('app-store');
    if (persistedStore) {
      return;
    }

    const savedPath = localStorage.getItem('rootPath');
    const savedRecents = localStorage.getItem('recentVaults');
    const savedFiles = localStorage.getItem('cachedFiles');
    
    set({
      rootPath: savedPath,
      recentVaults: savedRecents ? JSON.parse(savedRecents) : [],
      files: savedFiles ? JSON.parse(savedFiles) : []
    });

    localStorage.removeItem('rootPath');
    localStorage.removeItem('recentVaults');
    localStorage.removeItem('cachedFiles');
  },

  setRootPath: (path) => {
    const { recentVaults } = get();
    // Only add to recents if it's not the Demo Vault and not null
    if (path && path !== 'DEMO_VAULT') {
      const updatedRecents = [path, ...recentVaults.filter(p => p !== path)].slice(0, 5);
      set({ rootPath: path, recentVaults: updatedRecents, contentCache: {} }); // Clear cache on vault switch
    } else {
      set({ rootPath: path, contentCache: {} });
    }
  },

  removeRecentVault: (path) => {
    const { recentVaults } = get();
    const updated = recentVaults.filter(p => p !== path);
    set({ recentVaults: updated });
  },

  setFiles: (files) => {
    set({ files });
    get().loadAllMetadata();
  },

  loadAllMetadata: async () => {
    try {
      const { dataService } = get();
      const allTracked = await dataService.getAllMetadata();
      const map: Record<string, NoteMetadata> = {};
      allTracked.forEach(m => { map[m.filepath] = m; });
      set({ fileMetadatas: map });
    } catch (e) {
      console.error("Failed to load metadata", e);
      useToastStore.getState().addToast("Failed to load metadata", 'error');
    }
  },
});

const createHistorySlice: AppStateCreator<HistorySlice> = (set, get) => ({
  reviewHistory: [],
  pendingSyncCount: 0,

  loadReviewHistory: async () => {
    const { dataService, syncMode } = get();
    // Load last 365 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 365);
    
    try {
        const history = await dataService.getReviewHistory(start, end);
        set({ 
          reviewHistory: history,
          pendingSyncCount: syncMode === 'mock' ? history.length : 0,
        });
    } catch (e) {
        console.error("Failed to load review history", e);
    }
  },
});

const createSessionSlice: AppStateCreator<SessionSlice> = (set, get) => ({
  queue: [],
  sessionTotal: 0,
  sessionIndex: 0,
  sessionStats: { timeStarted: 0, reviewedCount: 0, ratings: {} },
  isGrading: false,

  setQueue: (queue) => set({ queue }),

  startSession: () => {
    const { queue, loadNote } = get();
    if (queue.length > 0) {
      set({
        sessionTotal: queue.length,
        sessionIndex: 0,
        sessionStats: {
          timeStarted: Date.now(),
          reviewedCount: 0,
          ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }
        }
      });
      const first = queue[0];
      loadNote(first.filepath, first.clozeIndex);
      set({ viewMode: 'test' });
      useToastStore.getState().addToast(`Starting session with ${queue.length} cards`, 'info');
    }
  },

  saveReview: async (rating) => {
    const { currentFilepath, currentMetadata, currentClozeIndex, dataService, queue, loadNote, fileMetadatas, sessionStats, isGrading, sessionIndex } = get();
    if (!currentFilepath || !currentMetadata || isGrading) return false;

    // Allow rating only if we have a specific cloze in focus
    if (currentClozeIndex === null) {
         useToastStore.getState().addToast("No active cloze to grade", 'warning');
         return false;
    }

    // Safety check: if we are somehow out of bounds, don't proceed
    if (sessionIndex >= queue.length && queue.length > 0) {
        useToastStore.getState().addToast("Session already complete", 'info');
        return false;
    }

    set({ isGrading: true });

    try {
        const f = fsrs();
        // Get current card state or default to empty/new
        const currentCard = currentMetadata.cards[currentClozeIndex] || createEmptyCard();
        const scheduling_cards = f.repeat(currentCard, new Date());
        const record = scheduling_cards[rating as 1 | 2 | 3 | 4];

        if (!record) {
            useToastStore.getState().addToast("Grading failed", 'error');
            return false;
        }

        // Use noteId if available, fallback to filepath
        const noteId = currentMetadata.noteId || currentFilepath;
        await dataService.saveReview(noteId, currentClozeIndex, record.card, record.log);

        const newMetadata: NoteMetadata = {
            ...currentMetadata,
            cards: {
                ...currentMetadata.cards,
                [currentClozeIndex]: record.card
            },
            lastReviews: {
                ...currentMetadata.lastReviews,
                [currentClozeIndex]: record.log
            }
        };

        // Optimistic update of metadata map
        set({
            sessionStats: {
                ...sessionStats,
                reviewedCount: sessionStats.reviewedCount + 1,
                ratings: { ...sessionStats.ratings, [rating]: (sessionStats.ratings[rating] || 0) + 1 }
            },
            currentMetadata: newMetadata, // Update current view too!
            fileMetadatas: {
                ...fileMetadatas,
                [currentFilepath]: newMetadata
            },
            lastSyncAt: new Date(),
        });

        // Navigation Logic
        if (queue.length > 0) {
            const nextIndex = sessionIndex + 1;
            
            if (nextIndex < queue.length) {
                set({ sessionIndex: nextIndex });
                const nextItem = queue[nextIndex];
                await loadNote(nextItem.filepath, nextItem.clozeIndex);
            } else {
                // Session Complete
                set({ 
                    currentFilepath: null, 
                    currentNote: null, 
                    viewMode: 'summary',
                    sessionIndex: queue.length // Ensure it shows 100% or complete
                });
                useToastStore.getState().addToast("Session Complete!", 'success');
            }
        } else {
            // If not in a session (e.g. grading manually in Library mode), just stay or toast
            useToastStore.getState().addToast("Review saved", 'success');
        }
        return true;
    } catch (e) {
        console.error("Save review failed", e);
        useToastStore.getState().addToast("Failed to save review", 'error');
        return false;
    } finally {
        set({ isGrading: false });
    }
  },
});

const createNoteSlice: AppStateCreator<NoteSlice> = (set, get) => ({
  currentFilepath: null,
  currentNote: null,
  currentMetadata: null,
  currentClozeIndex: null,

  loadNote: async (filepath, targetClozeIndex = null) => {
    try {
      const { contentCache, rootPath } = get();
      let content = contentCache[filepath] || '';
      let noteId = get().pathMap[filepath];

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

### Retention Table

| 设计原则 (Design Principle) | 理论依据 (Theoretical Basis) | 命题目标 (Examiner's Goal)                |
| :---------------------- | :----------------------- | :------------------------------------ |
| **问题导向原则**              | 逆向工程范式                   | 确保题目能作为阅读的起点和导航图。                     |
| **认知负荷管理**              | 认知负荷理论                   | 将大任务分解为 5 个独立小任务，降低瞬时认知压力。            |
| **信息检索测试**              | 信息检索理论                   | 考察考生能否根据“查询指令”（题干）在“数据库”（文章）中高效、精准定位。 |
| **绝对答案唯一性**             | 选择题固有属性                  | 确保只有一个“出错概率最小”的最佳选项，同时设置三个逻辑上可证伪的干扰项。 |

---
*This is a demo note. Start by grading your recall of the information above!*
`;
        } else {
            // Check if we're in Tauri environment
            if (!isTauri()) {
            useToastStore.getState().addToast("File system access is only available in the desktop app", 'error');
            return;
            }
            
            // Use FileSystemService to ensure ID exists and read content
            const result = await fileSystem.ensureNoteId(filepath);
            content = result.content;
            noteId = result.id;

            // Update ID maps
            set(state => ({
                idMap: { ...state.idMap, [noteId!]: filepath },
                pathMap: { ...state.pathMap, [filepath]: noteId! }
            }));
        }
        
        // Update cache
        set(state => ({ contentCache: { ...state.contentCache, [filepath]: content } }));
      }

      const parsed = parseNote(content);
      // Pass noteId if available, otherwise fallback to filepath
      const metadata = await get().dataService.getMetadata(noteId || '', filepath);
      
      // Inject the real ID if we have it
      if (noteId) {
          metadata.noteId = noteId;
          
          // Update fileMetadatas with the discovered ID
          const { fileMetadatas } = get();
          if (fileMetadatas[filepath]) {
              set({
                  fileMetadatas: {
                      ...fileMetadatas,
                      [filepath]: { ...fileMetadatas[filepath], noteId }
                  }
              });
          }
      }

      const { viewMode } = get();
      const targetMode = ['edit', 'test', 'master'].includes(viewMode) ? viewMode : 'review';

      set({
        currentFilepath: filepath,
        currentNote: parsed,
        currentMetadata: metadata,
        currentClozeIndex: targetClozeIndex, // Set the focus
        viewMode: targetMode
      });
    } catch (e) {
      console.error("Failed to load note:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      useToastStore.getState().addToast(`Failed to load note: ${filepath}\n${errorMessage}`, 'error');
    }
  },

  closeNote: () => set({ currentFilepath: null, currentNote: null, currentClozeIndex: null, viewMode: 'library' }),
});

const createUISlice: AppStateCreator<UISlice> = (set) => ({
  viewMode: 'library',
  theme: 'winter',

  setViewMode: (mode) => set({ viewMode: mode }),
  setTheme: (theme) => set({ theme }),
});
export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createServiceSlice(...a),
        ...createVaultSlice(...a),
        ...createHistorySlice(...a),
        ...createSessionSlice(...a),
        ...createNoteSlice(...a),
        ...createUISlice(...a),
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          rootPath: state.rootPath,
          recentVaults: state.recentVaults,
          files: state.files,
          theme: state.theme,
        }),
      },
    ),
    { name: 'app-store' },
  ),
);


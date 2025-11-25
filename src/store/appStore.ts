import { create, StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { DataService, NoteMetadata, QueueItem, ReviewLog, Vault } from '../lib/storage/types';
import { MockAdapter } from '../lib/storage/MockAdapter';
import { fileSystem } from '../lib/services/fileSystem';
import { isTauri } from '../lib/tauri';
import { parseNote, ParsedNote } from '../lib/markdown/parser';
import { fsrs, createEmptyCard } from 'ts-fsrs';
import { useToastStore } from './toastStore';
import { getSupabaseClient } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';

export type ViewMode = 'library' | 'review' | 'test' | 'master' | 'edit' | 'summary';

export const MAX_CONTENT_CACHE_ENTRIES = 200;

// Track the most recent locally-initiated review so we can avoid
// duplicating toasts when the corresponding Supabase realtime
// update comes back for the same note/cloze.
let lastLocalReview: { noteId: string; clozeIndex: number; time: number } | null = null;
let currentReviewStartTime: number | null = null;

interface AppState {
  dataService: DataService;
  initDataService: (type: 'mock' | 'supabase') => Promise<void>;

  syncMode: 'mock' | 'supabase';
  currentUser: { id: string; email?: string | null } | null;
  lastSyncAt: Date | null;
  lastServerSyncAt: string | null; // ISO string for incremental sync cursor
  pendingNoteSyncs: Record<string, true>;
  markNoteSyncPending: (filepath: string) => void;
  markNoteSynced: (filepath: string) => void;
  clearAllPendingNoteSyncs: () => void;
  pendingSyncCount: number;
  signOut: () => Promise<void>;
  authCheckCounter: number;
  triggerAuthCheck: () => void;

  rootPath: string | null;
  files: string[];
  fileMetadatas: Record<string, NoteMetadata>;
  idMap: Record<string, string>;
  pathMap: Record<string, string>;

  recentVaults: string[];
  removeRecentVault: (path: string) => void;
  handleExternalCardUpdate: (row: any) => void;
  refreshMetadata: (filepath: string, noteIdOverride?: string) => Promise<void>;

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
    skippedCount: number;
  };
  setQueue: (items: QueueItem[]) => void;
  startSession: () => void;

  currentFilepath: string | null;
  currentNote: ParsedNote | null;
  currentMetadata: NoteMetadata | null;
  currentClozeIndex: number | null;

  isGrading: boolean;
  getSchedulingPreview: () => Record<number, { due: Date; interval: string }>;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  studyResourcesPrefetched: boolean;
  setStudyResourcesPrefetched: (prefetched: boolean) => void;

  theme: string;
  setTheme: (theme: string) => void;

  contentCache: Record<string, string>;

  loadNote: (filepath: string, targetClozeIndex?: number | null) => Promise<void>;
  saveReview: (rating: number) => Promise<boolean>;
  closeNote: () => void;

  loadSettings: () => void;
  updateLastSync: () => void;

  // --- Smart Queue & Actions ---
  fetchDueCards: (limit?: number) => Promise<void>;
  searchCards: (query: string) => Promise<any[]>;
  suspendCard: (cardId: string, isSuspended: boolean) => Promise<void>;
  resetCard: (cardId: string) => Promise<void>;

  vaults: Vault[];
  currentVault: Vault | null;
  loadVaults: () => Promise<void>;
  setCurrentVault: (vault: Vault | null) => void;
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
  | 'vaults'
  | 'currentVault'
  | 'setRootPath'
  | 'setFiles'
  | 'loadAllMetadata'
  | 'refreshMetadata'
  | 'loadSettings'
  | 'removeRecentVault'
  | 'handleExternalCardUpdate'
  | 'loadVaults'
  | 'setCurrentVault'
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
  | 'getSchedulingPreview'
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
  | 'studyResourcesPrefetched'
  | 'setStudyResourcesPrefetched'
  | 'theme'
  | 'setTheme'
>;

type ServiceSlice = Pick<
  AppState,
  | 'dataService'
  | 'initDataService'
  | 'syncMode'
  | 'currentUser'
  | 'lastSyncAt'
  | 'lastServerSyncAt'
  | 'pendingNoteSyncs'
  | 'markNoteSyncPending'
  | 'markNoteSynced'
  | 'clearAllPendingNoteSyncs'
  | 'updateLastSync'
  | 'signOut'
  | 'authCheckCounter'
  | 'triggerAuthCheck'
>;

type SmartQueueSlice = Pick<
  AppState,
  | 'fetchDueCards'
  | 'searchCards'
  | 'suspendCard'
  | 'resetCard'
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
  currentUser: null,
  lastSyncAt: null,
  lastServerSyncAt: null,
  pendingNoteSyncs: {},
  authCheckCounter: 0,

  initDataService: async (type) => {
    try {
      let service: DataService;
      let userInfo: { id: string; email?: string | null } | null = null;
      if (type === 'supabase') {
        const { SupabaseAdapter } = await import('../lib/storage/SupabaseAdapter');
        service = new SupabaseAdapter();
      } else {
        service = new MockAdapter();
      }
      await service.init();
      if (type === 'supabase') {
        const client = getSupabaseClient();
        if (client) {
          try {
            const { data } = await client.auth.getUser();
            if (data.user) {
              userInfo = { id: data.user.id, email: data.user.email };
            }
          } catch (e) {
            console.error('Failed to resolve current user after initDataService', e);
          }
        }
      }

      // Set core service state first so UI can render without waiting on network bootstrapping.
      set({ dataService: service, syncMode: type, currentUser: userInfo, lastSyncAt: new Date() });

      // Optimistic UI: If we have a session, assume we are logged in and verify in the background.
      if (type === 'supabase' && userInfo) {
        getSupabaseClient()?.auth.getUser().then(({ data, error }) => {
          if (error || !data.user) {
            console.warn("Session verification failed", error);
            if (get().currentUser) {
              get().signOut();
              useToastStore.getState().addToast("Session expired", 'warning');
            }
          }
        });
      }

      // Bootstrap heavy data (vaults, metadata, history) in the background so it
      // no longer blocks AuthGate/LCP. Errors are logged but don't prevent the
      // app shell from becoming interactive.
      (async () => {
        try {
          // Review history is independent of vault selection.
          const historyPromise = get().loadReviewHistory();

          try {
            await get().loadVaults();
            if (get().currentVault) {
              await get().loadAllMetadata();
            }
          } catch (bootError) {
            console.error("Failed to bootstrap vaults/metadata", bootError);
          }

          await historyPromise;
        } catch (bootError) {
          console.error("Failed to bootstrap initial data", bootError);
        }
      })();
    } catch (e) {
      console.error("Failed to initialize data service", e);
      useToastStore.getState().addToast("Failed to initialize sync service", 'error');
    }
  },

  updateLastSync: () => {
    set({ lastSyncAt: new Date() });
  },

  markNoteSyncPending: (filepath: string) => {
    const { syncMode } = get();
    if (syncMode !== 'supabase') return;
    set((state) => ({
      pendingNoteSyncs: { ...state.pendingNoteSyncs, [filepath]: true },
    }));
  },

  markNoteSynced: (filepath: string) => {
    set((state) => {
      if (!state.pendingNoteSyncs[filepath]) return state;
      const next = { ...state.pendingNoteSyncs };
      delete next[filepath];
      return { pendingNoteSyncs: next } as Partial<AppState>;
    });
  },

  clearAllPendingNoteSyncs: () => {
    set({ pendingNoteSyncs: {} });
  },

  signOut: async () => {
    try {
      const client = getSupabaseClient();
      if (client) {
        await client.auth.signOut();
      }
    } catch (e) {
      console.error('Failed to sign out from Supabase', e);
    }
    // Switch back to local-only mode
    await get().initDataService('mock');

    set((state) => ({
      authCheckCounter: state.authCheckCounter + 1,
      rootPath: null,
      files: [],
      currentFilepath: null,
      currentNote: null,
      currentMetadata: null,
      currentClozeIndex: null,
      viewMode: 'library',
      currentVault: null,
      contentCache: {},
    }));
  },

  triggerAuthCheck: () => {
    set((state) => ({ authCheckCounter: state.authCheckCounter + 1 }));
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
  vaults: [],
  currentVault: null,

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
    const { recentVaults, vaults, currentVault } = get();
    // Only add to recents if it's not the Demo Vault and not null
    if (path && path !== 'DEMO_VAULT') {
      const updatedRecents = [path, ...recentVaults.filter(p => p !== path)].slice(0, 5);
      const matchedVault = vaults.find(v => (v.config as any)?.rootPath === path) || currentVault;
      set({ rootPath: path, recentVaults: updatedRecents, contentCache: {}, currentVault: matchedVault || null });
    } else {
      set({ rootPath: path, contentCache: {}, currentVault });
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
      const { dataService, currentVault, lastServerSyncAt } = get();
      // If no vault selected, skip loading metadata to avoid full-table scan
      if (!currentVault) return;

      // Determine if incremental
      const after = lastServerSyncAt;
      
      const { items: remoteMetas, serverNow } = await dataService.getAllMetadata(currentVault.id, after);
      
      set((state) => {
        const next = { ...state.fileMetadatas };

        if (!after) {
            // Full Sync: We could replace, but to preserve local-only files, we merge.
            // Ideally, we should mark everything not in remoteMetas as deleted if it was supposed to be synced?
            // For safety in this phase, we just upsert.
        }

        remoteMetas.forEach((m: NoteMetadata) => {
            if (m.isDeleted) {
                // Soft delete: remove from local cache
                if (next[m.filepath]) {
                    delete next[m.filepath];
                }
                return;
            }

            const existing = next[m.filepath];
            if (!existing) {
                next[m.filepath] = m;
            } else {
                // Merge cards
                const mergedCards = { ...existing.cards };
                
                // If m.cards contains deleted cards (marked via isDeleted property), remove them
                Object.entries(m.cards).forEach(([idxStr, card]) => {
                     const idx = Number(idxStr);
                     if ((card as any).isDeleted) {
                         delete mergedCards[idx];
                     } else {
                         mergedCards[idx] = card;
                     }
                });
                
                next[m.filepath] = {
                    ...existing,
                    ...m, // Update note props
                    cards: mergedCards
                };
            }
        });

        return { 
            fileMetadatas: next,
            lastServerSyncAt: serverNow // Use server-provided timestamp
        };
      });
    } catch (e) {
      console.error("Failed to load metadata", e);
      if ((e as any)?.status === 401 || (e as any)?.code === 'PGRST301') {
         get().signOut();
         useToastStore.getState().addToast("Session expired", 'warning');
         return;
      }
      useToastStore.getState().addToast("Failed to load metadata", 'error');
    }
  },

  refreshMetadata: async (filepath, noteIdOverride) => {
    try {
      const { dataService, pathMap, fileMetadatas } = get();
      const existingMeta = fileMetadatas[filepath];
      const inferredNoteId =
        noteIdOverride ||
        pathMap[filepath] ||
        existingMeta?.noteId ||
        '';

      const meta = await dataService.getMetadata(inferredNoteId, filepath);
      const finalNoteId = meta.noteId || inferredNoteId;

      set((state) => {
        const files = state.files.includes(filepath)
          ? state.files
          : [...state.files, filepath];

        const nextIdMap = { ...state.idMap };
        const nextPathMap = { ...state.pathMap };

        if (finalNoteId) {
          nextIdMap[finalNoteId] = filepath;
          nextPathMap[filepath] = finalNoteId;
        }

        return {
          files,
          idMap: nextIdMap,
          pathMap: nextPathMap,
          fileMetadatas: {
            ...state.fileMetadatas,
            [filepath]: {
              ...meta,
              noteId: finalNoteId || meta.noteId,
            },
          },
        };
      });
    } catch (e) {
      console.error(`Failed to refresh metadata for ${filepath}`, e);
    }
  },

  loadVaults: async () => {
    try {
      const { dataService, rootPath } = get();
      const vaults = await dataService.getVaults();
      let currentVault = get().currentVault;
      if (!currentVault && rootPath) {
        currentVault = vaults.find(v => (v.config as any)?.rootPath === rootPath) || null;
      }
      if (!currentVault && vaults.length > 0) {
        currentVault = vaults[0];
      }
      set({ vaults, currentVault });
    } catch (e) {
      console.error("Failed to load vaults", e);
      if ((e as any)?.status === 401 || (e as any)?.code === 'PGRST301') {
          get().signOut();
          useToastStore.getState().addToast("Session expired", 'warning');
      }
    }
  },

  setCurrentVault: (vault) => {
    set({ currentVault: vault });
  },

  handleExternalCardUpdate: (row: any) => {
    const { idMap, fileMetadatas, currentFilepath, viewMode } = get();
    const filepath = idMap[row.note_id];

    if (!filepath) return; // Note not loaded or unknown

    const meta = fileMetadatas[filepath];
    if (!meta) return;

    const prevCard = meta.cards[row.cloze_index];

    // Construct updated card
    const updatedCard = {
      ...createEmptyCard(), // Start with defaults
      state: row.state,
      due: new Date(row.due),
      stability: row.stability,
      difficulty: row.difficulty,
      elapsed_days: row.elapsed_days,
      scheduled_days: row.scheduled_days,
      reps: row.reps,
      lapses: row.lapses,
      last_review: row.last_review ? new Date(row.last_review) : undefined
    };

    const fsrsChanged = !prevCard ||
      prevCard.state !== updatedCard.state ||
      prevCard.reps !== updatedCard.reps ||
      prevCard.lapses !== updatedCard.lapses ||
      prevCard.stability !== updatedCard.stability ||
      prevCard.difficulty !== updatedCard.difficulty ||
      (prevCard.due?.getTime() ?? 0) !== (updatedCard.due?.getTime() ?? 0) ||
      (prevCard.last_review?.getTime() ?? 0) !== (updatedCard.last_review?.getTime() ?? 0);

    const newMeta = {
      ...meta,
      cards: {
        ...meta.cards,
        [row.cloze_index]: updatedCard
      }
    };

    // Update Store
    const updates: Partial<AppState> = {
      fileMetadatas: {
        ...fileMetadatas,
        [filepath]: newMeta
      }
    };

    // If this is the currently open note, update it too
    if (currentFilepath === filepath) {
      updates.currentMetadata = newMeta;
    }

    set(updates);

    // In Edit mode we still want fresh FSRS state in the store,
    // but showing detailed review toasts for every external update
    // becomes noisy (e.g. after saving a note and syncing).
    // Quietly return in that case.
    if (viewMode === 'edit') {
      return;
    }

    const isSelfReview = !!(
      lastLocalReview &&
      row.note_id === lastLocalReview.noteId &&
      row.cloze_index === lastLocalReview.clozeIndex &&
      Date.now() - lastLocalReview.time < 5000
    );

    // For self-initiated reviews we already showed a detailed toast
    // when the user graded the card. Still update state, but skip
    // repeating the FSRS info here.
    if (isSelfReview) {
      return;
    }

    if (fsrsChanged) {
      const noteName = filepath.split(/[\\/]/).pop() || filepath;

      let dueText: string | null = null;
      if (row.due) {
        const dueDate = new Date(row.due);
        if (!isNaN(dueDate.getTime())) {
          dueText = formatDistanceToNow(dueDate, { addSuffix: true });
        }
      }

      const state = typeof row.state === 'number' ? row.state : undefined;
      let stateLabel = '';
      if (state === 0) stateLabel = 'New';
      else if (state === 1) stateLabel = 'Learning';
      else if (state === 2) stateLabel = 'Review';
      else if (state === 3) stateLabel = 'Relearning';

      const parts: string[] = [];
      parts.push(`${noteName} c${row.cloze_index}`);
      if (stateLabel) parts.push(stateLabel);
      if (dueText) parts.push(`next ${dueText}`);
      if (typeof row.stability === 'number') {
        parts.push(`stability ${row.stability.toFixed(2)}`);
      }

      const message = `Review state updated: ${parts.join(' • ')}`;
      useToastStore.getState().addToast(message, 'info');
    } else {
      useToastStore.getState().addToast(`External update: ${filepath.split('/').pop()}`, 'info');
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
  sessionStats: { timeStarted: 0, reviewedCount: 0, ratings: {}, skippedCount: 0 },
  isGrading: false,

  getSchedulingPreview: () => {
    const { currentMetadata, currentClozeIndex, currentVault } = get();
    if (!currentMetadata || currentClozeIndex === null) return {};

    try {
      const currentCard = currentMetadata.cards[currentClozeIndex] || createEmptyCard();
      const params = currentVault?.config?.fsrsParams; // Use vault-specific params if available
      const f = fsrs(params);
      
      const now = new Date();
      const scheduling_cards = f.repeat(currentCard, now);
      
      const result: Record<number, { due: Date; interval: string }> = {};
      
      ([1, 2, 3, 4] as const).forEach((rating) => {
        const record = scheduling_cards[rating];
        if (record) {
           const dueDate = new Date(record.card.due);
           // Calculate human-readable interval
           let interval = formatDistanceToNow(dueDate);
           // Shorten for UI (e.g., "3 days" -> "3d", "less than a minute" -> "now")
           interval = interval
             .replace('less than a minute', 'now')
             .replace(' minutes', 'm')
             .replace(' minute', 'm')
             .replace(' hours', 'h')
             .replace(' hour', 'h')
             .replace(' days', 'd')
             .replace(' day', 'd')
             .replace(' months', 'mo')
             .replace(' month', 'mo')
             .replace(' years', 'y')
             .replace(' year', 'y')
             .replace('about ', '');
             
           result[rating] = { due: dueDate, interval };
        }
      });
      
      return result;
    } catch (e) {
      console.error("Failed to calculate scheduling preview", e);
      return {};
    }
  },

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
          ratings: { 1: 0, 2: 0, 3: 0, 4: 0 },
          skippedCount: 0,
        }
      });
      const first = queue[0];
      loadNote(first.filepath, first.clozeIndex);
      set({ viewMode: 'test' });
      useToastStore.getState().addToast(`Starting session with ${queue.length} cards`, 'info');
    }
  },

  saveReview: async (rating) => {
    const { currentFilepath, currentMetadata, currentClozeIndex, dataService, queue, loadNote, fileMetadatas, sessionStats, isGrading, sessionIndex, currentVault } = get();
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
      const params = currentVault?.config?.fsrsParams;
      const f = fsrs(params);
      // Get current card state or default to empty/new
      const currentCard = currentMetadata.cards[currentClozeIndex] || createEmptyCard();
      const scheduling_cards = f.repeat(currentCard, new Date());
      const record = scheduling_cards[rating as 1 | 2 | 3 | 4];

      if (!record) {
        useToastStore.getState().addToast("Grading failed", 'error');
        return false;
      }

      // Immediate FSRS-based feedback (label, next due, stability)
      let ratingLabel = '';
      if (rating === 1) ratingLabel = 'Again';
      else if (rating === 2) ratingLabel = 'Hard';
      else if (rating === 3) ratingLabel = 'Good';
      else if (rating === 4) ratingLabel = 'Easy';

      let dueText: string | null = null;
      const dueDate = record.card.due ? new Date(record.card.due as any) : null;
      if (dueDate && !isNaN(dueDate.getTime())) {
        dueText = formatDistanceToNow(dueDate, { addSuffix: true });
      }

      const feedbackParts: string[] = [];
      if (ratingLabel) feedbackParts.push(ratingLabel);
      if (dueText) feedbackParts.push(`next ${dueText}`);
      if (typeof record.card.stability === 'number') {
        feedbackParts.push(`stability ${record.card.stability.toFixed(2)}`);
      }

      if (feedbackParts.length > 0) {
        const toastType = rating === 1 ? 'error' : rating === 2 ? 'warning' : rating === 3 ? 'info' : 'success';
        useToastStore.getState().addToast(feedbackParts.join(' • '), toastType as any);
      }

      // Use noteId if available, fallback to filepath
      const noteId = currentMetadata.noteId || currentFilepath;

      const now = Date.now();
      const reviewStart = currentReviewStartTime || sessionStats.timeStarted || now;
      const durationMs = Math.max(0, now - reviewStart);

      // Mark this as the latest local review to avoid duplicate
      // realtime toasts for the same note/cloze.
      lastLocalReview = { noteId, clozeIndex: currentClozeIndex, time: now };

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

      // Optimistic update of metadata map - Perform State Update IMMEDIATELY
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

      // Background Network Call (Fire-and-forget)
      dataService.saveReview(noteId, currentClozeIndex, record.card, record.log, durationMs)
        .catch(e => {
           console.error("Background save review failed", e);
           useToastStore.getState().addToast("Review sync failed (saved locally)", 'warning');
        });

      // Navigation Logic
      const inSession = sessionStats.timeStarted > 0;

      if (inSession && queue.length > 0) {
        const nextIndex = sessionIndex + 1;

        if (nextIndex < queue.length) {
          set({ sessionIndex: nextIndex });
          const nextItem = queue[nextIndex];
          // Fire-and-forget load of the next card
          loadNote(nextItem.filepath, nextItem.clozeIndex);
        } else {
          // Session Complete
          set({
            currentFilepath: null,
            currentNote: null,
            viewMode: 'summary',
            sessionIndex: queue.length 
          });
          useToastStore.getState().addToast("Session Complete!", 'success');
        }
      } else {
        // If not in an active session (e.g. grading manually in Library mode), just stay or toast
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


// --- loadNote Helpers ---

function getDemoContent(fileName: string): string {
  return String.raw`---
title: ${fileName.replace('.md', '')}
tags: [demo, math, calculus]
---

### **一、 导数的核心概念：点态性质 vs. 极限性质**

相关笔记: [[极限计算]] | [[函数连续]] | [[零点定理与中值定理]] | [[微积分应用]] | [[Documents/I.P.A.R.A/学习领域/归档/数学一/高等数学/无穷级数]]

在讨论导数时，区分一个点的导数值和导函数的极限值至关重要。

1.  **右导数 $f'_+(x_0)$**
    *   **定义**: {{c1::$f'_+(x_0) = \lim_{h \\to 0^+} \\frac{f(x_0+h) - f(x_0)}{h}$}}
    *   **本质**: 这是一个关于**原函数 $f(x)$** 在**点 $x_0$** 的**点态性质**。它描述的是函数图像在点 $(x_0, f(x_0))$ 处**右侧切线**的斜率，其计算依赖于 $f(x_0)$ 的值。

2.  **导数的右极限 $\lim_{x \to x_0^+} f'(x)$**
    *   **定义**: $\lim_{x \to x_0^+} f'(x)$
    *   **本质**: 这是一个关于**导函数 $f'(x)$** 在**点 $x_0$** 的**极限性质**。它描述的是 $x_0$ **右邻域**内各点切线斜率的变化趋势，其计算与 $f(x_0)$ 的值无关。

$\lim_{x \to x_0} f'(x)$不存在只说明该点处求导法则不成立,需要回归定义求该点处导数值.

**关键关系：导数极限定理**

*   **定理内容**: 设函数 $f(x)$ 在 $x_0$ 处**连续**，在 $x_0$ 的某个去心邻域内可导，且导函数的极限 $\lim_{x \to x_0} f'(x)$ 存在并等于 $A$，则 $f(x)$ 在 $x_0$ 处可导，且 $f'(x_0) = A$。
*   **证明核心**: 该定理的证明依赖于**拉格朗日中值定理**，这也揭示了为何**连续性是不可或缺的前提**。

**重要反例**

*   **可导但导函数不连续**: 函数 $f(x) = \begin{cases} x^2 \sin(\frac{1}{x}), & x \neq 0 \\ 0, & x = 0 \end{cases}$ 在 $x_0=0$ 处。
    *   $f'(0) = 0$ (存在)。
    *   $\lim_{x \to 0} f'(x) = \lim_{x \to 0} (2x \sin(\frac{1}{x}) - \cos(\frac{1}{x}))$ (不存在)。
    *   **启示**: “在某点可导”**不**蕴含“导函数在该点连续”。

*   **导函数极限存在但不可导**: 函数 $f(x) = \begin{cases} x^2, & x > 0 \\ 1, & x \le 0 \end{cases}$ 在 $x_0=0$ 处。
    *   $\lim_{x \to 0} f'(x) = 0$ (存在)。
    *   但函数在 $x_0=0$ 不连续，因此**必不可导**。
    *   **启示**: 使用导数极限定理时，**必须先检验连续性**。
---

#### **导数概念的深度解析与应用**

##### **工具一：导数定义的本质——计算、验证与“防伪”**

**1.1 核心算法：四步结构匹配法 (用于计算)**

任何基于定义的导数计算问题，本质都是代数上的“变形记”，目标是匹配上标准结构。

* **三大定义式:**
    1.  **点导数 ($x \to x_0$形式):** $f'(x_0) = \lim_{x \to x_0} \frac{f(x) - f(x_0)}{x - x_0}$
    2.  **点导数 ($\Delta x \to 0$形式):** $f'(x_0) = \lim_{\Delta x \to 0} \frac{f(x_0 + \Delta x) - f(x_0)}{\Delta x}$
    3.  **导函数:** $f'(x) = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}$

* **算法流程:**
    1.  **定点:** 观察极限过程，确定函数自变量最终趋近的值 $x_0$。
    2.  **配凑分子:** 通过加减 $f(x_0)$ 构造出 $f(\cdot) - f(x_0)$ 的形式。
    3.  **配凑分母:** 变形分母，使其与分子中自变量的增量完全一致。
    4.  **分离计算:** 将极限拆分为一个标准的导数定义式和一个常规极限。

**1.2 “防伪”原则：识别伪定义 (用于判断)**

许多极限形式看似导数，却不是可导的充要条件。必须严格审查其结构。

* **“一动一不动”原则:** 标准定义是“动点”趋近于“不动点”。任何涉及**两个对称或不对称动点**的极限，都可能因函数值的相互抵消而“跨过”奇点，掩盖不可导的事实。

* **典型“伪定义”：对称导数**
    * **定义:** $f_s'(x_0) = \lim_{h\to 0} \frac{f(x_0+h) - f(x_0-h)}{2h}$
    * **辨析:**
        * **可导 $\implies$ 对称导数存在**: 若 $f'(x_0)$ 存在，则 $f_s'(x_0) = f'(x_0)$。
        * **对称导数存在 $\implies$ 可导 (错误!)**:
    * **经典反例:** 对于 $f(x) = |x|$ 在 $x_0 = 0$ 处，
        $$f_s'(0) = \lim_{h\to 0} \frac{|h| - |-h|}{2h} = \lim_{h\to 0} \frac{0}{2h} = 0$$
        对称导数存在，但函数显然不可导。

##### **工具二：绝对值函数可导性的完整分类与判定**

绝对值函数的可导性问题有三种基本类型，必须清晰辨别。

**类型 A：乘积型 $g(x) = f(x)|x-a|$ 与高阶“抹平”**

* **基本法则:** $g(x) = f(x)|x-a|$ 在 $x=a$ 点可导的充要条件是 $f(a)=0$ (假定 $f(x)$ 在 $a$ 点连续)。
* **深度原理 (零点阶数平滑准则):** $|x-a|$ 的“尖点”性质，可以被一个更高阶的无穷小因子“抹平”。
* **模型结论:** 函数 $g_k(x) = (x-a)^k |x-a|$ ($k$为非负整数) 在点 $x=a$ 处 **$k$ 阶可导**，但 **$k+1$ 阶不可导**。

**类型 B：外复合型 $g(x) = |f(x)|$**

* **法则:** 设 $f(x)$ 在 $x=a$ 处可导且 $f(a)=0$。则 $g(x) = |f(x)|$ 在 $x=a$ 处可导的充要条件是 $f'(a)=0$。
* **代数本质:** $g'(a)$ 的左右导数分别为 $|f'(a)|$ 和 $-|f'(a)|$。两者相等的充要条件是 $f'(a)=0$。
* **几何直观:** 图像在 $x$ 轴的零点是**相切**($f'(a)=0$)则可导，是**斜穿**($f'(a)\neq0$)则形成尖点而不可导。

**类型 C：内复合型 $g(x) = f(|x|)$**

* **法则 (一般性充要条件):** 函数 $g(x) = f(|x|)$ 在 $x=0$ 处可导的充要条件是 **$f(x)$ 在 $x=0$ 处的右导数存在且为零**，即 $f'_+(0) = 0$。
* **推导:**
    * 右导数: $g'_+(0) = \lim_{h \to 0^+} \frac{f(|h|) - f(0)}{h} = \lim_{h \to 0^+} \frac{f(h) - f(0)}{h} = f'_+(0)$。
    * 左导数: $g'_-(0) = \lim_{h \to 0^-} \frac{f(|h|) - f(0)}{h} = \lim_{h \to 0^-} \frac{f(-h) - f(0)}{h} = -f'_+(0)$。
    * 可导 $\iff g'_+(0) = g'_-(0) \iff f'_+(0) = -f'_+(0) \iff f'_+(0) = 0$。
* **常用推论:** 如果已知 $f(x)$ 在 $x=0$ 处**可导**，则条件简化为 $f'(0)=0$。
* **几何直观:** $g(x)=f(|x|)$ 的图像是将 $f(x)$ 在 $y$ 轴右侧的部分保留，并翻折到左侧，形成一个**偶函数**。任何在原点可导的偶函数，其切线必为水平，即导数为零。

##### **工具三：复合函数不可导点的“排查清单”**

对于复合函数 $h(x)=g(f(x))$，其不可导点有两个来源。

* **链式法则:** $h'(x) = g'(f(x)) \cdot f'(x)$
* **排查清单:**
    1.  **内函数传递:** 找到所有使 $f'(x)$ 不存在的点 $x_i$。
    2.  **外函数生成:**
        a. 找到所有使外函数 $g'(u)$ 不存在的点 $u_j$。
        b. 对每一个 $u_j$，解方程 $f(x) = u_j$，求出所有对应的 $x_k$。
* **结论:** 最终的不可导点集合是 $\{x_i\} \cup \{x_k\}$。

**工具三：复合函数不可导点的“排查清单”**

对于复合函数 $h(x)=g(f(x))$，其不可导点有两个来源。

* **链式法则:** $h'(x) = g'(f(x)) \cdot f'(x)$
* **排查清单:**
    1.  **内函数传递:** 找到所有使内函数 $f'(x)$ 不存在的点 $x_i$。
    2.  **外函数生成:**
        a. 找到所有使外函数 $g'(u)$ 不存在的点 $u_j$ (即外函数的不可导点)。
        b. 对每一个 $u_j$，解方程 $f(x) = u_j$，求出所有对应的 $x_k$。
* **结论:** 最终的不可导点集合是 $\{x_i\} \cup \{x_k\}$。
* **经典案例:** $h(x)=\arcsin\left(\frac{2x}{1+x^2}\right)$
    1.  **内函数排查:** $f(x)=\frac{2x}{1+x^2}$ 处处可导，$\{x_i\}$ 为空集。
    2.  **外函数排查:** $g(u) = \arcsin(u)$ 在 $u = \pm 1$ 处不可导。解方程 $\frac{2x}{1+x^2} = \pm 1$，得到 $x = \pm 1$。
    3.  **结论:** 不可导点为 $x = \pm 1$。

##### **工具四：点性质与邻域性质的“单向桥梁”定理**

这是处理导数相关命题时最核心的逻辑工具，关键在于审查推理方向。

**4.1 单向桥梁定理**

* **定理内容:** 若函数 $f(x)$ 在 $x_0$ 点连续，在其去心邻域 $U^\circ(x_0, \delta)$ 内可导，并且导函数的极限 $\lim_{x \to x_0} f'(x)$ 存在且等于 $A$，则函数 $f(x)$ 在 $x_0$ 点必定可导，且 $f'(x_0) = A$。
* **桥梁的单向性:**
    1.  **邻域 $\implies$ 点 (此路通):** $\lim_{x \to x_0} f'(x) = A \implies f'(x_0) = A$。导函数在邻域的极限信息，可以**确定**该点的导数值。
    2.  **点 $\implies$ 邻域 (此路不通!)**: $f'(x_0) = A \not\implies \lim_{x \to x_0} f'(x) = A$。该点的导数值，**不能**反推导函数在该点的极限存在。这等价于说，**$f(x)$ 可导不意味着 $f'(x)$ 连续**。

**4.2 推理审查准则**

在判断从“点性质”到“邻域性质”的命题时（如由 $f'(x_0)>0$ 推出邻域单调性），必须进行严格审查。

* **核心问题:** 这个推理是否需要一座从“点”通往“邻域”的桥？我是否有这张“通行证”？
* **“通行证”是什么？** 就是 **“导函数 $f'(x)$ 在 $x_0$ 点连续”** 这一条件。
* **决策流程:**
    * **若有“通行证”**: 推理成立。因为 $f'(x)$ 连续，则 $\lim_{x \to x_0} f'(x) = f'(x_0) > 0$。根据极限的保号性，存在一个邻域，在该邻域内 $f'(x) > 0$，故函数单调递增。
    * **若无“通行证”**: 推理**不成立**。该命题为假，可构造 $f(x) = x_0 + 2(x-x_0)^2\sin(\frac{1}{x-x_0}) + (x-x_0)$ 类型的函数作为反例。

### **二、 分段函数的求导策略**

对于分段函数，求导的关键在于如何处理**分段点**。

**1. 在非分段点处求导**
直接对该点所在区间的函数表达式使用基本求导法则即可。

**2. 在分段点 $x_0$ 处求导**
必须遵循严谨的步骤：

**第一步：检查连续性 (核心前提)**
计算左极限 $\lim_{x\to x_0^-} f(x)$、右极限 $\lim_{x\to x_0^+} f(x)$ 与函数值 $f(x_0)$。
*   若三者不全相等，则函数在 $x_0$ 处**不连续**，从而**必不可导**。
*   若三者相等（函数连续），则函数**可能**可导，进入第二步。

**第二步：选择方法求导**

*   **方法一：导数定义法 (根本方法)**
    此方法最基础、最可靠。分别计算左右导数：
    *   **左导数**: $f'_-(x_0) = \lim_{h\to 0^-} \frac{f(x_0+h) - f(x_0)}{h}$
    *   **右导数**: $f'_+(x_0) = \lim_{h\to 0^+} \frac{f(x_0+h) - f(x_0)}{h}$
    *   **结论**: 当且仅当 $f'_-(x_0) = f'_+(x_0)$ 且均为有限值时，函数可导，且 $f'(x_0)$ 等于该值。

*   **方法二：导数极限定理 (条件捷径)**
    此方法在满足前提时非常快捷。在确认函数连续后，计算导函数在 $x_0$ 点的左右极限：
    *   $L = \lim_{x\to x_0^-} f'(x)$
    *   $R = \lim_{x\to x_0^+} f'(x)$
    *   **结论**: 若 $L=R$ 且为有限值，则 $f'(x_0)$ 存在且等于该值。否则 $f'(x_0)$ 不存在。

### **三、导数计算：核心思想与战略工具箱**

#### **第一部分：三大核心思想 (The Core Principles)**

1.  **连续性是可导性的基石 (Continuity is the Bedrock of Differentiability)**

      * **法则**: 函数在一点可导，那么它在该点必然连续。反之不成立。
      * **推论**: 在处理任何点的可导性问题时（尤其是分段点），必须**首先检验其连续性**。若不连续，则一定不可导，无需后续计算。

2.  **导数的几何本质 (The Geometric Essence of the Derivative)**

      * **意义**: 导数 $f'(x_0)$ 是函数图像在点 $(x_0, f(x_0))$ 处切线的斜率。
      * **应用**: 许多看似复杂的代数条件都有直观的几何对应。
          * $f'(x) = 0$ $\iff$ 切线水平。
          * $\frac{1}{f'(x)} \to \infty$ $\iff$ 切线垂直 (在反函数中)。
          * $F_y = 0$ $\iff$ 切线垂直 (在隐函数中)。

3.  **链式法则是万法之源 (The Chain Rule is the Source of All Methods)**

      * **核心**: 几乎所有高级求导技巧（隐函数、反函数、参数方程等）都是链式法则在不同情境下的变形与应用。深刻理解链式法则，才能融会贯通。

#### **第二部分：求导战略工具箱 (The Strategic Toolbox)**

| #    | 工具名称 (Tool)                          | 适用情形 (Applicable Situation)                                  | 核心公式/方法 (Core Formula/Method)                                                                                                                        | 关键注记 (Critical Notes)                                            |
| :---- | :----------------------------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **1** | **复合函数求导 (Chain Rule)**              | 函数嵌套结构，如 $y = f(g(x))$。                                      | $\frac{dy}{dx} = f'(g(x)) \cdot g'(x)$                                                                                                               | 准确识别“内外层”函数是关键。由外向内，逐层求导。                                        |
| **2** | **分段函数求导 (Piecewise Func.)**         | 函数在不同定义域有不同表达式。                                              | **区间内**：按对应表达式求导。<br>**分段点**：必须使用导数定义 $\lim_{x \to x_0} \frac{f(x) - f(x_0)}{x - x_0}$。                                                              | **第一步永远是检验分段点的连续性！** 左右导数相等是可导的必要非充分条件。                          |
| **3** | **隐函数求导 (Implicit Diff.)**           | 由方程 $F(x, y) = 0$ 定义，不易或无法显化 $y$。                            | **方法**：方程两边对 $x$ 求导，视 $y$ 为 $y(x)$。<br>**公式**：$\frac{dy}{dx} = -\frac{F_x}{F_y}$                                                                     | 警惕 $F_y=0$ 的点，其几何意义为**垂直切线**。                                    |
| **4** | **反函数求导 (Inverse Func.)**            | 已知 $y=f(x)$ 及其导数，求反函数 $x=g(y)$ 的导数。                          | $\frac{dx}{dy} = \frac{1}{dy/dx}$  即  $g'(y) = \frac{1}{f'(x)}$<br>$\frac{d^2x}{dy^2} = \frac{d}{dy} ( \frac{1}{f'(x)} )= -\frac{f''(x)}{(f'(x))^3}$ | 警惕 $f'(x)=0$ 的点，其几何意义为原函数**水平切线**，反函数**垂直切线**。                   |
| **5** | **对数求导法 (Logarithmic Diff.)**        | ① 幂指函数 $y=u(x)^{v(x)}$ <br> ② 复杂的连乘、连除、开方。                   | **步骤**：<br>1. 两边取自然对数 $\ln y = \dots$<br>2. 两边对 $x$ 求导。<br>3. 解出 $y'$。                                                                               | 结果中含有 $y'/y$，切记最后要将 $y$ 乘回表达式右侧。                                 |
| **6** | **参数方程求导 (Parametric Diff.)**        | 曲线由参数方程 $\begin{cases} x = x(t) \\ y = y(t) \end{cases}$ 给出。参见 [[函数极限应用]]。 | **一阶**：$\frac{dy}{dx} = \frac{dy/dt}{dx/dt}$ <br> **二阶**：$\frac{d^2y}{dx^2} = \frac{\frac{d}{dt}(\frac{dy}{dx})}{\frac{dx}{dt}}$                     | 二阶导数是最大的易错点！分子是对**一阶导数**这个整体关于 $t$ 求导，分母**依然是** $\frac{dx}{dt}$。 |
| **7** | **变限积分求导 (Variable-Limit Integral)** | 函数由一个变限积分定义。参见 [[Documents/I.P.A.R.A/学习领域/归档/数学一/高等数学/积分计算]]、[[微积分应用]]。                                                 | **Leibniz法则**：<br>$\frac{d}{dx} \int_{\psi(x)}^{\phi(x)} f(t) dt = f(\phi(x))\phi'(x) - f(\psi(x))\psi'(x)$                                          | 这是微积分基本定理与链式法则的结合。当上下限为常数或 $x$ 时，是其特殊情况。                         |

#### **第三部分：统一解题框架 (A Unified Problem-Solving Framework)**

面对任何求导问题，建议遵循以下思考路径：

1.  **观察结构 (Observe)**：首先判断函数属于上述工具箱中的哪一种或哪几种的组合。是复合？是隐函数？还是参数方程？
2.  **选择工具 (Select)**：根据结构，选取最主要的求导工具。
3.  **应用法则 (Apply)**：执行求导运算。在此过程中，时刻牢记**链式法则**，尤其是在处理复合结构时。
4.  **核查细节 (Verify)**：
      * 若是分段函数，是否检查了分段点的**连续性**？
      * 若是隐函数/反函数，是否注意到了分母为零的**特殊点**？
      * 若是参数方程，二阶导数的公式是否使用正确？
      * 最终结果是否可以化简？

#### **第四部分：高阶导数值的计算**

##### **①：求高阶导数值 $f^{(n)}(a)$**

当目标是计算函数在某一点 $a$ 的高阶导数值时，我们通常应避免先求出通用的导数表达式 $f^{(n)}(x)$ 再代入 $a$。以下是更高效的策略：

**策略一：【理论基石】泰勒级数法**
* **核心思想**: $f^{(n)}(a) = n! \cdot c_n$，其中 $c_n$ 是 $f(x)$ 在 $x=a$ 处泰勒展开式中 $(x-a)^n$ 项的系数。任何复杂的函数，只要能通过“预处理”拆解成我们熟悉的几个基本函数（$e^u, \sin u, \cos u, \ln(1\pm u), \frac{1}{1\mp u}, (1+u)^\alpha$）的线性组合，就能进而求得 $f^{(n)}(a)$。
* **【必要前置】预处理技巧**:
**A. 代数预处理 (Algebraic Pre-processing)**
    1.  **有理函数拆分**:
        * 若分母多项式 $\Delta > 0$（有实数根），则使用**部分分式分解**。
            * 示例: $\frac{1}{x^2-1} = \frac{1}{2}(\frac{1}{x-1} - \frac{1}{x+1})$
        * 若分母多项式 $\Delta \le 0$（无实数根或为特殊形式），则利用重要公式，如**等比数列和或立方差/和公式**。
            * 示例: $f(x) = \frac{1-2x}{1-(2x)^3} = \frac{1-2x}{(1-2x)(1+2x+4x^2)}$ 这种思路是错的，应看成 $\frac{1}{1-(2x)^3} - \frac{2x}{1-(2x)^3}$，然后利用 $\frac{1}{1-u} = \sum u^n$ 展开
    2.  **对数函数拆分**:
        * 利用对数运算法则 $\ln(AB) = \ln A + \ln B$ 和 $\ln(A/B) = \ln A - \ln B$。
            * 示例: $f(x) = \ln\frac{1-x^3}{1-x} = \ln(1-x^3) - \ln(1-x)$，然后利用 $\ln(1-u) = -\sum \frac{u^n}{n}$ 展开。

**B. 三角与反三角恒等变形**

1.  **三角函数**: 使用**降幂、积化和差、和差化积**等公式，消除乘积与高次幂。
2.  **反三角函数**: 熟悉并利用其和差角公式，将复杂的复合函数拆分为基本函数。
    * **核心公式:
        * **差角**: $\arctan x - \arctan y = \arctan\left(\frac{x-y}{1+xy}\right), \quad (xy \neq -1)$
        * **和角**: $\arctan x + \arctan y = \arctan\left(\frac{x+y}{1-xy}\right), \quad (xy \neq 1)$

**C. 微分/积分预处理**

* **核心思想**: 当函数 $f(x)$ 本身形式复杂，但其**导函数 $f'(x)$** 或**积分函数 $\int f(x)dx$** 形式更简单、更容易展开时，可以先对后者进行处理。
    1.  计算出更简单的 $f'(x)$ 或 $\int f(x)dx$。
    2.  求出这个简单函数的泰勒级数。
    3.  通过**逐项积分或逐项求导**，反推出原函数 $f(x)$ 的泰勒级数。
* **适用场景**: arcsin(x) (其导数是二项式), arctan((1-x)/(1+x)) (其导数是有理式) 等。
* **示例**: 求 $f(x) = \arctan\left(\frac{1-x}{1+x}\right)$ 在 $x=0$ 的各阶导数。
    1.  **微分预处理**: 先求导得 $f'(x) = -\frac{1}{1+x^2}$。
    2.  **展开导函数**: $f'(x) = - \sum_{n=0}^{\infty}(-x^2)^n = \sum_{n=0}^{\infty}(-1)^{n+1}x^{2n}$。
    3.  **反推原函数导数**: $f^{(n)}(0)$ 即 $(f')^{(n-1)}(0)$。
        * $f^{(100)}(0) = (f')^{(99)}(0)$。$f'(x)$ 级数中 $x^{99}$ 系数为0，故导数为0。
        * $f^{(99)}(0) = (f')^{(98)}(0)$。$f'(x)$ 级数中 $x^{98}$ (即 $n=49$) 的系数为 $(-1)^{49+1}=1$。故 $(f')^{(98)}(0) = 98! \cdot 1 = 98!$。


**策略二：【递推关系法】建立微分方程**
* **核心思想**:
    1.  通过求导和代数变形，为函数 $f(x)$ 自身建立一个简单的微分方程。
    2.  对方程两边使用**莱布尼茨公式**求 $n$ 阶导数。
    3.  将 $x=a$（通常 $a=0$）代入，得到一个关于各阶导数值 $f^{(k)}(a)$ 的**递推关系**。
    4.  根据初始值 $f(a), f'(a), \dots$ 解此递推关系。
* **适用场景**: 极适用于许多超越函数，特别是那些求导后会“循环”出现自身的函数（如涉及三角、反三角、指数函数与多项式乘积的函数）。**这是处理复杂函数在一点求高阶导数的王牌方法。**
* **示例**: 求 $f(x)=\frac{\arcsin x}{\sqrt{1-x^2}}$ 的 $f^{(n)}(0)$。
    1.  建立微分方程: $(1-x^2)f'(x) - xf(x) = 1$。
    2.  两边求 $(n-1)$ 阶导数并令 $x=0$，得到递推关系: $f^{(n)}(0) = (n-1)^2 f^{(n-2)}(0)$。
    3.  利用 $f(0)=0, f'(0)=1$ 解得: $f^{(n)}(0) = [(n-1)!!]^2$ (当n为奇数)，且 $f^{(n)}(0)=0$ (当n为偶数)。

 **策略三：【极限思想】洛必达法则的推广**
* **核心思想**: 若 $f(a)=f'(a)=\dots=f^{(n-1)}(a)=0$，则 $f^{(n)}(a) = n! \lim_{x\to a} \frac{f(x)}{(x-a)^n}$。
* **适用场景**: 函数在 $x=a$ 的低阶导数恰好均为零时。

**策略四：【结构分解】莱布尼茨公式**
* **核心思想**: 用于处理乘积 $h(x) = u(x)v(x)$。$h^{(n)}(a) = \sum_{k=0}^{n} \binom{n}{k} u^{(k)}(a) v^{(n-k)}(a)$。
* **适用场景**: 函数结构是简单乘积，且至少一个因子的高阶导数有简单规律（如多项式）。

 **策略五：【性质利用】奇偶性与周期性**
* **核心思想**: 奇函数在 $x=0$ 的偶阶导数为零；偶函数在 $x=0$ 的奇阶导数为零。
* **适用场景**: 求导点是函数的对称中心（通常是 $x=0$）时，应首先检查奇偶性。

---

##### **②：求高阶导数表达式 $f^{(n)}(x)$**

**策略一：【基础方法】直接计算与数学归纳法**
* **核心思想**: 计算前几阶导数，观察并归纳出通项公式，然后用数学归纳法证明。
* **适用场景**: 结构简单、规律明显的函数。

 **策略二：【结构分解】莱布尼茨公式**
* **核心思想**: $(uv)^{(n)} = \sum_{k=0}^{n} \binom{n}{k} u^{(k)} v^{(n-k)}$。
* **适用场景**: 函数是乘积形式，特别是当一个因子是多项式时。

**策略三：【代数预处理】部分分式分解**
* **核心思想**: 将有理函数分解为多个简单分式之和，再分别求导。
* **适用场景**: 有理函数 $P(x)/Q(x)$。

**策略四：【高级工具】利用微分方程**
* **核心思想**: 如果函数 $f(x)$ 满足某个微分方程，可反复对该方程求导，建立 $f^{(n+1)}(x), f^{(n)}(x), f^{(n-1)}(x), \dots$ 之间的递推关系式。
* **适用场景**: 与**第一部分策略二**类似，但目标是得到一个关于**函数**而非**数值**的递推式。

### **四、 高阶导数应用：凹凸性与拐点**

**1. 凹凸性与拐点的定义**
*   **凹凸性**: 描述函数图像弯曲方向的性质。可通过二阶导数 $f''(x)$ 的符号判断：
    *   $f''(x) > 0$ 的区间，图像是**凹**的 (concave up)。
    *   $f''(x) < 0$ 的区间，图像是**凸**的 (concave down)。
*   **拐点**: 函数图像上**凹凸性发生改变**的点。其几何意义是**曲线穿过了它在该点的切线**。

**2. 寻找拐点的严谨步骤**
1.  **寻找候选点**: 找出所有使 $f''(x_0)=0$ 或 $f''(x_0)$ 不存在的点 $x_0$。
2.  **检验候选点**:
    *   **必须保证 $f(x)$ 在 $x_0$ 处连续。** 间断点不可能是拐点。
    *   检查 $f''(x)$ 在 $x_0$ 点两侧的符号是否发生改变。若改变，则 $(x_0, f(x_0))$ 是拐点。

**3. 拐点的充分与必要条件**
*   **必要条件**: 若 $(x_0, f(x_0))$ 是拐点，则 $f''(x_0)=0$ 或 $f''(x_0)$ 不存在。
*   **充分条件**:
    1.  $f''(x)$ 在 $x_0$ 两侧**变号**。
    2.  若 $f''(x_0)=0$ 且 $f'''(x_0) \neq 0$，则为拐点。
    3.  推广：若 $f''(x_0)=\dots=f^{(n-1)}(x_0)=0$ 但 $f^{(n)}(x_0) \neq 0$，当 $n$ 为**奇数**时，是拐点。

**4. 特殊结论与深入理解**
*   **不可导点可以是拐点**: 笔记 [[6.27]] 中的例子 $f(x) = \begin{cases} x^2 & x \ge 0 \\ \sqrt{-x} & x < 0 \end{cases}$ 表明，点 $(0,0)$ 同时是**极小值点**、**拐点**和**不可导点**。
*   **光滑函数中极值点与拐点不共存**: 通过泰勒展开可以理解，在拐点附近，$f(x)-f(x_0)$ 会变号，这违背了局部极值的定义。
*   **零点性质**: 对于函数 $f(x)=(x-a)^n g(x)$ (其中 $g(a) \neq 0$)，在 $x=a$ 这个零点：
    *   若 $n$ 为偶数，该点是**极值点**。
    *   若 $n$ 为奇数 (且 $n \ge 3$)，该点是**拐点**。

#### **A 部：解析方法 (Analytical Methods)**

这是最基本、最通用的方法，适用于任何给定的函数解析式 $f(x)$。它就是你图片 image_e4fd16.png 中总结的经典流程。

**【工具 A.1】极值点分析流程**
1.  **寻找候选点 (Candidates)**：
    * 解方程 $f'(x)=0$，求出所有**驻点 (Stationary Points)**。
    * 寻找所有使 $f'(x)$ **不存在**的点。
2.  **检验候选点 (Tests)**：
    * **首选：第一充分条件（一阶导数变号）**：检查候选点 $x_0$ 两侧 $f'(x)$ 的符号。
        * 左负右正 $\implies$ 极小值。
        * 左正右负 $\implies$ 极大值。
        * 符号不变 $\implies$ 非极值点。
    * **备选：第二充分条件（二阶导数非零）**：仅用于检验**驻点** $x_0$。
        * 若 $f''(x_0) > 0 \implies$ 极小值。
        * 若 $f''(x_0) < 0 \implies$ 极大值。

**【工具 A.2】拐点分析流程**
1.  **寻找候选点 (Candidates)**：
    * 解方程 $f''(x)=0$。
    * 寻找所有使 $f''(x)$ **不存在**的点。
2.  **检验候选点 (Tests)**：
    * **首选：第二充分条件（二阶导数变号）**：检查候选点 $x_0$ 两侧 $f''(x)$ 的符号。若符号改变，则 $(x_0, f(x_0))$ 是拐点。
    * **备选：第三充分条件（三阶导数非零）**：仅用于检验 $f''(x_0)=0$ 的点。
        * 若 $f'''(x_0) \neq 0 \implies$ 拐点。

#### **B 部：图像方法 (Graphical Methods)**

**【工具 B.1】读 $f(x)$ 图像**
* **极值点**：图像的“山峰”（极大值）和“谷底”（极小值）。可以是平滑的，也可以是尖点。
* **拐点**：图像凹凸性发生改变的点，即从“杯口朝上”变为“杯口朝下”的转折点。

**【工具 B.2】读 $f'(x)$ 图像**
* **$f(x)$ 的极值点** $\iff$ **$f'(x)$ 图像与 $x$ 轴的穿零点**。
    * $f'(x)$ 从负“穿”到正 $\implies f(x)$ 取极小值。
    * $f'(x)$ 从正“穿”到负 $\implies f(x)$ 取极大值。
    * *（注意：若是“触碰”$x$轴但未穿越，则不是极值点，而是拐点）*
* **$f(x)$ 的拐点** $\iff$ **$f'(x)$ 图像的极值点**（山峰或谷底）。
    * 因为在这些点上，$f'(x)$ 的单调性改变，意味着 $f''(x)$ 的符号改变。

**【工具 B.3】读 $f''(x)$ 图像**
* **$f(x)$ 的拐点** $\iff$ **$f''(x)$ 图像与 $x$ 轴的穿零点**。
    * $f''(x)$ 从负“穿”到正 $\implies f(x)$ 由凸变凹。
    * $f''(x)$ 从正“穿”到负 $\implies f(x)$ 由凹变凸。

#### **C 部：多项式特技 (Polynomial Shortcuts)**

对于多项式这类性质优良的函数，我们有更快捷的技巧。

**【工具 C.1】根的重数法则 (Multiplicity Rule)**
* **$f(x)$ 的极值点**：$f'(x)=0$ 的所有**奇数重根**。
* **$f(x)$ 的拐点**：$f''(x)=0$ 的所有**奇数重根**。
* *(偶数重根意味着函数图像在 $x$ 轴的该侧“触碰”后不穿越，符号不变，故不满足极值或拐点的变号条件)*

**【工具 C.2】罗尔定理数轴穿针法 (Rolle's Theorem on Number Line)**
* **用途**：在不便直接求解高阶导数方程时，快速判断导函数根的个数和大致区间。
* **流程**：
    1.  在数轴上标出{{c2::**函数 $P(x)$ 的所有实根**}}。
    2.  根据罗尔定理，在任意两个相邻的 $P(x)$ 的根之间，至少存在一个 $P'(x)$ 的根。在数轴的相应区间内“插入”$P'(x)$ 的根。
    3.  结合 $x \to \pm\infty$ 时 $P'(x)$ 的趋势，确定 $P'(x)$ 所有根的个数。
    4.  重复此过程，可在 $P'(x)$ 的根之间“插入”$P''(x)$ 的根，从而确定拐点的个数。

`;
}

async function loadContentFromSource(
  state: AppState, 
  filepath: string
): Promise<{ content: string; noteId: string | null }> {
  const { contentCache, rootPath, pathMap } = state;
  
  // 1. Check Cache
  if (contentCache[filepath]) {
    return { content: contentCache[filepath], noteId: pathMap[filepath] || null };
  }

  // 2. Check Demo Vault
  if (rootPath === 'DEMO_VAULT') {
    const fileName = filepath.split('/').pop() || 'Demo';
    const noteId = pathMap[filepath] || null;
    return { content: getDemoContent(fileName), noteId };
  }

  // 3. Check Filesystem (Desktop Only)
  if (!isTauri()) {
    throw new Error("File system access is only available in the desktop app");
  }

  const result = await fileSystem.ensureNoteId(filepath);
  
  return { content: result.content, noteId: result.id };
}

function updateCacheAndIds(
  set: (fn: (state: AppState) => Partial<AppState>) => void, 
  filepath: string, 
  content: string, 
  noteId: string | null
) {
  set(state => {
    const updates: Partial<AppState> = {};
    
    // Update ID Maps if needed
    if (noteId && state.pathMap[filepath] !== noteId) {
      updates.idMap = { ...state.idMap, [noteId]: filepath };
      updates.pathMap = { ...state.pathMap, [filepath]: noteId };
    }

    // Update Cache (LRU)
    const existing = { ...state.contentCache };
    delete existing[filepath]; 
    const next = { ...existing, [filepath]: content };
    const keys = Object.keys(next);
    if (keys.length > MAX_CONTENT_CACHE_ENTRIES) {
      const overflow = keys.length - MAX_CONTENT_CACHE_ENTRIES;
      for (let i = 0; i < overflow; i++) {
        delete next[keys[i]];
      }
    }
    updates.contentCache = next;

    return updates;
  });
}

async function syncNoteMetadata(
  set: (fn: (state: AppState) => Partial<AppState>) => void, 
  get: () => AppState, 
  filepath: string, 
  noteId: string | null
) {
  // Pass noteId if available, otherwise fallback to filepath logic inside getMetadata
  const metadata = await get().dataService.getMetadata(noteId || '', filepath);

  // Inject the real ID if we have it (and it wasn't in the metadata returned?)
  // Actually dataService.getMetadata usually returns what it found.
  if (noteId) {
    metadata.noteId = noteId;
  }

  set(state => {
    // If metadata found a noteId that we didn't know, update map? 
    // (The original logic did `if (noteId) { metadata.noteId = noteId; update fileMetadatas... }`)
    
    const nextMetas = { ...state.fileMetadatas, [filepath]: metadata };
    
    // If this is still the current file, update currentMetadata
    const updates: Partial<AppState> = {
        fileMetadatas: nextMetas
    };

    if (state.currentFilepath === filepath) {
        updates.currentMetadata = metadata;
    }

    return updates;
  });
}

const createNoteSlice: AppStateCreator<NoteSlice> = (set, get) => ({
  currentFilepath: null,
  currentNote: null,
  currentMetadata: null,
  currentClozeIndex: null,

  loadNote: async (filepath, targetClozeIndex = null) => {
    try {
      // 1. Load Content (Cache -> Demo -> FS)
      const { content, noteId } = await loadContentFromSource(get(), filepath);

      // 2. Update Cache & ID Maps
      // We only need to update cache/IDs if we actually loaded from FS or it's new
      // But calling this always is safe and ensures LRU is updated (cache promotion)
      updateCacheAndIds(set, filepath, content, noteId);

      // 3. Parse & Update View State
      const parsed = parseNote(content);
      const { viewMode, fileMetadatas } = get();
      const targetMode = ['edit', 'test', 'master'].includes(viewMode) ? viewMode : 'review';
      
      set({
        currentFilepath: filepath,
        currentNote: parsed,
        currentMetadata: fileMetadatas[filepath] || null,
        currentClozeIndex: targetClozeIndex,
        viewMode: targetMode
      });

      // Update review timer
      if (targetClozeIndex !== null && (targetMode === 'test' || targetMode === 'review')) {
        currentReviewStartTime = Date.now();
      } else {
        currentReviewStartTime = null;
      }

      // 4. Fetch & Sync Metadata (Async)
      await syncNoteMetadata(set, get, filepath, noteId);

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
  studyResourcesPrefetched: false,
  theme: 'winter',

  setViewMode: (mode) => set({ viewMode: mode }),
  setStudyResourcesPrefetched: (prefetched) => set({ studyResourcesPrefetched: prefetched }),
  setTheme: (theme) => set({ theme }),
});

const createSmartQueueSlice: AppStateCreator<SmartQueueSlice> = (set, get) => ({
  fetchDueCards: async (limit = 50) => {
    try {
      const { dataService, currentVault } = get();
      const vaultId = currentVault?.id;
      const dueCards = await dataService.getDueCards(limit, vaultId);
      set({ queue: dueCards });
      useToastStore.getState().addToast(`Loaded ${dueCards.length} due cards`, 'success');
    } catch (e) {
      console.error("Failed to fetch due cards", e);
      if ((e as any)?.status === 401 || (e as any)?.code === 'PGRST301') {
          get().signOut();
          useToastStore.getState().addToast("Session expired", 'warning');
          return;
      }
      useToastStore.getState().addToast("Failed to fetch due cards", 'error');
    }
  },

  searchCards: async (query) => {
    try {
      const { dataService, currentVault } = get();
      const vaultId = currentVault?.id;
      return await dataService.searchCards(query, vaultId);
    } catch (e) {
      console.error("Failed to search cards", e);
      return [];
    }
  },

  suspendCard: async (cardId, isSuspended) => {
    try {
      const { dataService } = get();
      await dataService.suspendCard(cardId, isSuspended);
      useToastStore.getState().addToast(isSuspended ? "Card suspended" : "Card unsuspended", 'info');

      // Remove from queue if suspended
      if (isSuspended) {
        // const { queue } = get();
        // Note: QueueItem currently doesn't have cardId directly, but we can infer or update QueueItem to have it if needed.
        // For now, we might need to reload queue or filter by noteId+clozeIndex if we have that info.
        // But suspendCard takes cardId (UUID).
        // Let's just reload queue for simplicity or assume UI handles it.
        // Actually, let's refresh the queue if we are in a session? No, that might disrupt flow.
      }
    } catch (e) {
      console.error("Failed to suspend card", e);
      useToastStore.getState().addToast("Failed to update card suspension", 'error');
    }
  },

  resetCard: async (cardId) => {
    try {
      const { dataService } = get();
      await dataService.resetCard(cardId);
      useToastStore.getState().addToast("Card progress reset", 'success');
    } catch (e) {
      console.error("Failed to reset card", e);
      useToastStore.getState().addToast("Failed to reset card", 'error');
    }
  }
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
        ...createSmartQueueSlice(...a),
      }),
      {
        name: 'app-store',
        version: 1,
        migrate: (persistedState: any, version: number) => {
            if (version === 0) {
                // Migration from v0 to v1
                // Reset fileMetadatas if format is incompatible, or just keep it.
                // Since we are adding fields, old data is fine, just missing 'lastServerSyncAt'.
                return {
                    ...persistedState,
                    fileMetadatas: {}, // Safer to clear cache on schema change
                    lastServerSyncAt: null
                };
            }
            return persistedState;
        },
        partialize: (state) => ({
          rootPath: state.rootPath,
          recentVaults: state.recentVaults,
          files: state.files,
          theme: state.theme,
          // Persist metadata for offline/optimistic support
          fileMetadatas: state.fileMetadatas,
          lastServerSyncAt: state.lastServerSyncAt
        }),
      },
    ),
    { name: 'app-store' },
  ),
);


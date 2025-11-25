import { create, StateCreator } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { DataService, NoteMetadata, QueueItem, ReviewLog, Vault } from '../lib/storage/types';
import { MockAdapter } from '../lib/storage/MockAdapter';
import { fileSystem } from '../lib/services/fileSystem';
import { isTauri } from '../lib/tauri';
import { parseNote, ParsedNote } from '../lib/markdown/parser';
import { fsrs, createEmptyCard } from 'ts-fsrs';
import { useToastStore } from './toastStore';
import { getSupabaseClient } from '../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import superjson from 'superjson';

export type ViewMode = 'library' | 'review' | 'test' | 'master' | 'edit' | 'summary';

export const MAX_CONTENT_CACHE_ENTRIES = 200;

// --- Demo Mode Helpers ---
// Demo mode is when the user is browsing the DEMO_VAULT (read-only demo content).
// In demo mode: data should NOT be synced to the cloud, and UI should show appropriate hints.
export const isDemoMode = (state: { rootPath: string | null; currentFilepath: string | null }) => 
  state.rootPath === 'DEMO_VAULT' || state.currentFilepath?.startsWith('/Demo/') || false;

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isIndexedDBAvailable = () =>
  isBrowser() && typeof window.indexedDB !== 'undefined';

let idbDatabasePromise: Promise<IDBDatabase> | null = null;

const getIdbDatabase = (): Promise<IDBDatabase> => {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (!idbDatabasePromise) {
    idbDatabasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open('memory-player-store', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('app-store')) {
          db.createObjectStore('app-store');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to open IndexedDB'));
    });
  }
  return idbDatabasePromise;
};

const idbSetItem = async (name: string, value: string): Promise<void> => {
  try {
    const db = await getIdbDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('app-store', 'readwrite');
      const store = tx.objectStore('app-store');
      const request = store.put(value, name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB setItem failed'));
    });
  } catch (err) {
    console.error('IndexedDB setItem failed, falling back to localStorage', err);
    if (isBrowser()) {
      try {
        window.localStorage.setItem(name, value);
      } catch (e) {
        console.error('localStorage fallback setItem failed', e);
      }
    }
  }
};

const idbGetItem = async (name: string): Promise<string | null> => {
  try {
    const db = await getIdbDatabase();
    const value: string | null = await new Promise((resolve, reject) => {
      const tx = db.transaction('app-store', 'readonly');
      const store = tx.objectStore('app-store');
      const request = store.get(name);
      request.onsuccess = () =>
        resolve((request.result as string | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB getItem failed'));
    });

    if (value != null) {
      return value;
    }

    // Migration path: fall back to legacy localStorage on first run
    if (isBrowser()) {
      try {
        const legacy = window.localStorage.getItem(name);
        if (legacy != null) {
          try {
            await idbSetItem(name, legacy);
          } catch (e) {
            console.error('Failed to migrate legacy localStorage data to IndexedDB', e);
          }
          return legacy;
        }
      } catch (e) {
        console.error('Failed to read legacy localStorage during IndexedDB migration', e);
      }
    }

    return null;
  } catch (err) {
    console.error('IndexedDB getItem failed, falling back to localStorage', err);
    if (isBrowser()) {
      try {
        return window.localStorage.getItem(name);
      } catch (e) {
        console.error('localStorage fallback getItem failed', e);
      }
    }
    return null;
  }
};

const idbRemoveItem = async (name: string): Promise<void> => {
  try {
    const db = await getIdbDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('app-store', 'readwrite');
      const store = tx.objectStore('app-store');
      const request = store.delete(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB removeItem failed'));
    });
  } catch (err) {
    console.error('IndexedDB removeItem failed, falling back to localStorage', err);
    if (isBrowser()) {
      try {
        window.localStorage.removeItem(name);
      } catch (e) {
        console.error('localStorage fallback removeItem failed', e);
      }
    }
  }
};

const indexedDBStorage: StateStorage = {
  getItem: (name) => idbGetItem(name),
  setItem: (name, value) => idbSetItem(name, value),
  removeItem: (name) => idbRemoveItem(name),
};

const localStorageStorage: StateStorage = {
  getItem: async (name) => {
    if (!isBrowser()) return null;
    try {
      return window.localStorage.getItem(name);
    } catch (e) {
      console.error('localStorage getItem failed', e);
      return null;
    }
  },
  setItem: async (name, value) => {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(name, value);
    } catch (e) {
      console.error('localStorage setItem failed', e);
    }
  },
  removeItem: async (name) => {
    if (!isBrowser()) return;
    try {
      window.localStorage.removeItem(name);
    } catch (e) {
      console.error('localStorage removeItem failed', e);
    }
  },
};

const getStorage = (): StateStorage =>
  isIndexedDBAvailable() ? indexedDBStorage : localStorageStorage;

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
  skipCurrentCard: () => Promise<void>;

  currentFilepath: string | null;
  currentNote: ParsedNote | null;
  currentMetadata: NoteMetadata | null;
  currentClozeIndex: number | null;

  isGrading: boolean;
  getSchedulingPreview: () => Record<number, { due: Date; interval: string }>;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  theme: string;
  setTheme: (theme: string) => void;

  contentCache: Record<string, string>;

  loadNote: (filepath: string, targetClozeIndex?: number | null) => Promise<void>;
  saveCurrentNote: (content: string) => Promise<void>;
  syncNoteFromFilesystem: (filepath: string, content: string, noteId: string) => Promise<void>;
  saveReview: (rating: number) => Promise<boolean>;
  closeNote: () => void;

  loadSettings: () => void;
  updateLastSync: () => void;
  manualSyncPendingNotes: () => Promise<{ retriedCount: number; errorCount: number }>;

  // --- Smart Queue & Actions ---
  fetchDueCards: (limit?: number) => Promise<void>;
  searchCards: (query: string) => Promise<any[]>;
  suspendCard: (cardId: string, isSuspended: boolean) => Promise<void>;
  resetCard: (cardId: string) => Promise<void>;

  vaults: Vault[];
  currentVault: Vault | null;
  loadVaults: () => Promise<void>;
  setCurrentVault: (vault: Vault | null) => void;
  restoreNote: (noteId: string) => Promise<void>;
  createVault: (name: string, config?: any) => Promise<Vault | null>;
  updateVault: (vaultId: string, updates: Partial<Vault>) => Promise<void>;

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
  | 'syncNoteFromFilesystem'
  | 'loadSettings'
  | 'removeRecentVault'
  | 'handleExternalCardUpdate'
  | 'loadVaults'
  | 'setCurrentVault'
  | 'restoreNote'
  | 'createVault'
  | 'updateVault'
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
  | 'skipCurrentCard'
>;

type NoteSlice = Pick<
  AppState,
  | 'currentFilepath'
  | 'currentNote'
  | 'currentMetadata'
  | 'currentClozeIndex'
  | 'loadNote'
  | 'saveCurrentNote'
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
  | 'currentUser'
  | 'lastSyncAt'
  | 'lastServerSyncAt'
  | 'pendingNoteSyncs'
  | 'markNoteSyncPending'
  | 'markNoteSynced'
  | 'clearAllPendingNoteSyncs'
  | 'updateLastSync'
  | 'manualSyncPendingNotes'
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
      set({ dataService: service, syncMode: type, currentUser: userInfo, lastSyncAt: new Date() });
      
      // Optimistic UI: If we have a session, assume we are logged in
      if (type === 'supabase' && userInfo) {
         // Background verification
         getSupabaseClient()?.auth.getUser().then(({ data, error }) => {
             if (error || !data.user) {
                 console.warn("Session verification failed", error);
                 if (get().currentUser) {
                     get().signOut();
                     useToastStore.getState().addToast(
                       "Session expired|Please log in again to continue syncing.",
                       'warning',
                     );
                 }
             }
         });
      }
      
      // NOTE: Heavy data loading (vaults, metadata, history) is intentionally removed from here
      // to prevent blocking the UI startup. These should be called lazily by the views that need them.
      
    } catch (e) {
      console.error("Failed to initialize data service", e);
      useToastStore.getState().addToast(
        "Sync error|Failed to initialize sync service.",
        'error',
      );
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

  manualSyncPendingNotes: async () => {
    const {
      syncMode,
      dataService,
      pendingNoteSyncs,
      pathMap,
      currentVault,
      loadAllMetadata,
      fetchDueCards,
      updateLastSync,
      markNoteSynced,
    } = get();

    let retriedCount = 0;
    let errorCount = 0;

    if (!dataService) {
      return { retriedCount, errorCount };
    }

    try {
      const filesToRetry = Object.keys(pendingNoteSyncs || {});

      if (syncMode === 'supabase' && filesToRetry.length > 0) {
        for (const filepath of filesToRetry) {
          try {
            const noteId = pathMap[filepath];
            if (!noteId) continue;

            const content = await fileSystem.readNote(filepath);
            await dataService.syncNote(filepath, content, noteId, currentVault?.id);
            markNoteSynced(filepath);
            retriedCount++;
          } catch (err) {
            console.error(`Failed to sync ${filepath}`, err);
            errorCount++;
          }
        }
      }

      // Always refresh cloud-derived state after sync attempts
      try {
        await loadAllMetadata();
      } catch (err) {
        console.error('Failed to refresh metadata after sync', err);
      }

      try {
        await fetchDueCards(50);
      } catch (err) {
        console.error('Failed to refresh due cards after sync', err);
      }

      updateLastSync();

      return { retriedCount, errorCount };
    } catch (err) {
      console.error('Manual sync failed', err);
      if (errorCount === 0) {
        errorCount = 1;
      }
      return { retriedCount, errorCount };
    }
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

// --- Module-level helpers for filesystem-driven note updates ---

export const syncNoteFromFilesystem = async (filepath: string, content: string, noteId: string) => {
  await useAppStore.getState().syncNoteFromFilesystem(filepath, content, noteId);
};

export const softDeleteNoteForPath = async (filepath: string) => {
  const { pathMap, dataService, updateLastSync } = useAppStore.getState();
  const noteId = pathMap[filepath];
  if (!noteId) return;

  await dataService.softDeleteNote(noteId);
  updateLastSync();
};

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
    // NOTE: This function is now a no-op.
    // State persistence is handled entirely by Zustand's persist middleware with IndexedDB.
    // The old localStorage-based migration logic was removed because:
    // 1. persist middleware now uses IndexedDB (async), not localStorage
    // 2. The old check `localStorage.getItem('app-store')` always returned null
    // 3. This caused rootPath to be incorrectly reset to null on every refresh
    //
    // If legacy migration from localStorage is still needed, it should be handled
    // in the persist middleware's `migrate` function or `onRehydrateStorage` callback.
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
         useToastStore.getState().addToast(
           "Session expired|Please log in again to continue syncing.",
           'warning',
         );
         return;
      }
      useToastStore.getState().addToast(
        "Sync error|Failed to load metadata from the server.",
        'error',
      );
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

  syncNoteFromFilesystem: async (filepath, content, noteId) => {
    try {
      const {
        dataService,
        currentVault,
        updateLastSync,
        markNoteSynced,
        rootPath,
      } = get();

      // DEMO MODE: Skip cloud sync entirely
      const demoMode = isDemoMode({ rootPath, currentFilepath: filepath });
      if (demoMode) {
        // Still update cache for demo files, but skip backend sync
        updateCacheAndIds(set, filepath, content, noteId);
        return;
      }

      // 1. Update cache and ID mappings for this note (LRU behavior included)
      updateCacheAndIds(set, filepath, content, noteId);

      // 2. Sync to backend (pass current vault if available)
      await dataService.syncNote(filepath, content, noteId, currentVault?.id);

      // 3. Update sync timestamp and pending sync flags
      updateLastSync();
      markNoteSynced(filepath);

      // 4. Refresh local metadata and mappings via existing helper
      try {
        await get().refreshMetadata(filepath, noteId);
      } catch (metaError) {
        console.error(`[VaultSlice] Failed to refresh metadata for ${filepath} after sync`, metaError);
      }
    } catch (e) {
      console.error(`[VaultSlice] Failed to sync note from filesystem: ${filepath}`, e);
      try {
        get().markNoteSyncPending(filepath);
      } catch (flagError) {
        console.error('[VaultSlice] Failed to mark note as pending sync', flagError);
      }
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
      if (currentVault) {
        get().loadAllMetadata();
      }
    } catch (e) {
      console.error("Failed to load vaults", e);
      if ((e as any)?.status === 401 || (e as any)?.code === 'PGRST301') {
          get().signOut();
          useToastStore.getState().addToast(
            "Session expired|Please log in again to continue syncing.",
            'warning',
          );
      }
    }
  },

  restoreNote: async (noteId: string) => {
    const { dataService, idMap, updateLastSync, currentVault } = get();
    try {
      await dataService.restoreNote(noteId);
      updateLastSync();

      const filepath = idMap[noteId];
      if (filepath) {
        try {
          await get().refreshMetadata(filepath, noteId);
        } catch (metaError) {
          console.error(`[VaultSlice] Failed to refresh metadata after restore for ${filepath}`, metaError);
        }
      } else if (currentVault) {
        try {
          await get().loadAllMetadata();
        } catch (e) {
          console.error('[VaultSlice] Failed to reload metadata after restore', e);
        }
      }
    } catch (e) {
      console.error('[VaultSlice] Failed to restore note', e);
      throw e;
    }
  },

  createVault: async (name: string, config?: any) => {
    const { dataService } = get();
    const trimmed = name.trim();
    if (!trimmed) return null;

    try {
      const created = await dataService.createVault(trimmed, config as any);
      await get().loadVaults();
      if (created) {
        get().setCurrentVault(created);
      }
      return created;
    } catch (e) {
      console.error('[VaultSlice] Failed to create vault', e);
      throw e;
    }
  },

  updateVault: async (vaultId: string, updates: Partial<Vault>) => {
    const { dataService } = get();
    try {
      await dataService.updateVault(vaultId, updates);
      await get().loadVaults();
    } catch (e) {
      console.error('[VaultSlice] Failed to update vault', e);
      throw e;
    }
  },

  setCurrentVault: (vault) => {
    const { rootPath, recentVaults } = get();
    const updates: any = { currentVault: vault };

    if (vault) {
        const linkedPath = vault.config?.rootPath;
        if (linkedPath && linkedPath !== rootPath) {
            updates.rootPath = linkedPath;
            updates.files = [];
            updates.contentCache = {};
            
            if (linkedPath !== 'DEMO_VAULT') {
                updates.recentVaults = [linkedPath, ...recentVaults.filter(p => p !== linkedPath)].slice(0, 5);
            }
        }
    }

    set(updates);

    if (vault) {
        get().loadAllMetadata();
    }
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
      // DEMO MODE: Skip cloud sync entirely - demo data should not persist
      const demoMode = isDemoMode({ rootPath: get().rootPath, currentFilepath });
      if (!demoMode) {
        dataService.saveReview(noteId, currentClozeIndex, record.card, record.log, durationMs)
          .catch(e => {
             console.error("Background save review failed", e);
             useToastStore.getState().addToast(
               "Review sync failed|Your grade was saved locally and will sync later.",
               'warning',
             );
          });
      }

      // Navigation Logic
      // Use queue.length > 0 as the primary check (more reliable than sessionStats.timeStarted)
      const hasMoreCards = queue.length > 0;

      if (hasMoreCards) {
        const nextIndex = sessionIndex + 1;

        if (nextIndex < queue.length) {
          set({ sessionIndex: nextIndex });
          const nextItem = queue[nextIndex];
          // IMPORTANT: Await loadNote to prevent UI flicker and double-render
          // Keep isGrading=true until the next card is fully loaded
          try {
            await loadNote(nextItem.filepath, nextItem.clozeIndex);
          } catch (loadError) {
            console.error("Failed to load next card", loadError);
            // Still allow user to continue - the card might load on retry
          }
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
        useToastStore.getState().addToast(
          "Review saved|This review was saved outside an active session.",
          'success',
        );
      }
      return true;
    } catch (e) {
      console.error("Save review failed", e);
      useToastStore.getState().addToast(
        "Review error|Failed to save this review.",
        'error',
      );
      return false;
    } finally {
      set({ isGrading: false });
    }
  },

  skipCurrentCard: async () => {
    const { queue, sessionIndex, sessionStats, loadNote } = get();
    if (queue.length === 0) return;

    const nextIndex = sessionIndex + 1;

    // Increment skipped count for this session
    set({
      sessionStats: {
        ...sessionStats,
        skippedCount: (sessionStats.skippedCount || 0) + 1,
      },
    });

    if (nextIndex < queue.length) {
      set({ sessionIndex: nextIndex });
      const nextItem = queue[nextIndex];
      await loadNote(nextItem.filepath, nextItem.clozeIndex);
    } else {
      // No more cards in this session: show summary
      set({
        currentFilepath: null,
        currentNote: null,
        viewMode: 'summary',
        sessionIndex: queue.length,
      });
      useToastStore.getState().addToast('Session Complete!', 'success');
    }
  },
});

// --- loadNote Helpers ---

function getDemoContent(fileName: string): string {
  return `---
title: ${fileName.replace('.md', '')}
tags: [demo, spaced-repetition]
---

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

# 测试公式

行内：{{c4::$E = mc^2$}}

块公式：

{{c3::$$
\\int_a^b f(x)\\,dx = F(b) - F(a)
$$}}


#### 📅 阶段二：知识网络串联巩固期（11.20-12.03）

| 日期            | 晨间 (6:30-8:30)                           | 上午 (8:30-11:30)                  | 午间 (11:30-14:00)                                | 下午 (14:00-17:00)                     | 傍晚 (17:00-19:00)                         | 晚上 (19:00-22:00)                        |
| :------------ | :--------------------------------------- | :------------------------------- | :---------------------------------------------- | :----------------------------------- | :--------------------------------------- | :-------------------------------------- |
| **11.20 (三)** | 起床洗漱<br>**复习(A组)**<br>早餐<br>考前准备         | **【全真模拟】**<br>李艳芳数学卷(1) (3h)     | 休息<br>**12:30 午餐**<br>**13:00 午休**              | **【全真模拟】**<br>竟成408卷(1) (3h)         | 休息/散步<br>**18:30 晚餐**                    | **对答案+分析 (2.5h)**<br>错题整理(0.5h)         |
| **11.21 (四)** | 起床洗漱<br>**复习(F组)**<br>早餐<br>醒脑(昨数学错题)    | 数学模拟(1)错题复习<br>数学真题2020年         | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408模拟(1)错题复习<br>英语真题2020(完型+新题型)     | 政治分析题默写(马原)<br>错题复习(英语)<br>**18:30 晚餐**  | 408代码(链表x3)<br>错题复习(当日)<br>**复习(G组)**   |
| **11.22 (五)** | 起床洗漱<br>**复习(C组)**<br>早餐<br>考前准备         | **【全真模拟】**<br>李艳芳数学卷(2) (3h)     | 休息<br>**12:30 午餐**<br>**13:00 午休**              | **【全真模拟】**<br>408真题2020年 (3h)        | 休息/散步<br>**18:30 晚餐**                    | **对答案+分析 (2.5h)**<br>错题整理(0.5h)         |
| **11.23 (六)** | 起床洗漱<br>**复习(D组)**<br>早餐<br>醒脑(昨数学错题)    | 数学模拟(2)错题复习<br>数学真题2021年         | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408真题(2020)错题复习<br>英语真题2020(翻译)      | 政治分析题默写(毛中特)<br>错题复习(英语)<br>**18:30 晚餐** | 408代码(树x3)<br>错题复习(当日)<br>**复习(E组)**    |
| **11.24 (日)** | (7:30起)<br>早餐                            | **【调整日】**<br>整理本周错题<br>突破薄弱模块    | **复习(B组)**<br>**12:30 午餐**<br>**13:00 午休**      | **【全真模拟】**<br>竟成408卷(2) (3h)         | 休息<br>**18:30 晚餐**                       | **对答案+分析 (2h)**<br>规划下周(0.5h)           |
| **11.25 (一)** | 起床洗漱<br>**复习(A组)**<br>早餐<br>醒脑(昨408错题)   | 408模拟(2)错题复习<br>数学真题2022年        | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408真题2021(数结+组原)<br>英语真题2021(完型+新题型) | 政治分析题默写(史纲)<br>错题复习(英语)<br>**18:30 晚餐**  | 408代码(图x3)<br>错题复习(当日)<br>**复习(F组)**    |
| **11.26 (二)** | 起床洗漱<br>**复习(G组)**<br>早餐<br>醒脑(数学2022错题) | 数学真题(2022)错题复习<br>数学真题2023年      | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408真题2021(操统+计网)<br>英语真题2021(翻译)     | 政治分析题默写(思修)<br>错题复习(英语)<br>**18:30 晚餐**  | 408代码(栈/队列x3)<br>错题复习(当日)<br>**复习(C组)** |
| **11.27 (三)** | 起床洗漱<br>**复习(E组)**<br>早餐<br>考前准备         | **【全真模拟】**<br>408真题2022年 (3h)    | 休息<br>**12:30 午餐**<br>**13:00 午休**              | **【全真模拟】**<br>竟成408卷(3) (3h)         | 休息<br>**18:30 晚餐**                       | **对答案+分析 (2.5h)**<br>错题整理(0.5h)         |
| **11.28 (四)** | 起床洗漱<br>**复习(D组)**<br>早餐<br>醒脑(昨408错题)   | 408(真题22+模拟3)错题复习<br>数学真题2024年   | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408模拟(3)错题深度复习<br>英语真题2022(完型+新题型)   | 政治分析题默写(当代)<br>错题复习(英语)<br>**18:30 晚餐**  | 408代码(排序x3)<br>错题复习(当日)<br>**复习(A组)**   |
| **11.29 (五)** | 起床洗漱<br>**复习(B组)**<br>早餐<br>醒脑(数学2024错题) | 数学真题(2024)错题复习<br>数学真题2019年      | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | **【全真模拟】**<br>竟成408卷(4) (3h)         | 休息<br>**18:30 晚餐**                       | **对答案+分析 (2.5h)**<br>错题整理(0.5h)         |
| **11.30 (六)** | 起床洗漱<br>**复习(F组)**<br>早餐<br>醒脑(昨408错题)   | 408模拟(4)错题复习<br>数学真题2018年        | 整理数学错题<br>**12:30 午餐**<br>**13:00 午休**          | 408真题2023(数结+组原)<br>英语真题2022(翻译)     | 政治分析题默写(综合)<br>错题复习(英语)<br>**18:30 晚餐**  | 408代码(综合x3)<br>错题复习(当日)<br>**复习(G组)**   |
| **12.01 (日)** | (7:30起)<br>早餐                            | **【调整日】**<br>整理阶段二所有错题<br>制作错题清单 | **复习(C组 & D组)**<br>**12:30 午餐**<br>**13:00 午休** | 408真题2023(操统+计网)                     | 休息<br>**18:30 晚餐**                       | **阶段二总结 (2h)**<br>规划阶段三                 |
| **12.02 (一)** | 起床洗漱<br>**复习(E组)**<br>早餐<br>醒脑           | **数学真题2017年 (3h)**               | 复盘上午错题<br>**12:30 午餐**<br>**13:00 午休**          | **408真题2024年 (3h)**                  | 英语(剩余年份完型/翻译)<br>**18:30 晚餐**            | 错题复习(当日)<br>代码手写<br>**复习(A组 & B组)**     |
| **12.03 (二)** | 起床洗漱<br>**复习(C组)**<br>早餐<br>醒脑           | **数学真题2016年 (3h)**               | 复盘上午错题<br>**12:30 午餐**<br>**13:00 午休**          | **408真题2019年 (3h)**                  | 英语(剩余年份完型/翻译)<br>**18:30 晚餐**            | 错题复习(当日)<br>代码手写<br>**复习(F组 & G组)**     |

#### 📅 阶段三：薄弱点修补期（12.04-12.09）

| 日期 | 晨间 (6:30-8:30) | 上午 (8:30-11:30) | 午间 (11:30-14:00) | 下午 (14:00-17:00) | 傍晚 (17:00-19:00) | 晚上 (19:00-22:00) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **12.04 (三)** | 起床洗漱<br>**复习(C组)**<br>早餐<br>**复习(E组-数)** | **数学薄弱点**: (3h)<br>高等数学错题(极限/导/积) | 整理高数错题<br>**12:30 午餐**<br>**13:00 午休** | **复习(F组-408)**<br>**408薄弱点**: (2h)<br>数据结构错题专项 | **复习(D组-英)**<br>整理408错题<br>**18:30 晚餐** | **政治**: (3h)<br>分析题背诵(肖四/肖八)<br>+ 技巧课 |
| **12.05 (四)** | 起床洗漱<br>**复习(G组)**<br>早餐<br>**复习(E组-数)** | **数学薄弱点**: (3h)<br>线性代数错题(矩阵/特征值) | 整理线代错题<br>**12:30 午餐**<br>**13:00 午休** | **复习(F组-408)**<br>**408薄弱点**: (2h)<br>组成原理错题(Cache/流水) | **复习(C组-英)**<br>整理408错题<br>**18:30 晚餐** | **政治**: (3h)<br>选择题技巧总结<br>+ 1000题错题重刷 |
| **12.06 (五)** | 起床洗漱<br>**复习(A组)**<br>早餐<br>**复习(E组-数)** | **数学薄弱点**: (3h)<br>概率论错题(分布/期望) | 整理概率错题<br>**12:30 午餐**<br>**13:00 午休** | **复习(G组-408)**<br>**408薄弱点**: (2h)<br>操作系统错题(PV/银行家) | 英语: 完型技巧+错题<br>整理408错题<br>**18:30 晚餐** | **政治**: (3h)<br>时政热点整理<br>+ 分析题背诵 |
| **12.07 (六)** | 起床洗漱<br>**复习(B组)**<br>早餐<br>醒脑(数学易错) | **数学薄弱点**: (3h)<br>数学综合错题(跨章节) | 查漏补缺<br>**12:30 午餐**<br>**13:00 午休** | **复习(G组-408)**<br>**408薄弱点**: (2h)<br>计算机网络错题(子网/TCP) | 英语: 翻译技巧总结<br>整理408错题<br>**18:30 晚餐** | **政治**: (3h)<br>主观题答题模板<br>(肖四) |
| **12.08 (日)** | (7:30起)<br>早餐 | **【调整日】**<br>整理本周背诵内容<br>制作最终背诵清单 | **复习(D组 & C组)**<br>**12:30 午餐**<br>**13:00 午休** | **408代码题**: (3h)<br>手写练习(每类型2道) | 自由安排/放松<br>**18:30 晚餐** | 轻松复习(英语作文)<br>轻松复习(政治分析题)<br>规划下周 |
| **12.09 (一)** | 起床洗漱<br>**复习(E组-数)**<br>早餐<br>醒脑 | **数学全科梳理**: (3h)<br>公式+错题模式 | 查漏补缺<br>**12:30 午餐**<br>**13:00 午休** | **408全科梳理**: (3h)<br>四科核心考点 | **复习(F组 & G组)**<br>**18:30 晚餐** | **政英全科梳理**: (3h)<br>**复习(A, B, C, D组)**<br>总结 |

#### 📅 阶段四：错题冲刺+考前调整期（12.10-12.19）

| 日期 | 晨间 (6:30-8:30) | 上午 (8:30-11:30) | 午间 (11:30-14:00) | 下午 (14:00-17:00) | 傍晚 (17:00-19:00) | 晚上 (19:00-22:00) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **12.10 (二)** | 起床洗漱<br>**复习(E组)**<br>早餐<br>考前准备 | **【全真模拟】**<br>数学信心卷(1) (3h) | 休息<br>**12:30 午餐**<br>**13:00 午休** | **数学复盘**: (3h)<br>对答案+分析+整理错题 | **复习(F组)**<br>**18:30 晚餐** | **复习(A组-政)**<br>快速过高数错题本 |
| **12.11 (三)** | 起床洗漱<br>**复习(C组)**<br>早餐<br>考前准备 | **【全真模拟】**<br>408信心卷(1) (3h) | 休息<br>**12:30 午餐**<br>**13:00 午休** | **408复盘**: (3h)<br>对答案+分析+整理错题 | **复习(G组)**<br>**18:30 晚餐** | 快速过线代/概率错题本<br>**复习(D组)** |
| **12.12 (四)** | 起床洗漱<br>**复习(B组)**<br>早餐<br>考前准备 | **【全真模拟】**<br>政治信心卷(1) (3h) | 对答案(选择题)<br>**12:30 午餐**<br>**13:00 午休** | **【全真模拟】**<br>英语信心卷(1) (3h) | 对答案(英语)<br>快过408错题(数结/组原)<br>**18:30 晚餐** | 快过408错题(操统/计网)<br>**复习(A组)** |
| **12.13 (五)** | 起床洗漱<br>**复习(E组)**<br>早餐<br>考前准备 | **【全真模拟】**<br>数学信心卷(2) (3h) | 休息<br>**12:30 午餐**<br>**13:00 午休** | **复盘**: (3h)<br>数学(卷2)分析<br>+ 政英(昨日)错题 | **复习(D组)**<br>**18:30 晚餐** | 快速过数学错题本(全)<br>**复习(C组)** |
| **12.14 (六)** | 起床洗漱<br>**复习(F组)**<br>早餐<br>考前准备 | **【全真模拟】**<br>408信心卷(2) (3h) | 休息<br>**12:30 午餐**<br>**13:00 午休** | **408复盘**: (3h)<br>对答案+分析+整理错题 | **复习(G组)**<br>**18:30 晚餐** | 快速过408错题本(全)<br>**复习(B组)** |
| **12.15 (日)** | (7:30起)<br>早餐<br>考前准备 | **【全真模拟】**<br>政治信心卷(2) (3h) | 对答案(选择题)<br>**12:30 午餐**<br>**13:00 午休** | **【全真模拟】**<br>英语信心卷(2) (3h) | 对答案(英语)<br>休息<br>**18:30 晚餐** | 复盘政英错题<br>**复习(A, B组 - 终极)** |
| **12.16 (一)** | 起床洗漱<br>**复习(E组)**<br>早餐<br>醒脑 | **数学错题总览**: (3h)<br>快速过所有错题(只看思路) | 查漏补缺<br>**12:30 午餐**<br>**13:00 午休** | **408错题总览**: (3h)<br>快速过所有错题(只看思路) | **复习(F组 & G组)**<br>**18:30 晚餐** | **复习(C, D组 - 终极)**<br>政治肖四选择题 |
| **12.17 (二)** | 起床洗漱<br>**复习(C, D组)**<br>早餐<br>醒脑 | **政治冲刺**: (3h)<br>选择题错题+肖四分析题(全力) | 默写政治框架<br>**12:30 午餐**<br>**13:00 午休** | **英语冲刺**: (3h)<br>作文最终版背诵<br>+ 完型翻译技巧 | 默写英语模板<br>**18:30 晚餐** | **政治肖四**: (3h)<br>分析题全部背诵(第1遍) |
| **12.18 (三)** | (7:00起)<br>早餐 | **【考前调整】** (8:30-11:30)<br>**数学公式通背(E组)**<br>看数学错题本(不做题) | 休息<br>**12:30 午餐**<br>**13:00 午休** | **【考前调整】** (14:00-17:00)<br>**408易错点(F组)**<br>**代码模板默写(G组)** | 放松/听音乐<br>**18:30 晚餐** | (19:00-21:00)<br>**政治肖四(A,B)**<br>**英语作文(C,D)**<br>整理考试用品<br>**21:00 休息** |
| **12.19 (四)** | (7:30起)<br>早餐 | **【考前一天】**<br>轻松翻看核心考点清单 | 休息<br>**12:30 午餐**<br>**13:00 午休** | **【考前一天】**<br>散步/看考场/放松 | **17:00 清淡晚餐** | (18:00-20:00)<br>最后看政/英<br>准备考试用品<br>**21:00 睡觉** |




---
*This is a demo note. Start by grading your recall of the information above!*

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

  // 2. Check Demo Vault - use both rootPath AND filepath pattern for robustness
  // (filepath pattern check handles race condition during async persist rehydration)
  const isDemoFile = rootPath === 'DEMO_VAULT' || filepath.startsWith('/Demo/');
  if (isDemoFile) {
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
      useToastStore.getState().addToast(
        `Failed to load note|${filepath}\n${errorMessage}`,
        'error',
      );
    }
  },

  saveCurrentNote: async (content) => {
    const {
      currentFilepath,
      dataService,
      currentVault,
      pathMap,
      updateLastSync,
      markNoteSynced,
      markNoteSyncPending,
      refreshMetadata,
    } = get();
    
    if (!currentFilepath) {
      return;
    }

    if (!isTauri()) {
      return;
    }

    await fileSystem.writeNote(currentFilepath, content);

    set((state) => {
      const existing = { ...state.contentCache };
      delete existing[currentFilepath];
      const next = { ...existing, [currentFilepath]: content };
      const keys = Object.keys(next);
      if (keys.length > MAX_CONTENT_CACHE_ENTRIES) {
        const overflow = keys.length - MAX_CONTENT_CACHE_ENTRIES;
        for (let i = 0; i < overflow; i++) {
          delete next[keys[i]];
        }
      }
      return {
        contentCache: next,
        currentNote: parseNote(content),
      } as Partial<AppState>;
    });

    // DEMO MODE: Skip cloud sync entirely - demo data should not persist
    const demoMode = isDemoMode({ rootPath: get().rootPath, currentFilepath });
    if (demoMode) {
      return;
    }

    const noteId = pathMap[currentFilepath];
    if (noteId && dataService) {
      dataService
        .syncNote(currentFilepath, content, noteId, currentVault?.id)
        .then(async () => {
          updateLastSync();
          markNoteSynced(currentFilepath);
          try {
            await refreshMetadata(currentFilepath, noteId);
          } catch (e) {
            console.error('Failed to refresh metadata after saveCurrentNote', e);
          }
        })
        .catch((e) => {
          console.error('Failed to sync note in saveCurrentNote', e);
          markNoteSyncPending(currentFilepath);
          useToastStore.getState().addToast(
            'Cloud sync failed|Your note was saved locally and will sync later.',
            'warning',
          );
        });
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

const createSmartQueueSlice: AppStateCreator<SmartQueueSlice> = (set, get) => ({
  fetchDueCards: async (limit = 50) => {
    try {
      const { dataService, currentVault } = get();
      const vaultId = currentVault?.id;
      const dueCards = await dataService.getDueCards(limit, vaultId);
      set({ queue: dueCards });
      useToastStore.getState().addToast(
        `Deck ready|Loaded ${dueCards.length} due cards.`,
        'success',
      );
    } catch (e) {
      console.error("Failed to fetch due cards", e);
      if ((e as any)?.status === 401 || (e as any)?.code === 'PGRST301') {
          get().signOut();
          useToastStore.getState().addToast(
            "Session expired|Please log in again to continue syncing.",
            'warning',
          );
          return;
      }
      useToastStore.getState().addToast(
        "Sync error|Failed to load due cards from the server.",
        'error',
      );
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

const appStoreJSONStorage = createJSONStorage(() => getStorage(), {
  reviver: (key, value) => {
    // For new data we store the entire persist payload as a Superjson string
    // at the root (key === ''). For legacy JSON data (from the previous
    // localStorage-based persist), value will be an object, so we simply
    // return it unchanged for backward compatibility.
    if (key === '' && typeof value === 'string') {
      try {
        return superjson.parse(value as string);
      } catch {
        return value;
      }
    }
    return value;
  },
  replacer: (key, value) => {
    // Only wrap the root payload; nested properties are handled by Superjson.
    if (key === '') {
      return superjson.stringify(value);
    }
    return value;
  },
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
        storage: appStoreJSONStorage,
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
          // fileMetadatas removed to avoid performance issues (Issue 7). 
          // It will be re-fetched by LibraryView -> loadAllMetadata.
          lastServerSyncAt: state.lastServerSyncAt,

          // Persist Session & View State for instant resume
          viewMode: state.viewMode,
          currentFilepath: state.currentFilepath,
          // currentNote & currentMetadata are too heavy/derived to persist. 
          // They will be re-loaded by NoteRenderer via loadNote(currentFilepath)
          currentClozeIndex: state.currentClozeIndex,

          // Persist Active Review Session
          queue: state.queue,
          sessionIndex: state.sessionIndex,
          sessionTotal: state.sessionTotal,
          sessionStats: state.sessionStats,
        }),
      },
    ),
    { name: 'app-store' },
  ),
);


import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { isTauri } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { FolderOpen, FileText, Clock, X, Brain, PenTool, Cloud } from 'lucide-react';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { join } from '@tauri-apps/api/path';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { LibraryHeader } from './LibraryHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../store/toastStore';
import { FileTreeView } from './shared/FileTreeView';
import { Card } from 'ts-fsrs';

const DashboardLazy = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));

export const LibraryView = () => {
  // ============================================================
  // ZUSTAND SELECTORS - Optimized based on Zustand best practices
  // ============================================================
  
  // 1. ACTIONS - Single selectors (stable references, never cause re-renders)
  // Actions in Zustand are stable by design, no need for useShallow
  const setRootPath = useAppStore((s) => s.setRootPath);
  const setFiles = useAppStore((s) => s.setFiles);
  const loadNote = useAppStore((s) => s.loadNote);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const loadVaults = useAppStore((s) => s.loadVaults);
  const removeRecentVault = useAppStore((s) => s.removeRecentVault);
  const signOut = useAppStore((s) => s.signOut);
  const updateLastSync = useAppStore((s) => s.updateLastSync);
  const loadAllMetadata = useAppStore((s) => s.loadAllMetadata);
  const fetchDueCards = useAppStore((s) => s.fetchDueCards);
  const manualSyncPendingNotes = useAppStore((s) => s.manualSyncPendingNotes);
  const createVault = useAppStore((s) => s.createVault);
  const loadReviewHistory = useAppStore((s) => s.loadReviewHistory);
  const dataService = useAppStore((s) => s.dataService);

  // 2. LOW-FREQUENCY DATA - Grouped with useShallow
  // These change infrequently (user actions like switching vaults, login/logout)
  const { rootPath, files, recentVaults, syncMode, currentUser, vaults } = useAppStore(
    useShallow((s) => ({
      rootPath: s.rootPath,
      files: s.files,
      recentVaults: s.recentVaults,
      syncMode: s.syncMode,
      currentUser: s.currentUser,
      vaults: s.vaults,
    }))
  );

  // 3. HIGH-FREQUENCY DATA - Individual selectors
  // fileMetadatas changes on every review - isolate to prevent cascading re-renders
  // Zustand returns the same reference if content unchanged, so this is safe
  const fileMetadatas = useAppStore((s) => s.fileMetadatas);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const addToast = useToastStore((state) => state.addToast);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewType, setViewType] = useState<'list' | 'grid' | 'tree'>('list');
  const [dashboardTab, setDashboardTab] = useState<'focus' | 'insights'>('focus');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistoryByVault, setSearchHistoryByVault] = useState<Record<string, string[]>>({});
  const [vaultOnboarded, setVaultOnboarded] = useState(false);
  const [vaultOnboardingBusy, setVaultOnboardingBusy] = useState(false);
  const [studyResourcesPrefetched, setStudyResourcesPrefetched] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]); // loadSettings is a stable reference from Zustand

  useEffect(() => {
    if (rootPath && rootPath !== 'DEMO_VAULT') {
      try {
        const key = `vaultOnboarded:${rootPath}`;
        setVaultOnboarded(localStorage.getItem(key) === '1');
      } catch {
        setVaultOnboarded(false);
      }
    } else {
      setVaultOnboarded(true);
    }
  }, [rootPath]);

  useEffect(() => {
    // Whenever we are in Supabase sync mode and the rootPath changes,
    // refresh vaults from the backend so VaultSelector sees the latest data.
    if (syncMode === 'supabase') {
      loadVaults();
    }
  }, [syncMode, rootPath, loadVaults]);

  useEffect(() => {
    if (rootPath && files.length === 0) {
      scanFiles(rootPath);
    }
  }, [rootPath, files.length]);

  useEffect(() => {
    if (studyResourcesPrefetched) return;
    if (!rootPath) return;
    if (files.length === 0) return;

    setStudyResourcesPrefetched(true);

    // Fire-and-forget: warm up heavy, soon-to-be-used resources
    (async () => {
      try {
        await Promise.allSettled([
          import('./NoteRenderer'),
          import('./modes/ClozeMode'),
          import('./modes/BlurMode'),
          import('./modes/EditMode'),
          import('./sticky/StickyBoard'),
          import('./shared/MathClozeBlock'),
          import('katex'),
          import('canvas-confetti'),
        ]);
      } catch (e) {
        console.debug('Prefetch study resources failed', e);
      }
    })();
  }, [studyResourcesPrefetched, rootPath, files.length]);

  useEffect(() => {
    const handleFocusSearch = () => {
      if (!rootPath) return;
      // We can dispatch an event or use a ref passed to header if needed
      // For now we rely on the user clicking search or using shortcut
      // Assuming LibraryHeader has its own focus logic or we might need to expose a ref
    };

    window.addEventListener('library-focus-search', handleFocusSearch as EventListener);
    return () => window.removeEventListener('library-focus-search', handleFocusSearch as EventListener);
  }, [rootPath]);

  const vaultKey = rootPath || 'NO_VAULT';
  const searchHistory = searchHistoryByVault[vaultKey] || [];

  const folderName = rootPath ? rootPath.split(/[\\/]/).pop() || rootPath : '';
  const hasLinkedVault = !!(
    rootPath &&
    rootPath !== 'DEMO_VAULT' &&
    vaults.some((v) => (v.config as any)?.rootPath === rootPath)
  );

  const showVaultOnboarding =
    syncMode === 'supabase' &&
    !!rootPath &&
    rootPath !== 'DEMO_VAULT' &&
    !hasLinkedVault &&
    !vaultOnboarded;

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const lowerQuery = searchQuery.toLowerCase();
    return files.filter(f => f.toLowerCase().includes(lowerQuery));
  }, [files, searchQuery]);

  const handleOpenFolder = async () => {
    try {
      // Check if we're in Tauri environment
      if (!isTauri()) {
        addToast("File system access is only available in the desktop app", 'warning');
        return;
      }

      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        setFiles([]);
        setRootPath(selected);
      }
    } catch (err) {
      console.error("Failed to open dialog", err);
      addToast("Failed to open dialog", 'error');
    }
  };

  const scanFiles = async (path: string) => {
    setLoading(true);
    try {
      if (path === 'DEMO_VAULT') {
        await new Promise(resolve => setTimeout(resolve, 300)); // Reduced fake loading delay
        setFiles(['/Demo/Welcome.md', '/Demo/Features.md', '/Demo/SpacedRepetition.md']);
        addToast("Loaded Demo Vault", 'success');
        setLoading(false);
        return;
      }

      // Check if we're in Tauri environment for file system access
      if (!isTauri()) {
        addToast("File system access is only available in the desktop app", 'warning');
        setLoading(false);
        return;
      }

      const mdFiles: string[] = [];
      const queue = [path];

      while (queue.length > 0) {
        const currentDir = queue.shift()!;
        try {
          const entries = await readDir(currentDir);
          for (const entry of entries) {
            const fullPath = await join(currentDir, entry.name);

            if (entry.isDirectory) {
              queue.push(fullPath);
            } else if (entry.isFile && entry.name.endsWith('.md')) {
              mdFiles.push(fullPath);
            }
          }
        } catch (e) {
          console.warn(`Failed to read dir: ${currentDir}`, e);
        }
      }
      setFiles(mdFiles);
      addToast(`Found ${mdFiles.length} notes`, 'success');
    } catch (e) {
      console.error("Scan failed", e);
      addToast("Failed to scan folder", 'error');
    } finally {
      setLoading(false);
    }
  };

  // PERFORMANCE: Memoize grouped calculation to prevent recalculation on every render
  // This is critical for 200+ files - O(N*M) date operations where N=files, M=cards per file
  const grouped = useMemo(() => {
    return filteredFiles.reduce((acc, file) => {
      const meta = fileMetadatas[file];
      if (!meta || !meta.cards) {
          acc.new.push(file); // Treat untracked as new
          return acc;
      }

      const cards = Object.values(meta.cards);
      if (cards.length === 0) {
           acc.new.push(file);
           return acc;
      }

      let hasOverdue = false;
      let hasToday = false;
      let hasNew = false;

      for (const card of cards) {
          if (!card.due) {
              if ((card as any).reps === 0) hasNew = true;
              continue;
          }

          const due = new Date(card.due as any);
          if (isNaN(due.getTime())) {
              if ((card as any).reps === 0) hasNew = true;
              continue;
          }

          const isNewCard = (card as any).reps === 0;

          if (isNewCard) {
              if (isToday(due)) {
                  hasToday = true;
              } else {
                  hasNew = true;
              }
          } else if (isPast(due) && !isToday(due)) {
              hasOverdue = true;
              break; // Overdue is highest priority, no need to check more cards
          } else if (isToday(due)) {
              hasToday = true;
          }
      }

      if (hasOverdue) acc.overdue.push(file);
      else if (hasToday) acc.today.push(file);
      else if (hasNew) acc.new.push(file);
      else acc.future.push(file);
      
      return acc;
    }, { overdue: [] as string[], today: [] as string[], new: [] as string[], future: [] as string[] });
  }, [filteredFiles, fileMetadatas]);

  const handleClearHistory = () => {
    setSearchHistoryByVault((prev: Record<string, string[]>) => {
      const next = { ...prev };
      delete next[vaultKey];
      return next;
    });
  };

  const handleSelectHistory = (query: string) => {
    setSearchQuery(query);
    setSearchHistoryByVault((prev: Record<string, string[]>) => {
      const current = prev[vaultKey] || [];
      const next = [query, ...current.filter((item) => item !== query)].slice(0, 10);
      return { ...prev, [vaultKey]: next };
    });
  };

  const markVaultOnboarded = () => {
    if (!rootPath) return;
    try {
      const key = `vaultOnboarded:${rootPath}`;
      localStorage.setItem(key, '1');
    } catch {
      // ignore storage errors
    }
    setVaultOnboarded(true);
  };

  const handleCreateFirstVault = async () => {
    if (!rootPath) return;
    try {
      setVaultOnboardingBusy(true);
      const defaultName = folderName || 'New Vault';
      const created = await createVault(defaultName, { rootPath } as any);
      if (created) {
        addToast(`Vault "${created.name}" created & linked`, 'success');
        markVaultOnboarded();
      } else {
        addToast('Failed to create vault', 'error');
      }
    } catch (e) {
      console.error('Failed to create vault for folder', e);
      addToast('Failed to create vault', 'error');
    } finally {
      setVaultOnboardingBusy(false);
    }
  };

  const handleManualSync = async () => {
    if (syncMode !== 'supabase' || !dataService) return;

    if (syncing) return;

    setSyncing(true);
    addToast('Starting cloud sync...', 'info');
    
    try {
      const { retriedCount, errorCount } = await manualSyncPendingNotes();

      // Refresh all cloud-derived state in parallel for faster UI update
      const refreshPromises = [
        loadAllMetadata().catch(e => console.error('Failed to refresh metadata after sync', e)),
        fetchDueCards(50).catch(e => console.error('Failed to refresh due cards after sync', e)),
        loadReviewHistory().catch(e => console.error('Failed to refresh review history after sync', e)),
      ];
      
      await Promise.allSettled(refreshPromises);
      updateLastSync();

      if (errorCount > 0) {
        addToast(`Sync complete. ${retriedCount} notes synced, ${errorCount} failed.`, 'warning');
      } else if (retriedCount > 0) {
        addToast(`Sync complete. ${retriedCount} notes synced.`, 'success');
      } else {
        addToast('Cloud state refreshed.', 'success');
      }
    } catch (err) {
      console.error('Manual sync error', err);
      addToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      <LibraryHeader
        rootPath={rootPath}
        setRootPath={setRootPath}
        setFiles={setFiles}
        onOpenFolder={handleOpenFolder}
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewType={viewType}
        setViewType={setViewType}
        currentUser={currentUser}
        signOut={signOut}
        syncMode={syncMode}
        lastSyncAt={lastSyncAt}
        searchHistory={searchHistory}
        onClearHistory={handleClearHistory}
        onSelectHistory={handleSelectHistory}
        onSync={handleManualSync}
        isSyncing={syncing}
        isDemo={rootPath === 'DEMO_VAULT'}
      />

      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {!rootPath ? (
            // WELCOME SCREEN
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-8 relative overflow-hidden absolute inset-0 select-none"
            >
              <div className="absolute inset-0 z-0" data-tauri-drag-region />
              
              {/* Background Blobs */}
              <motion.div 
                animate={{ scale: [1, 1.1, 1], rotate: [0, 10, 0] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" 
              />
              <motion.div 
                 animate={{ scale: [1, 1.2, 1], rotate: [0, -15, 0] }}
                 transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" 
              />

              <div className="max-w-3xl w-full z-10 flex flex-col items-center text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="mb-12 relative"
                  >
                    <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight tracking-tight drop-shadow-sm">
                      Turn notes into <br/>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary animate-gradient-x">
                        long-term memory
                      </span>
                    </h1>
                    <p className="text-xl opacity-60 max-w-2xl mx-auto leading-relaxed font-light">
                      The local-first spaced repetition player for your markdown knowledge base.
                    </p>
                  </motion.div>

                  <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="flex flex-col sm:flex-row gap-4 w-full max-w-md justify-center mb-16 relative z-20"
                  >
                      <button
                        onClick={handleOpenFolder}
                        className="btn btn-primary btn-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all gap-3 h-14 rounded-2xl text-lg"
                      >
                        <FolderOpen size={22} />
                        Open Vault
                      </button>
                      <button
                        onClick={() => { setFiles([]); setRootPath('DEMO_VAULT'); }}
                        className="btn btn-ghost btn-lg hover:bg-base-200/50 h-14 rounded-2xl text-lg"
                      >
                        Try Demo Vault
                      </button>
                  </motion.div>

                  {/* Features Grid */}
                  <motion.div
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ duration: 0.6, delay: 0.2 }}
                       className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mb-16"
                  >
                      <div className="p-6 rounded-2xl bg-base-100/80 backdrop-blur-sm border border-base-200 hover:border-primary/30 transition-all shadow-sm hover:shadow-md hover:-translate-y-1">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
                              <PenTool size={20} />
                          </div>
                          <h3 className="font-bold text-lg mb-2">Markdown Native</h3>
                          <p className="text-sm opacity-60 leading-relaxed">
                              Edit your files directly. No proprietary formats. You own your data forever.
                          </p>
                      </div>
                      <div className="p-6 rounded-2xl bg-base-100/80 backdrop-blur-sm border border-base-200 hover:border-primary/30 transition-all shadow-sm hover:shadow-md hover:-translate-y-1">
                           <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-4">
                              <Brain size={20} />
                          </div>
                          <h3 className="font-bold text-lg mb-2">Spaced Repetition</h3>
                          <p className="text-sm opacity-60 leading-relaxed">
                              Built-in FSRS algorithm schedules reviews at the perfect time to maximize retention.
                          </p>
                      </div>
                      <div className="p-6 rounded-2xl bg-base-100/80 backdrop-blur-sm border border-base-200 hover:border-primary/30 transition-all shadow-sm hover:shadow-md hover:-translate-y-1">
                           <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
                              <Cloud size={20} />
                          </div>
                          <h3 className="font-bold text-lg mb-2">Cloud Sync</h3>
                          <p className="text-sm opacity-60 leading-relaxed">
                              Seamlessly sync your review progress across devices while keeping files local.
                          </p>
                      </div>
                  </motion.div>

                  {/* Recent Vaults */}
                  {recentVaults.length > 0 && (
                     <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                          className="w-full max-w-lg"
                     >
                        <div className="divider opacity-10 mb-8">Recent Vaults</div>
                        <div className="flex flex-col gap-2">
                          {recentVaults.filter(Boolean).map(path => (
                            <div
                              key={path}
                              onClick={() => { setFiles([]); setRootPath(path); }}
                              className="group flex items-center gap-4 p-4 bg-base-100/80 backdrop-blur-sm rounded-xl hover:bg-base-100 hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer border border-transparent hover:border-primary/20"
                            >
                              <div className="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center text-base-content/50 group-hover:text-primary transition-colors">
                                  <Clock size={20} />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                  <div className="font-bold truncate text-sm" title={path}>
                                      {path?.split(/[\\/]/).pop() || 'Unknown Vault'}
                                  </div>
                                  <div className="text-xs opacity-40 truncate font-mono mt-0.5" title={path}>
                                      {path}
                                  </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeRecentVault(path); }}
                                className="btn btn-ghost btn-sm btn-square opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove from recent"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                     </motion.div>
                  )}
              </div>
            </motion.div>
          ) : (
            // MAIN LIBRARY CONTENT
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              className="p-4 md:p-6 max-w-7xl mx-auto w-full min-h-full"
            >
              <div className="flex items-center justify-between mb-6 px-1">
              <div className="relative flex p-1 bg-base-200/50 rounded-xl border border-base-300/50">
                 {/* Sliding pill indicator - CSS transition instead of layoutId */}
                 <div
                    className="absolute top-1 bottom-1 bg-base-100 shadow-sm rounded-lg border border-base-200/50 transition-all duration-200 ease-out"
                    style={{
                      width: 'calc(50% - 4px)',
                      left: dashboardTab === 'focus' ? '4px' : 'calc(50%)',
                    }}
                 />
                 {['focus', 'insights'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setDashboardTab(tab as 'focus' | 'insights')}
                        className={`relative px-4 py-1.5 text-sm font-medium transition-colors duration-150 z-10 ${dashboardTab === tab ? 'text-base-content' : 'text-base-content/50 hover:text-base-content/70'}`}
                    >
                        <span className="capitalize">{tab}</span>
                    </button>
                 ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
            {dashboardTab === 'focus' ? (
              <motion.div
                key="focus"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: "circOut" }}
                className="w-full"
              >
                {showVaultOnboarding && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full w-2 h-2 bg-primary animate-pulse" />
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-primary/80 mb-1">
                          Link this folder to a Vault
                        </div>
                        <div className="text-sm text-base-content/80">
                          {folderName ? (
                            <>
                              Use a named cloud vault for <span className="font-mono text-xs">{folderName}</span> so your
                              review progress stays in sync across devices.
                            </>
                          ) : (
                            'Create a cloud vault for this folder so your review progress stays in sync across devices.'
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        className="btn btn-ghost btn-xs normal-case text-xs"
                        onClick={() => {
                          markVaultOnboarded();
                          addToast('Staying local-only for this folder', 'info');
                        }}
                      >
                        Not now
                      </button>
                      <button
                        className="btn btn-primary btn-sm normal-case text-xs"
                        onClick={handleCreateFirstVault}
                        disabled={vaultOnboardingBusy}
                      >
                        {vaultOnboardingBusy ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <>Create Vault{folderName ? ` "${folderName}"` : ''}</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
                <Suspense fallback={<div className="w-full rounded-2xl border border-base-200 bg-base-100/60 h-40 animate-pulse" />}>
                  <DashboardLazy mode="hero-only" />
                </Suspense>

                <div className="flex items-center justify-between text-xs text-base-content/60 mt-6 mb-4 px-1">
                  <span>
                    {searchQuery.trim()
                      ? `Showing ${filteredFiles.length} of ${files.length} notes for "${searchQuery}"`
                      : `Browsing ${files.length} notes in this vault`}
                  </span>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-base-300 rounded-xl opacity-50"></div>)}
                  </div>
                ) : (
                  <div className="space-y-6 pb-20">
                    {filteredFiles.length === 0 ? (
                      <div className="mt-12 text-center text-base-content/60">
                        <p className="text-sm mb-2">No notes match your search.</p>
                        <p className="text-xs opacity-70">
                          Try a different keyword or clear the search to browse all notes.
                        </p>
                      </div>
                    ) : (
                      <>
                        {viewType === 'tree' ? (
                          <div className="bg-base-100 rounded-2xl border border-base-200 p-4 shadow-sm">
                              <FileTreeView files={filteredFiles} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} />
                          </div>
                        ) : (
                          <motion.div 
                             initial="hidden"
                             animate="visible"
                             variants={{
                                visible: { transition: { staggerChildren: 0.05 } }
                             }}
                          >
                            {grouped.overdue.length > 0 && <FileSection title="Overdue" icon="🚨" files={grouped.overdue} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="error" viewType={viewType} />}
                            {grouped.today.length > 0 && <FileSection title="Due Today" icon="📅" files={grouped.today} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="warning" viewType={viewType} />}
                            {grouped.new.length > 0 && <FileSection title="New Cards" icon="🆕" files={grouped.new} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="info" viewType={viewType} />}
                            <FileSection title="Library" icon="📚" files={grouped.future} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="neutral" collapsed={false} viewType={viewType} />
                          </motion.div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="insights"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: "circOut" }}
                className="w-full"
              >
                <Suspense fallback={<div className="w-full rounded-2xl border border-base-200 bg-base-100/60 h-40 animate-pulse" />}>
                  <DashboardLazy mode="insights-only" />
                </Suspense>
              </motion.div>
            )}
            </AnimatePresence>

          </motion.div>
        )}
        </AnimatePresence>
      </div>
  
  </div>
  );
};

/**
 * FileSection component optimized for performance.
 * 
 * Performance optimizations based on Motion best practices:
 * - Removed whileHover/whileTap from individual items (expensive with 200+ items)
 * - Using CSS transitions instead of Framer Motion for hover effects
 * - Kept container AnimatePresence for open/close animation only
 */
const FileSection = ({ title, icon, files, rootPath, loadNote, metadatas, color, collapsed = false, viewType = 'list' }: any) => {
  const [isOpen, setIsOpen] = useState(!collapsed);
  
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
        <div 
            className="flex items-center gap-2 cursor-pointer group select-none"
            onClick={() => setIsOpen(!isOpen)}
        >
            <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''} opacity-50`}>▶</span>
            <span className="text-xl font-bold tracking-tight flex items-center gap-2">
               {icon && <span>{icon}</span>} {title}
            </span>
            <div className={`badge badge-${color} badge-sm`}>{files.length}</div>
            <div className="h-px bg-base-300 flex-1 ml-2 opacity-50"></div>
        </div>

        {/* Using CSS transitions instead of AnimatePresence for better performance with 200+ items */}
        <div 
            className={`overflow-hidden transition-all duration-200 ease-out
                ${isOpen ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
            {viewType === 'list' ? (
                <div className="grid grid-cols-1 gap-1 pl-2">
                    {files.map((file: string, idx: number) => {
                        const meta = metadatas[file];
                        return (
                            <div 
                                key={idx}
                                onClick={() => loadNote(file)}
                                className="group flex items-center gap-4 p-3 rounded-lg bg-base-100/40 cursor-pointer border border-base-content/5 backdrop-blur-sm
                                    transition-all duration-150 ease-out
                                    hover:bg-base-100 hover:border-primary/20 hover:translate-x-1 hover:scale-[1.005]
                                    active:scale-[0.98] active:bg-base-200/80"
                            >
                                        <div className={`w-8 h-8 rounded flex items-center justify-center bg-base-200/50 text-base-content/50 group-hover:text-${color === 'neutral' ? 'primary' : color}`}>
                                            <FileText size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">
                                                {file.replace(rootPath || '', '').replace(/^\//, '')}
                                            </div>
                                        </div>
                                {(() => {
                                    if (!meta?.cards) return null;
                                    const cards = Object.values(meta.cards) as Card[];
                                    if (cards.length === 0) return null;

                                    const scheduled = cards.filter((c) => c.reps > 0 && c.due);
                                    if (scheduled.length === 0) return null;

                                    const earliest = scheduled.reduce((prev, curr) => {
                                        return new Date(prev.due) < new Date(curr.due) ? prev : curr;
                                    });

                                    const earliestDate = new Date(earliest.due);
                                    if (!earliestDate || isNaN(earliestDate.getTime())) return null;

                                    return (
                                        <div className="text-xs font-mono opacity-50 bg-base-200 px-2 py-1 rounded flex gap-2 items-center">
                                            <span>{cards.length} cards</span>
                                            <span>•</span>
                                            <span>{formatDistanceToNow(earliestDate, { addSuffix: true })}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            ) : (
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                    {files.map((file: string, idx: number) => {
                    const meta = metadatas[file];
                    return (
                        <div
                        key={idx}
                        onClick={() => loadNote(file)}
                        className="card bg-base-100/60 cursor-pointer p-4 flex flex-col gap-3 h-36 justify-between shadow-sm border border-base-200 backdrop-blur-sm
                            transition-all duration-150 ease-out
                            hover:bg-base-100 hover:shadow-md hover:border-primary/20 hover:scale-[1.02] hover:-translate-y-1
                            active:scale-[0.97]"
                        >
                                <div className="flex justify-between items-start">
                                    <div className={`p-2 rounded-lg bg-${color === 'neutral' ? 'base-200' : color + '/10'} text-${color === 'neutral' ? 'base-content' : color}`}>
                                        <FileText size={20} />
                                    </div>
                                    {(() => {
                                        if (!meta?.cards) return null;
                                        const cards = Object.values(meta.cards) as Card[];
                                        const count = cards.length;
                                        if (count === 0) return null;

                                        const scheduled = cards.filter((c) => c.reps > 0 && c.due);
                                        if (scheduled.length === 0) return null;

                                        const earliest = scheduled.reduce((prev, curr) =>
                                            new Date(prev.due) < new Date(curr.due) ? prev : curr,
                                        );

                                        const earliestDate = new Date(earliest.due);
                                        if (!earliestDate || isNaN(earliestDate.getTime())) return null;

                                        return (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-base-200 opacity-60`}>
                                                {formatDistanceToNow(earliestDate)}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <span className="font-bold text-sm line-clamp-2 leading-snug" title={file}>
                            {file.replace(rootPath || '', '').replace(/^\//, '')}
                        </span>
                        </div>
                    );
                    })}
                </div>
            )}
        </div>
    </div>
  );
};

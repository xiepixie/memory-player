import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { isTauri } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { FolderOpen, FileText, Clock, X, LayoutGrid, List, FolderTree, Brain, PenTool, Cloud, Search } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { join } from '@tauri-apps/api/path';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { ThemeController } from './shared/ThemeController';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../store/toastStore';
import { FileTreeView } from './shared/FileTreeView';
import { Card } from 'ts-fsrs';
import { VaultSelector } from './dashboard/VaultSelector';

const DashboardLazy = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));

export const LibraryView = () => {
  const {
    rootPath,
    files,
    fileMetadatas,
    setRootPath,
    setFiles,
    loadNote,
    loadSettings,
    loadVaults,
    recentVaults,
    removeRecentVault,
    syncMode,
    lastSyncAt,
    currentUser,
    signOut,
  } = useAppStore(
    useShallow((state) => ({
      rootPath: state.rootPath,
      files: state.files,
      fileMetadatas: state.fileMetadatas,
      setRootPath: state.setRootPath,
      setFiles: state.setFiles,
      loadNote: state.loadNote,
      loadSettings: state.loadSettings,
      loadVaults: state.loadVaults,
      recentVaults: state.recentVaults,
      removeRecentVault: state.removeRecentVault,
      syncMode: state.syncMode,
      lastSyncAt: state.lastSyncAt,
      currentUser: state.currentUser,
      signOut: state.signOut,
    })),
  );
  const addToast = useToastStore((state) => state.addToast);
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState<'list' | 'grid' | 'tree'>('list');
  const [dashboardTab, setDashboardTab] = useState<'focus' | 'insights'>('focus');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistoryByVault, setSearchHistoryByVault] = useState<Record<string, string[]>>({});
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draftBeforeHistory, setDraftBeforeHistory] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState(new Date());
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Whenever we are in Supabase sync mode and the rootPath changes,
    // refresh vaults from the backend so VaultSelector sees the latest data.
    if (syncMode === 'supabase') {
      loadVaults();
    }
  }, [syncMode, rootPath, loadVaults]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rootPath && files.length === 0) {
      scanFiles(rootPath);
    }
  }, [rootPath, files.length]);

  useEffect(() => {
    const handleFocusSearch = () => {
      if (!rootPath) return;
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    };

    window.addEventListener('library-focus-search', handleFocusSearch as EventListener);
    return () => window.removeEventListener('library-focus-search', handleFocusSearch as EventListener);
  }, [rootPath]);

  const vaultKey = rootPath || 'NO_VAULT';
  const searchHistory = searchHistoryByVault[vaultKey] || [];

  const syncLabel = syncMode === 'supabase' ? 'Cloud (Supabase)' : 'Local-only';
  const lastSyncText = useMemo(() => (
    syncMode === 'supabase'
      ? lastSyncAt
        ? `Last cloud sync ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
        : 'No cloud sync yet'
      : 'Cloud sync disabled'
  ), [syncMode, lastSyncAt, now]);

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

  const grouped = filteredFiles.reduce((acc, file) => {
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

    cards.forEach(card => {
        const due = new Date(card.due);
        if (card.reps === 0) hasNew = true;
        else if (isPast(due) && !isToday(due)) hasOverdue = true;
        else if (isToday(due)) hasToday = true;
    });

    if (hasOverdue) acc.overdue.push(file);
    else if (hasToday) acc.today.push(file);
    else if (hasNew) acc.new.push(file);
    else acc.future.push(file);
    
    return acc;
  }, { overdue: [] as string[], today: [] as string[], new: [] as string[], future: [] as string[] });

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Navbar */}
      <div className="navbar h-16 min-h-[4rem] bg-base-100/80 backdrop-blur-md border-b border-base-200 px-4 shrink-0 sticky top-0 z-20 gap-4 justify-between">
        {/* LEFT: Brand + Vault context */}
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
            onClick={() => {
              setRootPath(null);
              setFiles([]);
            }}
            title="Return to Home"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Brain size={20} />
            </div>
            <span className="font-bold text-lg tracking-tight hidden xl:inline">Memory Player</span>
          </div>

          {rootPath && (
            <>
              <div className="h-6 w-px bg-base-300 mx-1 hidden sm:block" />
              <div className="flex items-center gap-2 min-w-0">
                <VaultSelector />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn btn-sm btn-square btn-ghost text-base-content/60"
                  onClick={handleOpenFolder}
                  disabled={loading}
                  title="Change folder"
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <FolderOpen size={18} />
                  )}
                </motion.button>
              </div>
            </>
          )}
        </div>

        {/* CENTER: Search */}
        {rootPath && (
          <div className="flex-1 max-w-xl mx-auto group relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40 group-focus-within:text-primary transition-colors z-10" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search notes..."
              className="input input-sm h-10 w-full pl-10 pr-8 bg-base-200/50 focus:bg-base-100 border-transparent focus:border-primary/20 rounded-xl transition-all shadow-sm focus:shadow-md text-sm"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 100)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHistoryIndex(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const trimmed = searchQuery.trim();
                  if (trimmed) {
                    setSearchHistoryByVault((prev: Record<string, string[]>) => {
                      const current = prev[vaultKey] || [];
                      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 10);
                      return { ...prev, [vaultKey]: next };
                    });
                  }
                  setHistoryIndex(null);
                  setDraftBeforeHistory('');
                  if (historyIndex !== null) {
                    setIsSearchFocused(false);
                  }
                }

                if (e.key === 'ArrowUp') {
                  if (!searchHistory.length) return;
                  e.preventDefault();
                  setHistoryIndex((prev) => {
                    if (searchHistory.length === 0) return prev;
                    const nextIndex = prev === null ? 0 : Math.min(prev + 1, searchHistory.length - 1);
                    const nextQuery = searchHistory[nextIndex] || '';
                    if (prev === null) {
                      setDraftBeforeHistory(searchQuery);
                    }
                    setSearchQuery(nextQuery);
                    return nextIndex;
                  });
                }

                if (e.key === 'ArrowDown') {
                  if (!searchHistory.length) return;
                  e.preventDefault();
                  setHistoryIndex((prev) => {
                    if (prev === null) return prev;
                    if (prev === 0) {
                      setSearchQuery(draftBeforeHistory);
                      setDraftBeforeHistory('');
                      return null;
                    }
                    const nextIndex = prev - 1;
                    const nextQuery = searchHistory[nextIndex] || '';
                    setSearchQuery(nextQuery);
                    return nextIndex;
                  });
                }

                if (e.key === 'Tab' && searchHistory.length > 0) {
                  e.preventDefault();
                  setHistoryIndex((prev) => {
                    if (searchHistory.length === 0) return prev;
                    let nextIndex: number;
                    if (prev === null) {
                      setDraftBeforeHistory(searchQuery);
                      nextIndex = e.shiftKey ? searchHistory.length - 1 : 0;
                    } else if (e.shiftKey) {
                      nextIndex = prev === 0 ? searchHistory.length - 1 : prev - 1;
                    } else {
                      nextIndex = prev === searchHistory.length - 1 ? 0 : prev + 1;
                    }
                    const nextQuery = searchHistory[nextIndex] || '';
                    setSearchQuery(nextQuery);
                    return nextIndex;
                  });
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {isSearchFocused && searchHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-lg bg-base-100 border border-base-200 overflow-hidden z-30">
                <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wide text-base-content/40 bg-base-100/90">
                  <span>Recent searches</span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearchHistoryByVault((prev: Record<string, string[]>) => {
                        const next = { ...prev };
                        delete next[vaultKey];
                        return next;
                      });
                      setHistoryIndex(null);
                      setDraftBeforeHistory('');
                    }}
                    className="text-[10px] font-medium normal-case text-primary hover:text-primary/80"
                  >
                    Clear vault history
                  </button>
                </div>
                <ul className="max-h-60 overflow-y-auto py-1 text-sm">
                  {searchHistory.map((query, index) => (
                    <li key={`${query}-${index}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchQuery(query);
                          setIsSearchFocused(false);
                          setSearchHistoryByVault((prev: Record<string, string[]>) => {
                            const current = prev[vaultKey] || [];
                            const next = [query, ...current.filter((item) => item !== query)].slice(0, 10);
                            return { ...prev, [vaultKey]: next };
                          });
                        }}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-base-200/80 ${historyIndex === index ? 'bg-base-200/80' : ''}`}
                      >
                        <span className="truncate">{query}</span>
                        <span className="ml-2 flex items-center text-base-content/40">
                          <Clock size={12} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* RIGHT: View toggles + Account/Cloud + Theme */}
        <div className="flex items-center gap-3 shrink-0">
          {rootPath && (
            <>
              <div className="join bg-base-200/50 p-0.5 rounded-lg hidden lg:flex">
                <button
                  className={`join-item btn btn-xs btn-ghost ${viewType === 'list' ? 'bg-base-100 shadow-sm' : ''}`}
                  onClick={() => setViewType('list')}
                  title="List View"
                >
                  <List size={14} />
                </button>
                <button
                  className={`join-item btn btn-xs btn-ghost ${viewType === 'grid' ? 'bg-base-100 shadow-sm' : ''}`}
                  onClick={() => setViewType('grid')}
                  title="Grid View"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  className={`join-item btn btn-xs btn-ghost ${viewType === 'tree' ? 'bg-base-100 shadow-sm' : ''}`}
                  onClick={() => setViewType('tree')}
                  title="Tree View"
                >
                  <FolderTree size={14} />
                </button>
              </div>

              <div className="relative">
                {syncMode === 'supabase' && currentUser ? (
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setIsAccountOpen((open) => !open)}
                      className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-base-200 transition-colors border border-transparent hover:border-base-300"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary-focus text-primary-content flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-base-100">
                        {(currentUser.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-bold opacity-80">My Vault</span>
                        <span className="text-[9px] font-mono opacity-50 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-success" />
                          Synced
                        </span>
                      </div>
                    </button>

                    {isAccountOpen && (
                      <div className="absolute right-0 top-full mt-2 w-64 bg-base-100 rounded-xl shadow-xl border border-base-200 overflow-hidden z-50">
                        <div className="p-4 bg-base-200/30 border-b border-base-200">
                          <div className="text-xs font-bold text-base-content/60 uppercase tracking-wider mb-1">
                            Signed in as
                          </div>
                          <div className="font-bold truncate">{currentUser.email}</div>
                          <div className="text-xs opacity-50 mt-1 font-mono">{currentUser.id}</div>
                        </div>
                        <div className="p-2 space-y-1">
                          <div className="px-3 py-2 text-xs flex justify-between items-center bg-base-200/50 rounded-lg">
                            <span className="opacity-70">Cloud Sync</span>
                            <span className="text-success font-bold flex items-center gap-1.5">
                              <Cloud size={12} /> Active
                            </span>
                          </div>
                          <div className="px-3 py-1 text-[10px] opacity-40 text-right">{lastSyncText}</div>
                        </div>
                        <div className="divider my-0" />
                        <div className="p-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setIsAccountOpen(false);
                              await signOut();
                            }}
                            className="btn btn-sm btn-ghost w-full text-error justify-start gap-2 hover:bg-error/10"
                          >
                            <span className="w-2 h-2 rounded-full bg-error" />
                            Sign out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 px-2 py-1 bg-base-200/50 rounded-lg text-xs opacity-60"
                    title="Cloud sync disabled"
                  >
                    <Cloud size={14} />
                    <span className="hidden sm:inline">{syncLabel}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <ThemeController />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!rootPath ? (
          // WELCOME SCREEN
          <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-8 relative overflow-hidden">
            
            {/* Background Blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

            <div className="max-w-3xl w-full z-10 flex flex-col items-center text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="mb-12"
                >
                  <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight tracking-tight">
                    Turn your notes into <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                      long-term memory
                    </span>
                  </h1>
                  <p className="text-xl opacity-60 max-w-2xl mx-auto leading-relaxed">
                    The local-first spaced repetition player for your markdown knowledge base.
                  </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="flex flex-col sm:flex-row gap-4 w-full max-w-md justify-center mb-16"
                >
                    <button
                      onClick={handleOpenFolder}
                      className="btn btn-primary btn-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all gap-3"
                    >
                      <FolderOpen size={20} />
                      Open Vault
                    </button>
                    <button
                      onClick={() => { setFiles([]); setRootPath('DEMO_VAULT'); }}
                      className="btn btn-ghost btn-lg hover:bg-base-200/50"
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
          </div>
        ) : (
          // MAIN LIBRARY CONTENT
          <div className="p-4 md:p-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="join bg-base-200/50 p-1 rounded-lg border border-base-300/50">
                <button
                  className={`join-item btn btn-xs sm:btn-sm btn-ghost ${dashboardTab === 'focus' ? 'bg-base-100 shadow-sm' : ''}`}
                  onClick={() => setDashboardTab('focus')}
                >
                  Focus
                </button>
                <button
                  className={`join-item btn btn-xs sm:btn-sm btn-ghost ${dashboardTab === 'insights' ? 'bg-base-100 shadow-sm' : ''}`}
                  onClick={() => setDashboardTab('insights')}
                >
                  Insights
                </button>
              </div>
            </div>

            {dashboardTab === 'focus' ? (
              <>
                <Suspense fallback={<div className="w-full rounded-2xl border border-base-200 bg-base-100/60 h-40 animate-pulse" />}>
                  <DashboardLazy mode="hero-only" />
                </Suspense>

                <div className="flex items-center justify-between text-xs text-base-content/60 mt-2 mb-4 px-1">
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
                          <>
                            {grouped.overdue.length > 0 && <FileSection title="Overdue" icon="🚨" files={grouped.overdue} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="error" viewType={viewType} />}
                            {grouped.today.length > 0 && <FileSection title="Due Today" icon="📅" files={grouped.today} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="warning" viewType={viewType} />}
                            {grouped.new.length > 0 && <FileSection title="New Cards" icon="🆕" files={grouped.new} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="info" viewType={viewType} />}
                            <FileSection title="Library" icon="📚" files={grouped.future} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="neutral" collapsed={false} viewType={viewType} />
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Suspense fallback={<div className="w-full rounded-2xl border border-base-200 bg-base-100/60 h-40 animate-pulse" />}>
                <DashboardLazy mode="insights-only" />
              </Suspense>
            )}
          </div>
        )}
      </div>
  
  </div>
  );
};

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

        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    {viewType === 'list' ? (
                        <div className="grid grid-cols-1 gap-1 pl-2">
                            {files.map((file: string, idx: number) => {
                                const meta = metadatas[file];
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => loadNote(file)}
                                        className="group flex items-center gap-4 p-3 rounded-lg bg-base-100/40 hover:bg-base-100 cursor-pointer border border-base-content/5 hover:border-primary/20 transition-all backdrop-blur-sm"
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
                                className="card bg-base-100/60 hover:bg-base-100 hover:scale-[1.02] transition-all cursor-pointer p-4 flex flex-col gap-3 h-36 justify-between shadow-sm hover:shadow-md border border-base-200 hover:border-primary/20 backdrop-blur-sm"
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
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
};

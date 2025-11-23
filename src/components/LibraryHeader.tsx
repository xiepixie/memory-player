import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, FolderOpen, Search, X, Clock, Cloud, 
  LayoutGrid, List, FolderTree, LogOut, ChevronDown, RefreshCw
} from 'lucide-react';
import { VaultSelector } from './dashboard/VaultSelector';
import { ThemeController } from './shared/ThemeController';
import { formatDistanceToNow } from 'date-fns';
import { useRef, useState, useEffect } from 'react';

interface Props {
  rootPath: string | null;
  setRootPath: (path: string | null) => void;
  setFiles: (files: string[]) => void;
  onOpenFolder: () => void;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  viewType: 'list' | 'grid' | 'tree';
  setViewType: (t: 'list' | 'grid' | 'tree') => void;
  currentUser: any;
  signOut: () => Promise<void>;
  syncMode: string;
  lastSyncAt: Date | null;
  searchHistory: string[];
  onClearHistory: () => void;
  onSelectHistory: (q: string) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export const LibraryHeader = ({
  rootPath,
  setRootPath,
  setFiles,
  onOpenFolder,
  loading,
  searchQuery,
  setSearchQuery,
  viewType,
  setViewType,
  currentUser,
  signOut,
  syncMode,
  lastSyncAt,
  searchHistory,
  onClearHistory,
  onSelectHistory,
  onSync,
  isSyncing = false
}: Props) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draftBeforeHistory, setDraftBeforeHistory] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset history index when search query changes manually
  useEffect(() => {
    if (historyIndex === null) {
      // Only reset if we're not currently navigating history
    }
  }, [searchQuery]);

  // Close account dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isAccountOpen && !(event.target as Element).closest('.account-dropdown')) {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAccountOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = searchQuery.trim();
      if (trimmed) {
        // Update history via parent prop if needed, but the parent likely handles this on search execution
        // We'll assume the parent observes searchQuery or we might need a specific 'onSearch' prop.
        // For now, the parent's `onSelectHistory` adds to history, but plain enter just searches.
        // The original code added to history on Enter.
        // We should probably call a prop to add to history.
        // Let's use onSelectHistory as a "Search Executed" hook for now if it updates history, 
        // OR ideally we should have `onSearch(query)` prop. 
        // Re-reading the original code: it updated history directly in the component.
        // Here we need to use the parent's history updater.
        // The parent passed `onSelectHistory` which updates history. Let's use that.
         onSelectHistory(trimmed);
      }
      setHistoryIndex(null);
      setDraftBeforeHistory('');
      if (historyIndex !== null) {
        setIsSearchFocused(false);
      }
      (e.target as HTMLInputElement).blur();
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
  };

  const syncLabel = syncMode === 'supabase' ? 'Cloud (Supabase)' : 'Local-only';
  const lastSyncText = syncMode === 'supabase' 
    ? lastSyncAt 
      ? `Last cloud sync ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
      : 'No cloud sync yet'
    : 'Cloud sync disabled';

  return (
    <motion.div 
      className="navbar h-16 min-h-[4rem] bg-base-100/60 backdrop-blur-xl border-b border-white/5 px-4 shrink-0 sticky top-0 z-50 gap-4 justify-between select-none relative"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Drag Region */}
      <div className="absolute inset-0 z-0" data-tauri-drag-region />

      {/* LEFT: Brand + Vault context */}
      <div className="flex items-center gap-4 min-w-0 relative z-10 pointer-events-none">
        <motion.div
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity shrink-0 pointer-events-auto"
          onClick={() => {
            setRootPath(null);
            setFiles([]);
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Return to Home"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner ring-1 ring-white/10">
            <Brain size={22} />
          </div>
          <span className="font-bold text-lg tracking-tight hidden xl:inline bg-clip-text text-transparent bg-gradient-to-r from-base-content to-base-content/70">
            Memory Player
          </span>
        </motion.div>

        {rootPath && (
          <>
            <div className="h-8 w-px bg-base-content/10 mx-1 hidden sm:block" />
            <motion.div 
              className="flex items-center gap-2 min-w-0 pointer-events-auto"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <VaultSelector />
              <motion.button
                whileHover={{ scale: 1.05, backgroundColor: "var(--fallback-b2,oklch(var(--b2)/0.5))" }}
                whileTap={{ scale: 0.95 }}
                className="btn btn-sm btn-square btn-ghost text-base-content/60 rounded-lg"
                onClick={onOpenFolder}
                disabled={loading}
                title="Change folder"
              >
                {loading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <FolderOpen size={18} />
                )}
              </motion.button>
            </motion.div>
          </>
        )}
      </div>

      {/* CENTER: Search */}
      {rootPath && (
        <motion.div 
          className="flex-1 max-w-xl mx-auto group relative z-20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <motion.div 
            layoutId="search-container"
            className={`relative rounded-xl transition-all duration-300 ${isSearchFocused ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
          >
              <div className={`absolute inset-0 bg-primary/5 rounded-xl blur-lg transition-opacity duration-300 ${isSearchFocused ? 'opacity-100' : 'opacity-0'}`} />
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors z-10 ${isSearchFocused ? 'text-primary' : 'text-base-content/40'}`} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes..."
                id="library-note-search"
                name="libraryNoteSearch"
                className={`input input-sm h-10 w-full pl-10 pr-8 bg-base-200/50 focus:bg-base-100 border-transparent focus:border-primary/20 rounded-xl transition-all shadow-sm text-sm relative z-10 placeholder:text-base-content/30`}
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors z-10"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
          </motion.div>

          {/* Search History Dropdown */}

          {/* Search History Dropdown */}
          {isSearchFocused && searchHistory.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-xl bg-base-100 border border-base-200/80 backdrop-blur-xl overflow-hidden z-30"
            >
              <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wide text-base-content/40 bg-base-200/30">
                <span>Recent searches</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onClearHistory}
                  className="text-[10px] font-medium normal-case text-primary hover:text-primary/80 transition-colors"
                >
                  Clear history
                </button>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {searchHistory.map((query, index) => (
                  <li key={`${query}-${index}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectHistory(query)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left transition-colors text-sm group/item ${
                        index === historyIndex ? 'bg-base-200/80 text-primary' : 'hover:bg-primary/5'
                      }`}
                    >
                      <span className={`truncate transition-colors ${index === historyIndex ? 'text-primary font-medium' : 'group-hover/item:text-primary'}`}>
                        {query}
                      </span>
                      <Clock size={12} className={`text-base-content/30 ${index === historyIndex ? 'text-primary/50' : 'group-hover/item:text-primary/50'}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* RIGHT: Actions */}
      <div className="flex items-center gap-2 shrink-0 relative z-20">
        {rootPath && (
          <motion.div 
            className="flex items-center gap-2 mr-2"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* View Toggle */}
            <div className="bg-base-200/50 p-1 rounded-lg flex gap-1 border border-base-200">
              {[
                { id: 'list', icon: List, label: 'List' },
                { id: 'grid', icon: LayoutGrid, label: 'Grid' },
                { id: 'tree', icon: FolderTree, label: 'Tree' }
              ].map((view) => (
                <button
                  key={view.id}
                  onClick={() => setViewType(view.id as any)}
                  className={`relative p-1.5 rounded-md transition-all ${
                    viewType === view.id ? 'text-primary shadow-sm' : 'text-base-content/50 hover:text-base-content'
                  }`}
                  title={`${view.label} View`}
                >
                  {viewType === view.id && (
                    <motion.div
                      layoutId="view-toggle-bg"
                      className="absolute inset-0 bg-base-100 rounded-md border border-base-200/50 shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <view.icon size={16} className="relative z-10" />
                </button>
              ))}
            </div>

            {/* Account Status */}
            <div className="relative account-dropdown flex items-center gap-2">
              {syncMode === 'supabase' && currentUser ? (
                <>
                  {onSync && (
                    <button
                      onClick={onSync}
                      className={`btn btn-circle btn-xs btn-ghost ${isSyncing ? 'animate-spin text-primary' : 'text-base-content/50 hover:text-primary'}`}
                      disabled={isSyncing}
                      title="Sync now"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsAccountOpen(!isAccountOpen)}
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-base-200 transition-all border border-transparent hover:border-base-300 group"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-focus text-primary-content flex items-center justify-center text-xs font-bold shadow-md ring-2 ring-base-100 group-hover:ring-primary/30 transition-all">
                      {(currentUser.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex flex-col items-start leading-none mr-1">
                      <span className="text-[11px] font-bold opacity-90">My Vault</span>
                      <span className="text-[9px] font-mono opacity-50 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        Synced
                      </span>
                    </div>
                    <ChevronDown size={14} className={`opacity-40 transition-transform duration-300 ${isAccountOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isAccountOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 top-full mt-3 w-72 bg-base-100 rounded-2xl shadow-2xl border border-base-200 overflow-hidden z-50"
                      >
                        <div className="p-5 bg-gradient-to-br from-base-200/50 to-base-200/10 border-b border-base-200">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-focus text-primary-content flex items-center justify-center text-lg font-bold shadow-inner">
                              {(currentUser.email || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-base-content/60 uppercase tracking-wider mb-0.5">
                                  Signed in as
                                </div>
                                <div className="font-bold truncate text-sm">{currentUser.email}</div>
                            </div>
                          </div>
                          <div className="text-[10px] opacity-50 font-mono bg-base-100/50 px-2 py-1 rounded-md truncate border border-base-200/50">
                            ID: {currentUser.id}
                          </div>
                        </div>
                        
                        <div className="p-2 space-y-1">
                          <div className="px-3 py-2.5 text-xs flex justify-between items-center bg-base-200/30 rounded-xl border border-base-200/30">
                            <div className="flex items-center gap-2 opacity-70">
                                <Cloud size={14} />
                                <span>Sync Status</span>
                            </div>
                            <span className="text-success font-bold bg-success/10 px-2 py-0.5 rounded-full text-[10px]">
                              Active
                            </span>
                          </div>
                          <div className="px-3 py-1 text-[10px] opacity-40 text-right">{lastSyncText}</div>
                        </div>
                        
                        <div className="divider my-0 opacity-50" />
                        
                        <div className="p-2">
                          <button
                            onClick={async () => {
                              setIsAccountOpen(false);
                              await signOut();
                            }}
                            className="btn btn-sm btn-ghost w-full text-error justify-start gap-3 hover:bg-error/10 h-10 rounded-xl"
                          >
                            <LogOut size={16} />
                            Sign out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-base-200/50 rounded-full text-xs opacity-60 border border-base-300/50"
                  title="Cloud sync disabled"
                >
                  <Cloud size={14} />
                  <span className="hidden sm:inline font-medium">{syncLabel}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div className="h-8 w-px bg-base-300 mx-1" />
        <ThemeController />
      </div>
    </motion.div>
  );
};

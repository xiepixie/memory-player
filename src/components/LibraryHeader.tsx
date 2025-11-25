import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, FolderOpen, Search, X, Clock, Cloud, 
  LayoutGrid, List, FolderTree, LogOut, ChevronDown, RefreshCw,
  CloudOff, CheckCircle, Folder, FlaskConical
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
  isDemo?: boolean;
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
  isSyncing = false,
  isDemo = false
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

  // Demo mode overrides sync label
  const syncLabel = isDemo 
    ? 'Demo Mode' 
    : syncMode === 'supabase' 
      ? 'Cloud (Supabase)' 
      : 'Local-only';
  const lastSyncText = isDemo
    ? 'Data will not be saved'
    : syncMode === 'supabase' 
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
              {/* Show VaultSelector only in cloud mode, otherwise show folder name */}
              {syncMode === 'supabase' ? (
                <VaultSelector />
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-base-200/50 rounded-lg border border-transparent">
                  <div className="p-1 rounded-md bg-base-300 text-base-content/50">
                    <Folder size={14} />
                  </div>
                  <span className="text-xs font-bold leading-none max-w-[120px] truncate text-base-content/80" title={rootPath}>
                    {rootPath === 'DEMO_VAULT' ? 'Demo Vault' : rootPath.split(/[\\/]/).pop()}
                  </span>
                </div>
              )}
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
          className="flex-1 max-w-xl mx-auto relative z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.2 }}
        >
          <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-150 z-10 pointer-events-none ${isSearchFocused ? 'text-primary' : 'text-base-content/40'}`} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes..."
                id="library-note-search"
                name="libraryNoteSearch"
                autoComplete="off"
                className={`input input-sm h-10 w-full pl-10 pr-8 rounded-xl text-sm transition-colors duration-150
                  bg-base-200/50 border-transparent placeholder:text-base-content/30
                  focus:bg-base-100 focus:border-primary/30 focus:ring-2 focus:ring-primary/10`}
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 150)}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-base-content/40 hover:text-base-content hover:bg-base-300/50 transition-colors z-10"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
          </div>

          {/* Search History Dropdown */}
          {isSearchFocused && searchHistory.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-1.5 rounded-xl shadow-xl bg-base-100 border border-base-200 overflow-hidden z-30"
            >
              <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wider text-base-content/40 bg-base-200/30 border-b border-base-200/50">
                <span className="font-bold">Recent</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onClearHistory}
                  className="text-[10px] font-medium normal-case text-error/60 hover:text-error transition-colors"
                >
                  Clear
                </button>
              </div>
              <ul className="max-h-48 overflow-y-auto py-1">
                {searchHistory.map((query, index) => (
                  <li key={`${query}-${index}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectHistory(query)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors text-sm ${
                        index === historyIndex ? 'bg-primary/10 text-primary' : 'hover:bg-base-200/50'
                      }`}
                    >
                      <Clock size={12} className="text-base-content/30 shrink-0" />
                      <span className="truncate">{query}</span>
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

            {/* Account & Sync Status - Unified Design */}
            <div className="relative account-dropdown flex items-center">
              {/* Demo Mode Indicator - Takes priority over other states */}
              {isDemo ? (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-xl text-xs border border-warning/30"
                  title="Demo Mode - Data will not be saved"
                >
                  <FlaskConical size={14} className="text-warning" />
                  <span className="font-medium text-warning hidden sm:inline">Demo Mode</span>
                </div>
              ) : syncMode === 'supabase' && currentUser ? (
                <div className="flex items-center gap-1 bg-base-200/30 rounded-xl p-1 border border-base-200/50">
                  {/* Sync Button */}
                  {onSync && (
                    <button
                      onClick={onSync}
                      disabled={isSyncing}
                      className={`btn btn-sm btn-ghost gap-1.5 h-8 px-2.5 rounded-lg transition-all
                        ${isSyncing ? 'text-primary' : 'text-base-content/60 hover:text-primary hover:bg-primary/10'}`}
                      title={isSyncing ? 'Syncing...' : `Sync now • ${lastSyncText}`}
                    >
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                      <span className="text-xs font-medium hidden lg:inline">
                        {isSyncing ? 'Syncing' : 'Sync'}
                      </span>
                    </button>
                  )}
                  
                  {/* Divider */}
                  <div className="w-px h-5 bg-base-300/50" />
                  
                  {/* Account Button */}
                  <button
                    onClick={() => setIsAccountOpen(!isAccountOpen)}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all
                      ${isAccountOpen ? 'bg-base-300/50' : 'hover:bg-base-300/30'}`}
                  >
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-content flex items-center justify-center text-[11px] font-bold shadow-sm">
                        {(currentUser.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                      {/* Online indicator */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-base-100" />
                    </div>
                    <ChevronDown size={12} className={`text-base-content/40 transition-transform duration-200 ${isAccountOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Account Dropdown */}
                  <AnimatePresence>
                    {isAccountOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-72 bg-base-100 rounded-2xl shadow-2xl border border-base-200 overflow-hidden z-50"
                      >
                        {/* User Info Header */}
                        <div className="p-4 bg-gradient-to-br from-primary/5 to-transparent border-b border-base-200/50">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-content flex items-center justify-center text-base font-bold shadow-inner">
                              {(currentUser.email || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm truncate">{currentUser.email}</div>
                              <div className="text-[10px] text-base-content/50 font-mono truncate mt-0.5">
                                {currentUser.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sync Status Card */}
                        <div className="p-3">
                          <div className="bg-base-200/30 rounded-xl p-3 border border-base-200/50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Cloud size={14} className="text-primary" />
                                Cloud Sync
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                                <CheckCircle size={10} />
                                Active
                              </div>
                            </div>
                            <div className="text-[11px] text-base-content/50">
                              {lastSyncText}
                            </div>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="p-2 pt-0 space-y-1">
                          <button
                            onClick={async () => {
                              setIsAccountOpen(false);
                              await signOut();
                            }}
                            className="btn btn-sm btn-ghost w-full text-error/80 justify-start gap-2.5 hover:bg-error/10 hover:text-error h-9 rounded-lg"
                          >
                            <LogOut size={14} />
                            Sign out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                /* Local-only mode indicator */
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-base-200/30 rounded-xl text-xs border border-base-200/50"
                  title="Cloud sync disabled - Sign in to enable"
                >
                  <CloudOff size={14} className="text-base-content/40" />
                  <span className="font-medium text-base-content/50 hidden sm:inline">{syncLabel}</span>
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

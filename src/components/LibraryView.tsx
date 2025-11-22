import { useAppStore } from '../store/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { FolderOpen, FileText, Clock, X, LayoutGrid, List, FolderTree, Brain, PenTool, Cloud } from 'lucide-react';
import { useState, useEffect } from 'react';
import { join } from '@tauri-apps/api/path';
import { Dashboard } from './Dashboard';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { ThemeController } from './shared/ThemeController';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../store/toastStore';
import { FileTreeView } from './shared/FileTreeView';

export const LibraryView = () => {
  const { rootPath, files, fileMetadatas, setRootPath, setFiles, loadNote, initDataService, loadSettings, recentVaults, removeRecentVault } = useAppStore();
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState<'list' | 'grid' | 'tree'>('list');

  useEffect(() => {
    initDataService('mock');
    loadSettings();
  }, []);

  useEffect(() => {
    if (rootPath && files.length === 0) {
      scanFiles(rootPath);
    }
  }, [rootPath]);

  const handleOpenFolder = async () => {
    try {
      // Check if we're in Tauri environment
      if (typeof window.__TAURI__ === 'undefined') {
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
      if (typeof window.__TAURI__ === 'undefined') {
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

  const grouped = files.reduce((acc, file) => {
    const meta = fileMetadatas[file];
    const isNew = !meta?.card || meta.card.reps === 0;
    const dueDate = meta?.card?.due ? new Date(meta.card.due) : null;

    if (isNew) {
      acc.new.push(file);
    } else if (dueDate && isPast(dueDate) && !isToday(dueDate)) {
      acc.overdue.push(file);
    } else if (dueDate && isToday(dueDate)) {
      acc.today.push(file);
    } else {
      acc.future.push(file);
    }
    return acc;
  }, { overdue: [] as string[], today: [] as string[], new: [] as string[], future: [] as string[] });

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Navbar */}
      <div className="navbar bg-base-100/80 backdrop-blur-md border-b border-base-200 px-4 h-16 shrink-0 sticky top-0 z-20">
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Brain size={20} />
             </div>
             <span className="font-bold text-lg tracking-tight">Memory Player</span>
          </div>
        </div>
        <div className="flex-none gap-2">
          {rootPath && (
            <div className="join bg-base-200/50 p-1 rounded-lg mr-2 border border-base-300/50">
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
          )}
          <ThemeController />
          {rootPath && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn btn-sm btn-ghost gap-2"
                onClick={handleOpenFolder}
                disabled={loading}
            >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : <FolderOpen size={16} />}
                Change
            </motion.button>
          )}
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
                        {recentVaults.map(path => (
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
                                    {path.split(/[\\/]/).pop()}
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
            <Dashboard />
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-base-300 rounded-xl opacity-50"></div>)}
              </div>
            ) : (
              <div className="space-y-6 pb-20">
                {viewType === 'tree' ? (
                  <div className="bg-base-100 rounded-2xl border border-base-200 p-4 shadow-sm">
                      <FileTreeView files={files} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} />
                  </div>
                ) : (
                  <>
                    {grouped.overdue.length > 0 && <FileSection title="Overdue" icon="🚨" files={grouped.overdue} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="error" viewType={viewType} />}
                    {grouped.today.length > 0 && <FileSection title="Due Today" icon="📅" files={grouped.today} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="warning" viewType={viewType} />}
                    {grouped.new.length > 0 && <FileSection title="New Cards" icon="🆕" files={grouped.new} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="info" viewType={viewType} />}
                    <FileSection title="Library" icon="📚" files={grouped.future} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="neutral" collapsed={false} viewType={viewType} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FileSection = ({ title, icon, files, rootPath, loadNote, metadatas, color, collapsed = false, viewType = 'list' }: any) => {
  const textColor = color === 'neutral' ? 'text-base-content' : `text-${color}`;
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
                                        {meta?.card?.due && (
                                            <div className="text-xs font-mono opacity-50 bg-base-200 px-2 py-1 rounded">
                                                {formatDistanceToNow(new Date(meta.card.due), { addSuffix: true })}
                                            </div>
                                        )}
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
                                    {meta?.card?.due && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-base-200 opacity-60`}>
                                        {formatDistanceToNow(new Date(meta.card.due))}
                                    </span>
                                    )}
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

import { useAppStore } from '../store/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { FolderOpen, FileText, Clock, X, LayoutGrid, List, FolderTree } from 'lucide-react';
import { useState, useEffect } from 'react';
import { join } from '@tauri-apps/api/path';
import { Dashboard } from './Dashboard';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { ThemeController } from './shared/ThemeController';
import { motion } from 'framer-motion';
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
        setRootPath(selected);
        scanFiles(selected);
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
        await new Promise(resolve => setTimeout(resolve, 800)); // Fake loading delay
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
    <div className="h-full flex flex-col p-4 bg-base-200">
      <div className="navbar bg-base-100 rounded-box shadow-sm mb-4">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl font-bold tracking-tight">Memory Player</a>
        </div>
        <div className="flex-none gap-2">
          {rootPath && (
            <div className="join bg-base-200 rounded-lg p-1 mr-2">
              <button
                className={`join-item btn btn-sm btn-ghost ${viewType === 'list' ? 'bg-base-100 shadow-sm' : ''}`}
                onClick={() => setViewType('list')}
                title="List View"
              >
                <List size={16} />
              </button>
              <button
                className={`join-item btn btn-sm btn-ghost ${viewType === 'grid' ? 'bg-base-100 shadow-sm' : ''}`}
                onClick={() => setViewType('grid')}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={`join-item btn btn-sm btn-ghost ${viewType === 'tree' ? 'bg-base-100 shadow-sm' : ''}`}
                onClick={() => setViewType('tree')}
                title="Tree View"
              >
                <FolderTree size={16} />
              </button>
            </div>
          )}
          <ThemeController />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="btn btn-ghost"
            onClick={handleOpenFolder}
            disabled={loading}
          >
            {loading ? <span className="loading loading-spinner"></span> : <FolderOpen size={18} />}
            {rootPath ? 'Change Vault' : 'Open Vault'}
          </motion.button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!rootPath ? (
          <div className="hero h-full bg-base-200">
            <div className="hero-content text-center">
              <div className="max-w-md w-full">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Memory Player
                  </h1>
                  <p className="py-6 text-lg opacity-70">
                    Spaced repetition for your markdown notes.
                  </p>

                  <div className="flex flex-col gap-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleOpenFolder}
                      className="btn btn-primary btn-lg w-full shadow-lg"
                    >
                      <FolderOpen className="mr-2" /> Open Vault
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setRootPath('DEMO_VAULT'); scanFiles('DEMO_VAULT'); }}
                      className="btn btn-ghost w-full"
                    >
                      Try Demo Vault
                    </motion.button>
                  </div>

                  {recentVaults.length > 0 && (
                    <div className="mt-12 text-left">
                      <h3 className="text-xs font-bold opacity-50 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={12} /> Recent Vaults
                      </h3>
                      <div className="flex flex-col gap-2">
                        {recentVaults.map(path => (
                          <motion.div
                            key={path}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group flex items-center gap-2 p-3 bg-base-100 rounded-lg hover:bg-base-300 transition-colors cursor-pointer shadow-sm border border-transparent hover:border-base-content/10"
                            onClick={() => { setRootPath(path); scanFiles(path); }}
                          >
                            <FolderOpen size={16} className="opacity-50 group-hover:text-primary transition-colors" />
                            <span className="flex-1 truncate text-sm font-medium direction-rtl text-left" title={path}>
                              {path}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeRecentVault(path); }}
                              className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <Dashboard />

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-full rounded-box opacity-50"></div>)}
              </div>
            ) : (
              <div className="space-y-4 pb-20">
                {viewType === 'tree' ? (
                  <FileTreeView files={files} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} />
                ) : (
                  <>
                    {grouped.overdue.length > 0 && <FileSection title="🚨 Overdue" files={grouped.overdue} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="error" viewType={viewType} />}
                    {grouped.today.length > 0 && <FileSection title="📅 Due Today" files={grouped.today} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="warning" viewType={viewType} />}
                    {grouped.new.length > 0 && <FileSection title="🆕 New" files={grouped.new} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="info" viewType={viewType} />}
                    <FileSection title="💤 Future / All" files={grouped.future} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="neutral" collapsed={true} viewType={viewType} />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const FileSection = ({ title, files, rootPath, loadNote, metadatas, color, collapsed = false, viewType = 'list' }: any) => {
  const textColor = color === 'neutral' ? 'text-base-content' : `text-${color}`;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="collapse collapse-arrow bg-base-100 shadow-sm border border-base-200"
    >
      <input type="checkbox" defaultChecked={!collapsed} />
      <div className={`collapse-title text-lg font-bold ${textColor} flex items-center gap-3`}>
        {title}
        <span className={`badge badge-${color} badge-sm`}>{files.length}</span>
      </div>
      <div className="collapse-content">
        {viewType === 'list' ? (
          <ul className="menu w-full p-0">
            {files.map((file: string, idx: number) => {
              const meta = metadatas[file];
              return (
                <li key={idx}>
                  <a onClick={() => loadNote(file)} className="flex items-center gap-3 py-3 hover:bg-base-200 transition-colors">
                    <FileText size={18} className="opacity-40" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate font-medium">
                        {file.replace(rootPath || '', '').replace(/^\//, '')}
                      </span>
                      {meta?.card?.due && (
                        <span className="text-xs opacity-40">
                          Due {formatDistanceToNow(new Date(meta.card.due), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </a>
                </li>
              );
            })}
            {files.length === 0 && <li className="p-4 text-center text-sm opacity-50">No notes in this category.</li>}
          </ul>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-2">
            {files.map((file: string, idx: number) => {
              const meta = metadatas[file];
              return (
                <div
                  key={idx}
                  onClick={() => loadNote(file)}
                  className="card bg-base-200 hover:bg-base-300 transition-all cursor-pointer p-4 flex flex-col gap-2 h-32 justify-between shadow-sm hover:shadow-md border border-transparent hover:border-base-content/10"
                >
                  <div className="flex justify-between items-start">
                    <FileText size={20} className={`text-${color} opacity-70`} />
                    {meta?.card?.due && (
                      <span className="text-[10px] opacity-50 font-mono">
                        {formatDistanceToNow(new Date(meta.card.due))}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-sm line-clamp-2 leading-tight" title={file}>
                    {file.replace(rootPath || '', '').replace(/^\//, '')}
                  </span>
                </div>
              );
            })}
            {files.length === 0 && <div className="col-span-full p-4 text-center text-sm opacity-50">No notes in this category.</div>}
          </div>
        )}
      </div>
    </motion.div>
  );
};

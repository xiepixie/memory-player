import { useAppStore } from '../store/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { FolderOpen, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { join } from '@tauri-apps/api/path';
import { Dashboard } from './Dashboard';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { ThemeController } from './shared/ThemeController';
import { motion } from 'framer-motion';
import { useToastStore } from '../store/toastStore';

export const LibraryView = () => {
  const { rootPath, files, fileMetadatas, setRootPath, setFiles, loadNote, initDataService, loadSettings } = useAppStore();
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);

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
          <div className="hero h-full">
            <div className="hero-content text-center">
              <div className="max-w-md">
                <h1 className="text-5xl font-bold mb-6">Your Vault, Memorized.</h1>
                <p className="py-6 text-lg opacity-70">Select your Obsidian vault or markdown folder to begin your spaced repetition journey.</p>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="btn btn-primary btn-lg"
                    onClick={handleOpenFolder}
                >
                    Open Folder
                </motion.button>
              </div>
            </div>
          </div>
        ) : (
            <>
                <Dashboard />

                {loading ? (
                    <div className="space-y-4">
                        {[1,2,3].map(i => <div key={i} className="skeleton h-16 w-full rounded-box opacity-50"></div>)}
                    </div>
                ) : (
                    <div className="space-y-4 pb-20">
                        {grouped.overdue.length > 0 && <FileSection title="🚨 Overdue" files={grouped.overdue} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="error" />}
                        {grouped.today.length > 0 && <FileSection title="📅 Due Today" files={grouped.today} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="warning" />}
                        {grouped.new.length > 0 && <FileSection title="🆕 New" files={grouped.new} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="info" />}
                        <FileSection title="💤 Future / All" files={grouped.future} rootPath={rootPath} loadNote={loadNote} metadatas={fileMetadatas} color="neutral" collapsed={true} />
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

const FileSection = ({ title, files, rootPath, loadNote, metadatas, color, collapsed = false }: any) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="collapse collapse-arrow bg-base-100 shadow-sm border border-base-200"
        >
            <input type="checkbox" defaultChecked={!collapsed} />
            <div className={`collapse-title text-lg font-bold text-${color} flex items-center gap-3`}>
                {title}
                <span className={`badge badge-${color} badge-sm`}>{files.length}</span>
            </div>
            <div className="collapse-content">
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
            </div>
        </motion.div>
    );
};

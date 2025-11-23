import { useEffect, useState } from 'react';
import { Trash2, RefreshCw, RotateCcw, FileText } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useToastStore } from '../../store/toastStore';
import type { NoteMetadata } from '../../lib/storage/types';
import { motion, AnimatePresence } from 'framer-motion';
import { CardHeader } from './Shared';

export const RecycleBin = () => {
  const dataService = useAppStore((state) => state.dataService);
  const addToast = useToastStore((state) => state.addToast);
  const [items, setItems] = useState<NoteMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const notes = await dataService.getDeletedNotes();
      setItems(notes);
    } catch (e) {
      console.error('Failed to load deleted notes', e);
      addToast('Failed to load deleted notes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [dataService]);

  const handleRestore = async (noteId: string) => {
    try {
      setRestoringId(noteId);
      await dataService.restoreNote(noteId);
      setItems((prev) => prev.filter((n) => n.noteId !== noteId));
      addToast('Note restored', 'success');
    } catch (e) {
      console.error('Failed to restore note', e);
      addToast('Failed to restore note', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
      <div className="card-body p-6 flex flex-col gap-3">
        <CardHeader
          icon={Trash2}
          title="Recycle Bin"
          color="text-error"
          action={
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle"
              onClick={load}
              disabled={isLoading}
              title="Refresh deleted notes"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            </button>
          }
        />

        {items.length === 0 && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-xs opacity-60 text-center py-6">
            <Trash2 size={24} className="mb-2 opacity-40" />
            <p>Recycle bin is empty. No deleted notes yet.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2 text-xs">
            <AnimatePresence initial={false}>
              {items.map((note) => {
                const fullPath = note.filepath || '';
                const fileName = fullPath.split(/[\\/]/).pop() || note.noteId;
                const parentDir = fullPath && fileName ? fullPath.slice(0, fullPath.lastIndexOf(fileName)) : '';

                return (
                  <motion.div
                    key={note.noteId}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="py-1.5 rounded-lg bg-base-200/60 border border-base-300/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-base-300/60 flex items-center justify-center text-base-content/60 flex-shrink-0">
                          <FileText size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium" title={fullPath || note.noteId}>
                            {fileName}
                          </div>
                          {parentDir && (
                            <div className="truncate text-[10px] opacity-60 font-mono" title={fullPath}>
                              {parentDir}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={() => handleRestore(note.noteId)}
                        disabled={restoringId === note.noteId}
                      >
                        {restoringId === note.noteId ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <>
                            <RotateCcw size={12} />
                            Restore
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

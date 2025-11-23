import { lazy, Suspense } from 'react';
import { useAppStore } from '../store/appStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useKeyboardShortcuts } from './shared/useKeyboardShortcuts';
import { ToastContainer } from './shared/ToastContainer';
import { useVaultWatcher } from '../hooks/useVaultWatcher';
import { useEffect } from 'react';

const LibraryViewLazy = lazy(() => import('./LibraryView').then((m) => ({ default: m.LibraryView })));
const NoteRendererLazy = lazy(() => import('./NoteRenderer').then((m) => ({ default: m.NoteRenderer })));

export const Layout = () => {
  const viewMode = useAppStore((state) => state.viewMode);

  // Initialize Global Shortcuts
  useKeyboardShortcuts();

  // Initialize Global Vault Watcher (File System -> DB)
  useVaultWatcher();

  // Initialize Realtime Subscription (DB -> UI)
  const { dataService, handleExternalCardUpdate } = useAppStore();

  useEffect(() => {
    const unsub = dataService.subscribeToRealtime((payload: any) => {
      console.log("Realtime update received:", payload);
      handleExternalCardUpdate(payload);
    });
    return () => {
      unsub();
    };
  }, [dataService]);

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-base-300 to-base-200 overflow-hidden flex relative">
      <AnimatePresence mode="wait">
        {viewMode === 'library' ? (
          <motion.div
            key="library"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full h-full"
          >
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center" />}>
              <LibraryViewLazy />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div
            key="player"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full h-full relative"
          >
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center" />}>
              <NoteRendererLazy />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer />
    </div>
  );
};

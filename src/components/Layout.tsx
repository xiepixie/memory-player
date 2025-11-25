import { lazy, Suspense, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { useKeyboardShortcuts } from './shared/useKeyboardShortcuts';
import { ToastContainer } from './shared/ToastContainer';
import { useVaultWatcher } from '../hooks/useVaultWatcher';
import { NoteSkeleton } from './skeletons/NoteSkeleton';

const LibraryViewLazy = lazy(() => import('./LibraryView').then((m) => ({ default: m.LibraryView })));
const NoteRendererLazy = lazy(() => import('./NoteRenderer').then((m) => ({ default: m.NoteRenderer })));

export const Layout = () => {
  const viewMode = useAppStore((state) => state.viewMode);
  const rootPath = useAppStore((state) => state.rootPath);
  const currentFilepath = useAppStore((state) => state.currentFilepath);
  const closeNote = useAppStore((state) => state.closeNote);

  // Guard: Fix inconsistent state where currentFilepath exists but rootPath is null
  // This can happen if persistence gets out of sync
  // Exception: Demo files (starting with /Demo/) are handled specially and don't need rootPath
  useEffect(() => {
    const isDemoFile = currentFilepath?.startsWith('/Demo/');
    if (currentFilepath && !rootPath && viewMode !== 'library' && !isDemoFile) {
      console.warn('[Layout] Inconsistent state detected: currentFilepath exists but rootPath is null. Resetting to library.');
      closeNote();
    }
  }, [currentFilepath, rootPath, viewMode, closeNote]);

  // Initialize Global Shortcuts
  useKeyboardShortcuts();

  // Initialize Global Vault Watcher (File System -> DB)
  useVaultWatcher();

  // Initialize Realtime Subscription (DB -> UI)
  const { dataService, handleExternalCardUpdate } = useAppStore(
    useShallow((state) => ({
      dataService: state.dataService,
      handleExternalCardUpdate: state.handleExternalCardUpdate,
    })),
  );

  useEffect(() => {
    const unsub = dataService.subscribeToRealtime((payload: any) => {
      handleExternalCardUpdate(payload);
    });
    return () => {
      unsub();
    };
  }, [dataService]);


  return (
    <div className="h-screen w-screen bg-gradient-to-br from-base-300 to-base-200 overflow-hidden flex relative">
      {/* Library Layer - always mounted for instant back navigation */}
      <div
        className={`absolute inset-0 w-full h-full transition-all duration-200 ease-out ${
          viewMode === 'library'
            ? 'opacity-100 scale-100 translate-y-0 z-10'
            : 'opacity-0 scale-[0.98] -translate-y-2 z-0 pointer-events-none'
        }`}
      >
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center" />}>
          <LibraryViewLazy />
        </Suspense>
      </div>

      {/* Note Layer */}
      <div
        className={`absolute inset-0 w-full h-full transition-all duration-200 ease-out ${
          viewMode !== 'library'
            ? 'opacity-100 scale-100 translate-y-0 z-10'
            : 'opacity-0 scale-[0.98] translate-y-2 z-0 pointer-events-none'
        }`}
      >
        <Suspense fallback={<NoteSkeleton />}>
          <NoteRendererLazy />
        </Suspense>
      </div>

      <ToastContainer />
    </div>
  );
};

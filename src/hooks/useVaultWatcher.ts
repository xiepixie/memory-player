import { useEffect, useRef } from 'react';
import { watch } from '@tauri-apps/plugin-fs';
import { isTauri } from '../lib/tauri';
import { useAppStore, syncNoteFromFilesystem, softDeleteNoteForPath } from '../store/appStore';
import { fileSystem } from '../lib/services/fileSystem';
import { useToastStore } from '../store/toastStore';

export function useVaultWatcher() {
    const rootPath = useAppStore((state) => state.rootPath);
    const addToast = useToastStore((state) => state.addToast);
    const watcherRef = useRef<(() => void | Promise<void>) | null>(null);
    const processingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Only watch real vault paths in the desktop app; skip demo vault and non-Tauri environments
        if (!rootPath || rootPath === 'DEMO_VAULT' || !isTauri()) return;

        const cleanupWatcher = () => {
            if (watcherRef.current) {
                const unwatch = watcherRef.current;
                watcherRef.current = null;
                try {
                    const maybePromise: any = (unwatch as any)();
                    if (maybePromise && typeof maybePromise.then === 'function') {
                        (maybePromise as Promise<void>).catch((e: any) => {
                            console.warn('[VaultWatcher] Failed to unwatch vault (ignored)', e);
                        });
                    }
                } catch (e) {
                    console.warn('[VaultWatcher] Failed to unwatch vault (ignored)', e);
                }
            }
        };

        let cancelled = false;

        const startWatching = async () => {
            // Ensure any previous watcher is fully cleaned up before starting a new one
            cleanupWatcher();
            try {
                const unwatch = await watch(
                    rootPath,
                    async (event) => {
                        // Event format: { type: 'any', paths: ['/path/to/file'] }
                        // We are interested in modifications to .md files
                        if (!event.paths || event.paths.length === 0) return;

                        // Handle deletions via soft-delete
                        const kind = (event as any).kind ?? (event as any).type;
                        if (kind === 'remove') {
                            for (const path of event.paths) {
                                if (!path.endsWith('.md')) continue;
                                try {
                                    await softDeleteNoteForPath(path);
                                } catch (e) {
                                    console.error(`[VaultWatcher] Failed to soft-delete note for ${path}`, e);
                                    addToast('Failed to soft-delete note for removed file', 'error');
                                }
                            }
                            return;
                        }

                        for (const path of event.paths) {
                            if (!path.endsWith('.md')) continue;

                            // Avoid double-processing if we just wrote to this file (e.g. ensureNoteId)
                            // This is a simple debounce/lock mechanism
                            if (processingRef.current.has(path)) continue;
                            processingRef.current.add(path);

                            // PERFORMANCE: Defer processing slightly to batch rapid file events
                            // In Tauri, file system events can fire much more frequently than in browser
                            setTimeout(async () => {
                                try {
                                    // 1. Ensure ID and get content
                                    const { id, content } = await fileSystem.ensureNoteId(path);

                                    // 2. Delegate sync + metadata refresh to centralized store action
                                    await syncNoteFromFilesystem(path, content, id);

                                } catch (e) {
                                    console.error(`[VaultWatcher] Failed to sync ${path}`, e);
                                } finally {
                                    // Release lock after a longer delay to allow FS to fully settle
                                    // Increased from 1000ms to 2000ms for better Tauri performance
                                    setTimeout(() => {
                                        processingRef.current.delete(path);
                                    }, 2000);
                                }
                            }, 200); // 200ms debounce before processing
                        }
                    },
                    { recursive: true }
                );

                if (cancelled) {
                    // Effect was cleaned up while watch() was in-flight; immediately unwatch.
                    try {
                        const maybePromise: any = (unwatch as any)();
                        if (maybePromise && typeof maybePromise.then === 'function') {
                            (maybePromise as Promise<void>).catch((e: any) => {
                                console.warn('[VaultWatcher] Failed to unwatch vault after cancel (ignored)', e);
                            });
                        }
                    } catch (e) {
                        console.warn('[VaultWatcher] Failed to unwatch vault after cancel (ignored)', e);
                    }
                    return;
                }

                watcherRef.current = unwatch;
            } catch (e) {
                console.error("[VaultWatcher] Failed to start watcher", e);
                addToast("Failed to start vault watcher", 'error');
            }
        };

        startWatching();

        return () => {
            cancelled = true;
            cleanupWatcher();
        };
    }, [rootPath]);
}

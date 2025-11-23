import { useEffect, useRef } from 'react';
import { watch } from '@tauri-apps/plugin-fs';
import { isTauri } from '../lib/tauri';
import { useAppStore } from '../store/appStore';
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

            console.log(`[VaultWatcher] Starting watch on: ${rootPath}`);

            try {
                const unwatch = await watch(
                    rootPath,
                    async (event) => {
                        // Event format: { type: 'any', paths: ['/path/to/file'] }
                        // We are interested in modifications to .md files
                        if (!event.paths || event.paths.length === 0) return;

                        const { dataService, updateLastSync, currentVault, pathMap, refreshMetadata } = useAppStore.getState();

                        // Handle deletions via soft-delete
                        const kind = (event as any).kind ?? (event as any).type;
                        if (kind === 'remove') {
                            for (const path of event.paths) {
                                if (!path.endsWith('.md')) continue;

                                const noteId = pathMap[path];
                                if (!noteId) continue;

                                try {
                                    console.log(`[VaultWatcher] File removed, soft-deleting note: ${path}`);
                                    await dataService.softDeleteNote(noteId);
                                    updateLastSync();
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

                            console.log(`[VaultWatcher] File changed: ${path}`);
                            processingRef.current.add(path);

                            try {
                                // 1. Ensure ID and get content
                                const { id, content } = await fileSystem.ensureNoteId(path);

                                // 2. Sync to Backend (pass current vault if available)
                                await dataService.syncNote(path, content, id, currentVault?.id);

                                // 3. Update sync timestamp
                                updateLastSync();

                                // 4. Refresh local metadata and mappings via global store helper
                                try {
                                    await refreshMetadata(path, id);
                                } catch (metaError) {
                                    console.error(`[VaultWatcher] Failed to refresh metadata for ${path}`, metaError);
                                }

                            } catch (e) {
                                console.error(`[VaultWatcher] Failed to sync ${path}`, e);
                            } finally {
                                // Release lock after a short delay to allow FS to settle
                                setTimeout(() => {
                                    processingRef.current.delete(path);
                                }, 1000);
                            }
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

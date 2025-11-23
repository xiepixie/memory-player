import { useEffect, useRef } from 'react';
import { watch } from '@tauri-apps/plugin-fs';
import { isTauri } from '../lib/tauri';
import { useAppStore } from '../store/appStore';
import { fileSystem } from '../lib/services/fileSystem';
import { useToastStore } from '../store/toastStore';

export function useVaultWatcher() {
    const { rootPath, dataService, updateLastSync, currentVault } = useAppStore();
    const addToast = useToastStore((state) => state.addToast);
    const watcherRef = useRef<(() => void) | null>(null);
    const processingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!rootPath || !isTauri()) return;

        const startWatching = async () => {
            // Cleanup previous watcher
            if (watcherRef.current) {
                watcherRef.current();
                watcherRef.current = null;
            }

            console.log(`[VaultWatcher] Starting watch on: ${rootPath}`);

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

                                const noteId = useAppStore.getState().pathMap[path];
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

                                // 3. Update UI state
                                updateLastSync();

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

                watcherRef.current = unwatch;
            } catch (e) {
                console.error("[VaultWatcher] Failed to start watcher", e);
                addToast("Failed to start vault watcher", 'error');
            }
        };

        startWatching();

        return () => {
            if (watcherRef.current) {
                watcherRef.current();
            }
        };
    }, [rootPath, dataService, currentVault]);
}

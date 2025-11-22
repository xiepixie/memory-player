import { useEffect, useRef } from 'react';
import { fileSystem } from '../lib/services/fileSystem';
import { isTauri } from '../lib/tauri';

/**
 * Hook to watch a file for changes.
 * @param filepath The absolute path of the file to watch
 * @param onFileChange Callback function to execute when the file changes
 */
export function useFileWatcher(filepath: string | null, onFileChange: () => void) {
  const callbackRef = useRef(onFileChange);

  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    if (!filepath || !isTauri()) return;

    let unwatchFn: (() => void) | undefined;
    let mounted = true;

    const setup = async () => {
      // console.log(`Starting watch on: ${filepath}`);
      unwatchFn = await fileSystem.watchFile(filepath, () => {
        if (mounted) {
          callbackRef.current();
        }
      });
    };

    setup();

    return () => {
      mounted = false;
      if (unwatchFn) {
        unwatchFn();
      }
    };
  }, [filepath]);
}


/**
 * Checks if the application is running within a Tauri environment.
 * In Tauri v2, window.__TAURI__ is not globally available by default.
 * We check for __TAURI_INTERNALS__ which is present in the Tauri webview.
 */
export const isTauri = (): boolean => {
  // Check if running in a browser environment
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Check for Tauri v2 internals
  // @ts-ignore
  if (window.__TAURI_INTERNALS__) {
    return true;
  }
  
  // Fallback for Tauri v1 or v2 with global tauri enabled
  // @ts-ignore
  if (window.__TAURI__) {
    return true;
  }
  
  return false;
};

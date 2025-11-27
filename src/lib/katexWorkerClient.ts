/**
 * KaTeX Worker Client
 * 
 * Manages communication with the KaTeX Web Worker.
 * 
 * Features:
 * - Batch requests: Collects requests within a frame (16ms) and sends together
 * - Request deduplication: Same formula only rendered once
 * - Cache integration: Checks LRU cache before sending to Worker
 * - Graceful degradation: Falls back to main thread if Worker fails
 */

import { katexCache } from './katexCache';
import type { KatexRequest, KatexResponse } from '../workers/katexWorker';

/** Callback invoked when rendering completes */
type RenderCallback = (html: string, error?: string) => void;

/** Pending request with its callbacks */
interface PendingRequest {
  latex: string;
  displayMode: boolean;
  callbacks: RenderCallback[];
}

/** Worker state */
type WorkerState = 'idle' | 'loading' | 'ready' | 'error';

class KatexWorkerClient {
  private worker: Worker | null = null;
  private workerState: WorkerState = 'idle';
  
  /** Map of pending requests by ID */
  private pendingMap = new Map<string, PendingRequest>();
  
  /** Queue of requests to send in next batch */
  private batchQueue: KatexRequest[] = [];
  
  /** Timer for batch flush */
  private flushTimer: number | null = null;
  
  /** Batch delay in ms (~1 frame) */
  private static readonly BATCH_DELAY = 16;
  
  /** Max requests per batch (prevent massive payloads) */
  private static readonly MAX_BATCH_SIZE = 50;
  
  constructor() {
    this.initWorker();
  }
  
  /**
   * Initialize the Web Worker
   */
  private initWorker(): void {
    if (this.workerState === 'loading') return;
    
    try {
      this.workerState = 'loading';
      
      // Vite handles Worker bundling via import.meta.url
      this.worker = new Worker(
        new URL('../workers/katexWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      this.worker.onmessage = this.handleResponse.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      
      this.workerState = 'ready';
    } catch (err) {
      console.warn('[KatexWorkerClient] Failed to init Worker, using fallback:', err);
      this.workerState = 'error';
    }
  }
  
  /**
   * Generate cache key for a formula
   */
  private generateKey(latex: string, displayMode: boolean): string {
    return `${displayMode ? 'D' : 'I'}:${latex}`;
  }
  
  /**
   * Render a LaTeX formula asynchronously
   * 
   * @param latex - LaTeX source string
   * @param displayMode - true for block, false for inline
   * @param callback - Called with rendered HTML when complete
   */
  render(
    latex: string,
    displayMode: boolean,
    callback: RenderCallback
  ): void {
    // 1. Check LRU cache first (synchronous hit = no Loading state)
    const cached = katexCache.get(latex, displayMode);
    if (cached !== null) {
      // Use microtask to keep callback timing consistent
      queueMicrotask(() => callback(cached));
      return;
    }
    
    // 2. Generate request ID (used for deduplication)
    const id = this.generateKey(latex, displayMode);
    
    // 3. Check if same request is already pending (deduplicate)
    const pending = this.pendingMap.get(id);
    if (pending) {
      // Add callback to existing request
      pending.callbacks.push(callback);
      return;
    }
    
    // 4. Create new pending request
    this.pendingMap.set(id, {
      latex,
      displayMode,
      callbacks: [callback],
    });
    
    // 5. Add to batch queue
    this.batchQueue.push({ id, latex, displayMode });
    
    // 6. Schedule batch flush
    this.scheduleFlush();
  }
  
  /**
   * Schedule a batch flush after BATCH_DELAY
   */
  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    
    this.flushTimer = window.setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, KatexWorkerClient.BATCH_DELAY);
  }
  
  /**
   * Send queued requests to Worker
   */
  private flush(): void {
    if (this.batchQueue.length === 0) return;
    
    // Take batch (up to max size)
    const batch = this.batchQueue.splice(0, KatexWorkerClient.MAX_BATCH_SIZE);
    
    // If Worker not ready, use fallback
    if (this.workerState !== 'ready' || !this.worker) {
      this.fallbackRender(batch);
      return;
    }
    
    // Send to Worker
    this.worker.postMessage(batch);
    
    // If more in queue, schedule another flush
    if (this.batchQueue.length > 0) {
      this.scheduleFlush();
    }
  }
  
  /**
   * Handle Worker response
   */
  private handleResponse(e: MessageEvent<KatexResponse[]>): void {
    const responses = e.data;
    
    for (const res of responses) {
      const pending = this.pendingMap.get(res.id);
      if (!pending) continue;
      
      // Update cache (unless error)
      if (!res.error) {
        katexCache.set(pending.latex, pending.displayMode, res.html);
      }
      
      // Invoke all callbacks
      for (const cb of pending.callbacks) {
        try {
          cb(res.html, res.error);
        } catch (err) {
          console.error('[KatexWorkerClient] Callback error:', err);
        }
      }
      
      // Cleanup
      this.pendingMap.delete(res.id);
    }
  }
  
  /**
   * Handle Worker errors
   */
  private handleWorkerError(e: ErrorEvent): void {
    console.error('[KatexWorkerClient] Worker error:', e);
    this.workerState = 'error';
    
    // Fallback all pending requests
    const pendingBatch = Array.from(this.pendingMap.entries()).map(([id, req]) => ({
      id,
      latex: req.latex,
      displayMode: req.displayMode,
    }));
    
    if (pendingBatch.length > 0) {
      this.fallbackRender(pendingBatch);
    }
  }
  
  /**
   * Fallback: Render on main thread (blocking but functional)
   */
  private fallbackRender(batch: KatexRequest[]): void {
    // Dynamic import to avoid bundling katex twice
    import('katex').then((katex) => {
      for (const req of batch) {
        const pending = this.pendingMap.get(req.id);
        if (!pending) continue;
        
        try {
          const html = katex.default.renderToString(req.latex, {
            displayMode: req.displayMode,
            throwOnError: false,
            trust: false,
          });
          
          // Update cache
          katexCache.set(req.latex, req.displayMode, html);
          
          // Invoke callbacks
          for (const cb of pending.callbacks) {
            cb(html);
          }
        } catch (err) {
          const errorHtml = `<span class="text-error">${req.latex}</span>`;
          for (const cb of pending.callbacks) {
            cb(errorHtml, (err as Error).message);
          }
        }
        
        this.pendingMap.delete(req.id);
      }
    });
  }
  
  /**
   * Prerender formulas (warm cache without callbacks)
   * Useful when loading a document to preload visible formulas
   */
  prerender(items: { latex: string; displayMode: boolean }[]): void {
    // Filter out already cached
    const uncached = items.filter(
      ({ latex, displayMode }) => katexCache.get(latex, displayMode) === null
    );
    
    if (uncached.length === 0) return;
    
    // Create requests
    for (const { latex, displayMode } of uncached) {
      const id = this.generateKey(latex, displayMode);
      
      // Skip if already pending
      if (this.pendingMap.has(id)) continue;
      
      // Add with empty callback array (just cache)
      this.pendingMap.set(id, {
        latex,
        displayMode,
        callbacks: [],
      });
      
      this.batchQueue.push({ id, latex, displayMode });
    }
    
    this.scheduleFlush();
  }
  
  /**
   * Terminate the Worker (cleanup)
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerState = 'idle';
    }
    
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Clear pending (won't call callbacks)
    this.pendingMap.clear();
    this.batchQueue = [];
  }
  
  /**
   * Get Worker state (for debugging)
   */
  getState(): WorkerState {
    return this.workerState;
  }
}

// Singleton instance
export const katexWorkerClient = new KatexWorkerClient();

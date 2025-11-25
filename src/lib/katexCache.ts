import katex from 'katex';

interface CacheEntry {
  html: string;
  timestamp: number;
}

// LRU-style cache for rendered KaTeX output
const MAX_CACHE_SIZE = 100;
const cache = new Map<string, CacheEntry>();

const getCacheKey = (latex: string, displayMode: boolean): string => {
  return `${displayMode ? 'd' : 'i'}:${latex}`;
};

/**
 * Renders LaTeX to HTML with caching.
 * Identical formulas return cached HTML strings, avoiding re-parsing.
 */
export const renderKatexCached = (
  latex: string,
  options: {
    displayMode?: boolean;
    throwOnError?: boolean;
    trust?: boolean;
    macros?: Record<string, string>;
  } = {}
): string => {
  const { displayMode = true, throwOnError = false, trust = false, macros } = options;
  const key = getCacheKey(latex, displayMode);

  const cached = cache.get(key);
  if (cached) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, { ...cached, timestamp: Date.now() });
    return cached.html;
  }

  // Render and cache
  const html = katex.renderToString(latex, {
    displayMode,
    throwOnError,
    trust,
    macros: {
      '\\RR': '\\mathbb{R}',
      '\\NN': '\\mathbb{N}',
      '\\ZZ': '\\mathbb{Z}',
      '\\QQ': '\\mathbb{Q}',
      '\\CC': '\\mathbb{C}',
      ...macros,
    },
  });

  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, { html, timestamp: Date.now() });
  return html;
};

/**
 * Pre-renders a list of LaTeX strings in idle time.
 * Useful for pre-caching all formulas in a document during initial parse.
 */
export const preCacheFormulas = (formulas: Array<{ latex: string; displayMode: boolean }>) => {
  if (typeof window === 'undefined') return;

  const work = () => {
    for (const { latex, displayMode } of formulas) {
      const key = getCacheKey(latex, displayMode);
      if (!cache.has(key)) {
        try {
          renderKatexCached(latex, { displayMode });
        } catch {
          // Ignore errors during pre-cache
        }
      }
    }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(work, { timeout: 3000 });
  } else {
    setTimeout(work, 100);
  }
};

/**
 * Clears the cache. Useful when switching notes to free memory.
 */
export const clearKatexCache = () => {
  cache.clear();
};

/**
 * Returns cache statistics for debugging.
 */
export const getCacheStats = () => ({
  size: cache.size,
  maxSize: MAX_CACHE_SIZE,
});

// Queue for async rendering
const renderQueue: Array<{
  latex: string;
  displayMode: boolean;
  resolve: (html: string) => void;
  reject: (error: Error) => void;
}> = [];
let isProcessingQueue = false;

/**
 * Renders LaTeX asynchronously using idle time.
 * Returns a promise that resolves to the HTML string.
 * Batches multiple requests and processes them during idle periods.
 */
export const renderKatexAsync = (
  latex: string,
  options: { displayMode?: boolean } = {}
): Promise<string> => {
  const { displayMode = true } = options;
  const key = getCacheKey(latex, displayMode);

  // Return immediately if cached
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, { ...cached, timestamp: Date.now() });
    return Promise.resolve(cached.html);
  }

  // Queue the render
  return new Promise((resolve, reject) => {
    renderQueue.push({ latex, displayMode, resolve, reject });
    processQueueAsync();
  });
};

const processQueueAsync = () => {
  if (isProcessingQueue || renderQueue.length === 0) return;
  isProcessingQueue = true;

  const processNext = (deadline?: IdleDeadline) => {
    // Process items while we have time (or fallback to 5ms chunks)
    const timeRemaining = deadline?.timeRemaining?.() ?? 5;
    const startTime = performance.now();

    while (
      renderQueue.length > 0 &&
      (performance.now() - startTime) < timeRemaining
    ) {
      const item = renderQueue.shift()!;
      try {
        const html = renderKatexCached(item.latex, { displayMode: item.displayMode });
        item.resolve(html);
      } catch (e) {
        item.reject(e as Error);
      }
    }

    // Continue processing if more items remain
    if (renderQueue.length > 0) {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(processNext, { timeout: 100 });
      } else {
        setTimeout(() => processNext(), 0);
      }
    } else {
      isProcessingQueue = false;
    }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(processNext, { timeout: 100 });
  } else {
    setTimeout(() => processNext(), 0);
  }
};

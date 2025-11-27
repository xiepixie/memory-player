/**
 * useKatexRender - React Hook for async KaTeX rendering
 * 
 * Provides a clean React interface to the KaTeX Worker.
 * 
 * Features:
 * - Synchronous cache hit: No Loading flash when formula is cached
 * - Async Worker rendering: Non-blocking for cache misses
 * - Error handling: Graceful degradation with error display
 * - Stable API: Consistent return shape for easy consumption
 */

import { useState, useEffect, useRef } from 'react';
import { katexWorkerClient } from '../lib/katexWorkerClient';
import { katexCache } from '../lib/katexCache';

export interface UseKatexRenderOptions {
  /** Display mode (block) or inline mode. Default: true (block) */
  displayMode?: boolean;
}

export interface UseKatexRenderResult {
  /** Rendered HTML string, null if still loading */
  html: string | null;
  /** Loading state (only true for cache misses during Worker render) */
  isLoading: boolean;
  /** Error message if rendering failed */
  error?: string;
}

/**
 * Hook for rendering LaTeX with Web Worker
 * 
 * @param latex - LaTeX source string
 * @param options - Rendering options
 * @returns Rendered HTML, loading state, and error
 * 
 * @example
 * ```tsx
 * const { html, isLoading } = useKatexRender('E = mc^2', { displayMode: false });
 * 
 * if (isLoading) return <Skeleton />;
 * return <span dangerouslySetInnerHTML={{ __html: html }} />;
 * ```
 */
export function useKatexRender(
  latex: string,
  options: UseKatexRenderOptions = {}
): UseKatexRenderResult {
  const { displayMode = true } = options;
  
  // Synchronous cache check - avoid unnecessary Loading state
  const cachedHtml = katexCache.get(latex, displayMode);
  
  // Initial state: use cache if available
  const [state, setState] = useState<UseKatexRenderResult>(() => ({
    html: cachedHtml,
    isLoading: cachedHtml === null,
    error: undefined,
  }));
  
  // Track latest request to handle race conditions
  const latestRequestRef = useRef<string>('');
  
  useEffect(() => {
    // Generate request key for this render
    const requestKey = `${displayMode ? 'D' : 'I'}:${latex}`;
    latestRequestRef.current = requestKey;
    
    // Fast path: Cache hit - no async needed
    if (cachedHtml !== null) {
      setState({ html: cachedHtml, isLoading: false, error: undefined });
      return;
    }
    
    // Slow path: Request Worker render
    setState(prev => ({ ...prev, isLoading: true }));
    
    katexWorkerClient.render(latex, displayMode, (html, error) => {
      // Check if this response is still relevant (prevent race conditions)
      if (latestRequestRef.current !== requestKey) {
        return;
      }
      
      setState({
        html,
        isLoading: false,
        error,
      });
    });
  }, [latex, displayMode, cachedHtml]);
  
  return state;
}

/**
 * Prerender multiple formulas (warm cache)
 * 
 * Call this when loading a document to preload visible formulas.
 * 
 * @param items - Array of { latex, displayMode } objects
 * 
 * @example
 * ```tsx
 * useEffect(() => {
 *   const formulas = extractFormulas(content);
 *   prerenderKatex(formulas);
 * }, [content]);
 * ```
 */
export function prerenderKatex(
  items: { latex: string; displayMode: boolean }[]
): void {
  katexWorkerClient.prerender(items);
}

/**
 * Check if a formula is cached (synchronous)
 * 
 * @param latex - LaTeX source string
 * @param displayMode - Display mode
 * @returns true if cached
 */
export function isKatexCached(latex: string, displayMode: boolean): boolean {
  return katexCache.get(latex, displayMode) !== null;
}

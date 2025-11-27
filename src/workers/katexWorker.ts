/**
 * KaTeX Web Worker
 * 
 * Offloads KaTeX rendering to a background thread to prevent main thread blocking.
 * Complex formulas (matrices, multi-line equations) can take 50-200ms to render,
 * which would otherwise cause UI jank.
 * 
 * Communication Protocol:
 * - Main → Worker: KatexRequest[] (batch of render requests)
 * - Worker → Main: KatexResponse[] (batch of rendered HTML)
 */

import katex from 'katex';

export interface KatexRequest {
  /** Unique request ID for callback matching */
  id: string;
  /** LaTeX source string */
  latex: string;
  /** Display mode (block) vs inline mode */
  displayMode: boolean;
}

export interface KatexResponse {
  /** Request ID (matches KatexRequest.id) */
  id: string;
  /** Rendered HTML string */
  html: string;
  /** Error message if rendering failed */
  error?: string;
}

// KaTeX options - match main thread config
const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: false,
  output: 'html' as const, // HTML only (no MathML) for smaller payload
};

/**
 * Handle incoming batch of render requests
 */
self.onmessage = (e: MessageEvent<KatexRequest[]>) => {
  const requests = e.data;
  const responses: KatexResponse[] = [];
  
  for (const req of requests) {
    try {
      const html = katex.renderToString(req.latex, {
        ...KATEX_OPTIONS,
        displayMode: req.displayMode,
      });
      responses.push({ id: req.id, html });
    } catch (err) {
      // Render error inline instead of throwing
      const errorHtml = `<span class="katex-error text-error" title="${(err as Error).message}">${escapeHtml(req.latex)}</span>`;
      responses.push({
        id: req.id,
        html: errorHtml,
        error: (err as Error).message,
      });
    }
  }
  
  self.postMessage(responses);
};

/**
 * Escape HTML to prevent XSS when showing error fallback
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// TypeScript: Worker global scope type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: any;
export {};

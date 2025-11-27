/**
 * AST Cache with LRU eviction
 * 
 * Caches parsed markdown AST to avoid redundant parsing.
 * Uses content hash as cache key for deduplication.
 */

import type { Root } from 'mdast';

// Simple hash function (FNV-1a) - fast and good distribution
function hashString(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, ensure unsigned
  }
  return hash.toString(36);
}

export interface Block {
  /** Stable key for React reconciliation */
  id: string;
  /** Block type for styling/behavior */
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'blockquote' | 'math' | 'table' | 'thematicBreak' | 'mixed';
  /** Content hash for diff detection */
  hash: string;
  /** mdast subtree for this block (for AST-based operations) */
  nodes: Root['children'];
  /** Raw markdown content for this block (for rendering - avoids double parsing) */
  rawContent: string;
  /** Estimated height in pixels for virtualization */
  estimatedHeight: number;
  /** Source line range for edit synchronization */
  lineRange: { start: number; end: number };
  /** Heading level if type === 'heading' */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Heading ID for TOC navigation */
  headingId?: string;
}

interface ASTCacheEntry {
  hash: string;
  mdast: Root;
  blocks: Block[];
  timestamp: number;
}

/**
 * LRU Cache for parsed AST and blocks
 */
class ASTCache {
  private cache: Map<string, ASTCacheEntry> = new Map();
  private maxSize: number;
  
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }
  
  get(hash: string): ASTCacheEntry | null {
    const entry = this.cache.get(hash);
    if (entry) {
      // LRU: move to end
      this.cache.delete(hash);
      this.cache.set(hash, entry);
      return entry;
    }
    return null;
  }
  
  set(hash: string, mdast: Root, blocks: Block[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(hash, {
      hash,
      mdast,
      blocks,
      timestamp: Date.now(),
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Singleton instance
export const astCache = new ASTCache();

/**
 * Generate content hash for cache key
 */
export function getContentHash(content: string): string {
  return hashString(content);
}

/**
 * Generate block hash from nodes
 */
export function getBlockHash(nodes: Root['children']): string {
  // Simple hash based on node types and content
  const signature = nodes.map(node => {
    const type = node.type;
    const value = 'value' in node ? (node as any).value : '';
    const children = 'children' in node ? (node as any).children?.length : 0;
    return `${type}:${value.slice(0, 50)}:${children}`;
  }).join('|');
  
  return hashString(signature);
}

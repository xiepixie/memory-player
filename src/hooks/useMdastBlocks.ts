/**
 * useMdastBlocks - MDAST-based Markdown Block Splitting
 * 
 * Phase 2 Implementation:
 * - Parses markdown to MDAST (Abstract Syntax Tree) using unified/remark
 * - Splits AST into independent rendering blocks
 * - Caches parsed AST for incremental updates
 * - More accurate than regex-based splitting
 * 
 * Key Benefits over Regex:
 * - Correctly handles nested structures (lists, blockquotes)
 * - Proper handling of multi-line code blocks and math
 * - Source position tracking for edit synchronization
 */

import { useMemo, useRef } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root } from 'mdast';
import { splitIntoBlocks, type Block } from '../lib/markdown/blockSplitter';
import { astCache, getContentHash } from '../lib/markdown/astCache';

// Re-export Block type for consumers
export type { Block };

// Configured unified processor (reused across calls)
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath);

/**
 * Parse markdown to MDAST with caching
 */
function parseMarkdown(content: string): { mdast: Root; blocks: Block[] } {
  const hash = getContentHash(content);
  
  // Check cache first
  const cached = astCache.get(hash);
  if (cached) {
    return { mdast: cached.mdast, blocks: cached.blocks as Block[] };
  }
  
  // Parse markdown to AST
  const mdast = markdownProcessor.parse(content) as Root;
  
  // Split into blocks, passing original content for rawContent extraction
  const blocks = splitIntoBlocks(mdast, content);
  
  // Cache result
  astCache.set(hash, mdast, blocks);
  
  return { mdast, blocks };
}

/**
 * Block change detection result
 */
export interface BlockDiff {
  added: number[];    // Indices of new blocks
  removed: number[];  // Indices of removed blocks
  changed: number[];  // Indices of modified blocks
  unchanged: number[]; // Indices of unchanged blocks
}

/**
 * Diff two block arrays by hash
 */
function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockDiff {
  const oldHashes = new Map(oldBlocks.map((b, i) => [b.hash, i]));
  const newHashes = new Map(newBlocks.map((b, i) => [b.hash, i]));
  
  const added: number[] = [];
  const removed: number[] = [];
  const unchanged: number[] = [];
  
  // Find added and unchanged
  newBlocks.forEach((block, newIdx) => {
    if (oldHashes.has(block.hash)) {
      unchanged.push(newIdx);
    } else {
      added.push(newIdx);
    }
  });
  
  // Find removed
  oldBlocks.forEach((block, oldIdx) => {
    if (!newHashes.has(block.hash)) {
      removed.push(oldIdx);
    }
  });
  
  // Changed = blocks at same position with different hash
  const changed: number[] = [];
  const minLen = Math.min(oldBlocks.length, newBlocks.length);
  for (let i = 0; i < minLen; i++) {
    if (oldBlocks[i].hash !== newBlocks[i].hash && 
        !added.includes(i) && !removed.includes(i)) {
      changed.push(i);
    }
  }
  
  return { added, removed, changed, unchanged };
}

/**
 * Hook: MDAST-based incremental markdown blocks
 * 
 * @param content - Raw markdown string
 * @returns Parsed blocks with diff info
 */
export function useMdastBlocks(content: string) {
  const prevBlocksRef = useRef<Block[]>([]);
  
  const result = useMemo(() => {
    if (!content) {
      return { blocks: [], diff: null, mdast: null };
    }
    
    const { mdast, blocks } = parseMarkdown(content);
    const diff = diffBlocks(prevBlocksRef.current, blocks);
    
    // Update ref for next comparison
    prevBlocksRef.current = blocks;
    
    return { blocks, diff, mdast };
  }, [content]);
  
  return result;
}

/**
 * Hook: Block cache statistics
 */
export function useAstCacheStats() {
  return astCache.getStats();
}

/**
 * Clear the AST cache (useful for testing or memory cleanup)
 */
export function clearAstCache() {
  astCache.clear();
}

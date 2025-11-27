/**
 * useIncrementalMarkdown - Regex-based Markdown Block Splitting (Phase 1)
 * 
 * A simpler, faster approach that splits markdown by blank lines.
 * Suitable for most use cases where AST-level precision is not required.
 * 
 * Features:
 * - Block-level caching with LRU eviction
 * - Stable block IDs for React reconciliation
 * - Height estimation for virtualization
 * - Protection for multi-line blocks (code fences, math)
 */

import { useMemo, useRef } from 'react';
import { generateSlug, cleanMarkdown } from '../lib/stringUtils';

// Simple hash function (FNV-1a)
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

export interface SimpleBlock {
  /** Stable key for React reconciliation */
  id: string;
  /** Block type for styling - aligned with MDAST naming */
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'blockquote' | 'table' | 'thematicBreak' | 'math' | 'mixed';
  /** Content hash for diff detection */
  hash: string;
  /** Raw markdown content for this block */
  content: string;
  /** Estimated height in pixels */
  estimatedHeight: number;
  /** Heading level if type === 'heading' */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Heading ID for TOC navigation */
  headingId?: string;
}

// Height estimates by block type
const HEIGHT_MAP: Record<SimpleBlock['type'], number> = {
  heading: 60,
  paragraph: 80,
  code: 150,
  list: 120,
  blockquote: 100,
  table: 200,
  thematicBreak: 40,
  math: 100,
  mixed: 100,
};

/**
 * Improved block splitter
 * Handles multi-line blocks (code fences, math blocks) correctly
 */
function splitContentIntoBlocks(content: string): SimpleBlock[] {
  const blocks: SimpleBlock[] = [];
  
  // Protect multi-line blocks by replacing them with placeholders
  let processedContent = content;
  const protectedBlocks: { placeholder: string; content: string }[] = [];
  let placeholderIndex = 0;
  
  // Protect code fences
  processedContent = processedContent.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${placeholderIndex++}__`;
    protectedBlocks.push({ placeholder, content: match });
    return placeholder;
  });
  
  // Protect math blocks
  processedContent = processedContent.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const placeholder = `__MATH_BLOCK_${placeholderIndex++}__`;
    protectedBlocks.push({ placeholder, content: match });
    return placeholder;
  });
  
  // Split by blank lines
  const rawBlocks = processedContent.split(/\n\s*\n/).filter(b => b.trim());
  
  // Track heading slugs for duplicate handling
  const slugCounts: Record<string, number> = {};
  let blockIndex = 0;
  
  for (const rawBlock of rawBlocks) {
    // Restore protected blocks
    let blockContent = rawBlock;
    for (const { placeholder, content: originalContent } of protectedBlocks) {
      blockContent = blockContent.replace(placeholder, originalContent);
    }
    
    const trimmed = blockContent.trim();
    if (!trimmed) continue;
    
    // Classify block type
    let type: SimpleBlock['type'] = 'paragraph';
    let headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
    let headingId: string | undefined;
    
    // Check for heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/m);
    if (headingMatch) {
      type = 'heading';
      headingLevel = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      
      // Generate slug
      const text = headingMatch[2];
      const cleanText = cleanMarkdown(text);
      const baseSlug = generateSlug(cleanText);
      
      if (baseSlug) {
        const count = slugCounts[baseSlug] || 0;
        slugCounts[baseSlug] = count + 1;
        headingId = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      }
    } else if (/^```/.test(trimmed)) {
      type = 'code';
    } else if (/^\$\$/.test(trimmed)) {
      type = 'math';
    } else if (/^---$/.test(trimmed)) {
      type = 'thematicBreak';
    } else if (/^>/.test(trimmed)) {
      type = 'blockquote';
    } else if (/^[-*+]\s|^\d+\.\s/.test(trimmed)) {
      type = 'list';
    } else if (/^\|/.test(trimmed)) {
      type = 'table';
    }
    
    // Estimate height based on content
    const baseHeight = HEIGHT_MAP[type];
    const lines = trimmed.split('\n').length;
    const estimatedHeight = Math.max(baseHeight, lines * 24);
    
    // Create block
    const hash = hashString(trimmed);
    blocks.push({
      id: `block-${blockIndex}-${hash.slice(0, 6)}`,
      type,
      hash,
      content: trimmed,
      estimatedHeight,
      headingLevel,
      headingId,
    });
    
    blockIndex++;
  }
  
  return blocks;
}

// Simple LRU cache for blocks
class BlockCache {
  private cache = new Map<string, SimpleBlock[]>();
  // Increased from 30 to 50 for better EditMode cache hit rate
  private maxSize = 50;
  
  get(hash: string): SimpleBlock[] | null {
    const blocks = this.cache.get(hash);
    if (blocks) {
      // LRU: move to end
      this.cache.delete(hash);
      this.cache.set(hash, blocks);
    }
    return blocks || null;
  }
  
  set(hash: string, blocks: SimpleBlock[]): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(hash, blocks);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const blockCache = new BlockCache();

/**
 * Hook: Regex-based incremental markdown blocks
 * 
 * @param content - Raw markdown string
 * @returns Blocks and content hash
 */
export function useIncrementalMarkdown(content: string) {
  const prevHashRef = useRef<string>('');
  
  const result = useMemo(() => {
    if (!content) {
      return { blocks: [], hash: '' };
    }
    
    const hash = hashString(content);
    
    // Check cache
    let blocks = blockCache.get(hash);
    if (!blocks) {
      blocks = splitContentIntoBlocks(content);
      blockCache.set(hash, blocks);
    }
    
    const changed = prevHashRef.current !== hash;
    prevHashRef.current = hash;
    
    return { blocks, hash, changed };
  }, [content]);
  
  return result;
}

/**
 * Clear the block cache
 */
export function clearBlockCache(): void {
  blockCache.clear();
}

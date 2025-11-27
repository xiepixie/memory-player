/**
 * Block Splitter (MDAST-based)
 * 
 * Splits mdast (markdown AST) into independent rendering blocks.
 * Each block can be rendered and memoized separately for incremental updates.
 * 
 * Block boundaries:
 * - Headings (h1-h6)
 * - Thematic breaks (hr)
 * - Code blocks
 * - Tables
 * - Math blocks (display mode)
 */

import type { Root, RootContent, Heading } from 'mdast';
import { type Block, getBlockHash } from './astCache';
import { generateSlug, cleanMarkdown } from '../stringUtils';

// Re-export Block type for consumers
export type { Block };

// Estimated heights for virtualization (in pixels)
const HEIGHT_ESTIMATES: Record<Block['type'], number> = {
  heading: 60,
  paragraph: 80,
  code: 150,
  list: 120,
  blockquote: 100,
  math: 100,
  table: 200,
  thematicBreak: 40,
  mixed: 100,
};

/**
 * Check if node is a block boundary (starts a new block)
 */
function isBlockBoundary(node: RootContent): boolean {
  return (
    node.type === 'heading' ||
    node.type === 'thematicBreak' ||
    node.type === 'code' ||
    node.type === 'table' ||
    // Display math blocks
    (node.type === 'math' && 'meta' in node)
  );
}

/**
 * Get block type from node
 */
function getBlockType(nodes: RootContent[]): Block['type'] {
  if (nodes.length === 0) return 'mixed';
  if (nodes.length === 1) {
    const node = nodes[0];
    switch (node.type) {
      case 'heading': return 'heading';
      case 'code': return 'code';
      case 'table': return 'table';
      case 'thematicBreak': return 'thematicBreak';
      case 'blockquote': return 'blockquote';
      case 'list': return 'list';
      case 'math': return 'math';
      case 'paragraph': return 'paragraph';
      default: return 'mixed';
    }
  }
  // Multiple nodes: classify by dominant type
  const types = nodes.map(n => n.type);
  if (types.every(t => t === 'paragraph')) return 'paragraph';
  if (types.includes('list')) return 'list';
  return 'mixed';
}

/**
 * Estimate block height based on content
 */
function estimateBlockHeight(nodes: RootContent[], type: Block['type']): number {
  const baseHeight = HEIGHT_ESTIMATES[type];
  
  // Adjust for content length
  let contentLength = 0;
  for (const node of nodes) {
    if ('value' in node) {
      contentLength += (node as any).value.length;
    }
    if ('children' in node) {
      contentLength += (node as any).children?.length * 20 || 0;
    }
  }
  
  // Rough estimate: 50 chars per line, 24px per line
  const lines = Math.ceil(contentLength / 50);
  return Math.max(baseHeight, lines * 24);
}

/**
 * Extract text from heading node for slug generation
 */
function extractHeadingText(node: Heading): string {
  const extractText = (children: any[]): string => {
    return children.map(child => {
      if (child.type === 'text') return child.value;
      if (child.children) return extractText(child.children);
      return '';
    }).join('');
  };
  return extractText(node.children);
}

/**
 * Get source position range from nodes (character offsets)
 */
function getSourceRange(nodes: RootContent[]): { start: number; end: number; startLine: number; endLine: number } {
  if (nodes.length === 0) {
    return { start: 0, end: 0, startLine: 0, endLine: 0 };
  }
  
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  
  return {
    start: first.position?.start.offset ?? 0,
    end: last.position?.end.offset ?? 0,
    startLine: first.position?.start.line ?? 0,
    endLine: last.position?.end.line ?? 0,
  };
}

/**
 * Split mdast into blocks for incremental rendering
 * @param mdast - Parsed markdown AST
 * @param originalContent - Original markdown string (for rawContent extraction)
 */
export function splitIntoBlocks(mdast: Root, originalContent: string): Block[] {
  const blocks: Block[] = [];
  let currentNodes: RootContent[] = [];
  let blockIndex = 0;
  
  // Track heading slugs for duplicate handling
  const slugCounts: Record<string, number> = {};
  
  const flushBlock = () => {
    if (currentNodes.length === 0) return;
    
    const type = getBlockType(currentNodes);
    const sourceRange = getSourceRange(currentNodes);
    
    // Extract raw content from original string (avoids double parsing)
    const rawContent = originalContent.slice(sourceRange.start, sourceRange.end);
    
    const block: Block = {
      id: `block-${blockIndex}`,
      type,
      hash: getBlockHash(currentNodes),
      nodes: [...currentNodes],
      rawContent,
      estimatedHeight: estimateBlockHeight(currentNodes, type),
      lineRange: { start: sourceRange.startLine, end: sourceRange.endLine },
    };
    
    // Extract heading metadata
    if (type === 'heading' && currentNodes.length === 1) {
      const headingNode = currentNodes[0] as Heading;
      block.headingLevel = headingNode.depth as 1 | 2 | 3 | 4 | 5 | 6;
      
      // Generate slug with duplicate handling
      const text = extractHeadingText(headingNode);
      const cleanText = cleanMarkdown(text);
      const baseSlug = generateSlug(cleanText);
      
      if (baseSlug) {
        const count = slugCounts[baseSlug] || 0;
        slugCounts[baseSlug] = count + 1;
        block.headingId = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      }
    }
    
    blocks.push(block);
    currentNodes = [];
    blockIndex++;
  };
  
  for (const node of mdast.children) {
    if (isBlockBoundary(node)) {
      // Flush pending nodes as a block
      flushBlock();
      // Add boundary node as its own block
      currentNodes = [node];
      flushBlock();
    } else {
      currentNodes.push(node);
    }
  }
  
  // Flush remaining nodes
  flushBlock();
  
  return blocks;
}

/**
 * Find blocks affected by a content change
 * Uses line ranges to map source changes to blocks
 */
export function findAffectedBlocks(
  blocks: Block[],
  changedLineStart: number,
  changedLineEnd: number
): number[] {
  const affected: number[] = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const { start, end } = block.lineRange;
    
    // Check if change overlaps with block
    if (changedLineEnd >= start && changedLineStart <= end) {
      affected.push(i);
    }
  }
  
  return affected;
}

/**
 * Merge adjacent non-boundary blocks for better rendering
 * (Optional optimization to reduce block count)
 */
export function mergeSmallBlocks(blocks: Block[], minHeight = 50): Block[] {
  const merged: Block[] = [];
  let pendingBlocks: Block[] = [];
  
  const flushPending = () => {
    if (pendingBlocks.length === 0) return;
    
    const allNodes = pendingBlocks.flatMap(b => b.nodes);
    const type = getBlockType(allNodes);
    const rawContent = pendingBlocks.map(b => b.rawContent).join('\n\n');
    
    merged.push({
      id: `block-${merged.length}`,
      type,
      hash: getBlockHash(allNodes),
      nodes: allNodes,
      rawContent,
      estimatedHeight: estimateBlockHeight(allNodes, type),
      lineRange: {
        start: pendingBlocks[0].lineRange.start,
        end: pendingBlocks[pendingBlocks.length - 1].lineRange.end,
      },
    });
    pendingBlocks = [];
  };
  
  for (const block of blocks) {
    // Always keep headings and large blocks separate
    if (
      block.type === 'heading' ||
      block.type === 'code' ||
      block.type === 'table' ||
      block.estimatedHeight >= minHeight
    ) {
      flushPending();
      merged.push({ ...block, id: `block-${merged.length}` });
    } else {
      pendingBlocks.push(block);
    }
  }
  
  flushPending();
  return merged;
}

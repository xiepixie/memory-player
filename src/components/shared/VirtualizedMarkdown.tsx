/**
 * Virtualized Markdown Renderer
 * 
 * Uses TanStack Virtual for efficient rendering of only visible blocks.
 * 
 * Architecture:
 * - VirtualizedMarkdown: Always uses useVirtualizer (hook called unconditionally)
 * - FullRenderMarkdown: No virtualization, direct block rendering
 * - AdaptiveMarkdown: Chooses based on block count threshold
 */

import { memo, useRef, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type SimpleBlock } from '../../hooks/useIncrementalMarkdown';
import { SimpleBlockRenderer, type ClozeVariant } from './SimpleBlockRenderer';
import { virtualScrollController } from '../../lib/markdown/scrollController';

export interface VirtualizedMarkdownHandle {
  scrollToBlock: (blockIndex: number) => void;
  scrollToElement: (elementId: string) => void;
  measureAll: () => void;
}

export interface VirtualizedMarkdownProps {
  blocks: SimpleBlock[];
  variant?: ClozeVariant;
  className?: string;
  onClozeClick?: (id: number, occurrenceIndex: number, target: HTMLElement) => void;
  onClozeContextMenu?: (id: number, occurrenceIndex: number, target: HTMLElement, event: React.MouseEvent) => void;
  onErrorLinkClick?: (kind: 'unclosed' | 'malformed' | 'dangling', occurrenceIndex: number, target?: HTMLElement) => void;
}

/**
 * Full Render Markdown - No virtualization
 * Used for small documents or when virtualization is not needed
 * Supports same imperative handle as VirtualizedMarkdown for consistent API
 */
export const FullRenderMarkdown = memo(forwardRef<VirtualizedMarkdownHandle, VirtualizedMarkdownProps>(({ 
  blocks, 
  variant = 'edit',
  className,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Shared cloze occurrence counter for the entire document.
  // This matches the legacy MarkdownContent behavior where cloze keys
  // (id-occurrence) are computed globally across the note, not per block.
  const clozeCountsRef = useRef<Record<number, number>>({});
  clozeCountsRef.current = {};
  
  // Expose imperative methods (DOM-based for full render mode)
  useImperativeHandle(ref, () => ({
    scrollToBlock: (blockIndex: number) => {
      const element = containerRef.current?.querySelector(`[data-block-index="${blockIndex}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    scrollToElement: (elementId: string) => {
      const element = document.getElementById(elementId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    measureAll: () => {
      // No-op for full render mode (no virtualization)
    },
  }), []);
  
  return (
    <div ref={containerRef} className={className}>
      {blocks.map((block, index) => (
        <SimpleBlockRenderer
          key={block.id}
          block={block}
          blockIndex={index}
          variant={variant}
          onClozeClick={onClozeClick}
          onClozeContextMenu={onClozeContextMenu}
          onErrorLinkClick={onErrorLinkClick}
          clozeCountsRef={clozeCountsRef}
        />
      ))}
    </div>
  );
}));
FullRenderMarkdown.displayName = 'FullRenderMarkdown';

/**
 * Virtualized Markdown Renderer
 * Hook is always called unconditionally in this component
 */
export const VirtualizedMarkdown = memo(forwardRef<VirtualizedMarkdownHandle, VirtualizedMarkdownProps>(({
  blocks,
  variant = 'edit',
  className,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => blocks[index]?.estimatedHeight ?? 100,
    overscan: 3,
  });
  
  // Update scroll controller
  virtualScrollController.setVirtualized(
    blocks as any, // SimpleBlock is compatible enough
    virtualizer.scrollToIndex.bind(virtualizer)
  );
  
  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    scrollToBlock: (blockIndex: number) => {
      virtualizer.scrollToIndex(blockIndex, { align: 'center' });
    },
    scrollToElement: (elementId: string) => {
      virtualScrollController.scrollToElement(elementId, { behavior: 'smooth' });
    },
    measureAll: () => {
      virtualizer.measure();
    },
  }), [virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div 
      ref={parentRef} 
      className={`h-full overflow-auto ${className || ''}`}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const block = blocks[virtualItem.index];
          if (!block) return null;
          
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <SimpleBlockRenderer
                block={block}
                blockIndex={virtualItem.index}
                variant={variant}
                onClozeClick={onClozeClick}
                onClozeContextMenu={onClozeContextMenu}
                onErrorLinkClick={onErrorLinkClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}));

VirtualizedMarkdown.displayName = 'VirtualizedMarkdown';

/**
 * Adaptive Markdown - Automatically chooses virtualized or full render
 * This is the recommended export for most use cases
 */
// Lower threshold for better performance on medium-sized documents
const VIRTUALIZATION_THRESHOLD = 15;

export const AdaptiveMarkdown = memo(forwardRef<VirtualizedMarkdownHandle, VirtualizedMarkdownProps>(({
  blocks,
  ...props
}, ref) => {
  // Small documents: full render for maximum compatibility with DOM-based features
  if (blocks.length < VIRTUALIZATION_THRESHOLD) {
    return (
      <FullRenderMarkdown
        ref={ref}
        blocks={blocks}
        {...props}
      />
    );
  }
  
  // Large documents: virtualize for performance
  return (
    <VirtualizedMarkdown
      ref={ref}
      blocks={blocks}
      {...props}
    />
  );
}));

AdaptiveMarkdown.displayName = 'AdaptiveMarkdown';

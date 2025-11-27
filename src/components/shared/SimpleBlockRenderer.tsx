/**
 * SimpleBlockRenderer (Regex-based - Phase 1)
 * 
 * Renders a single markdown block from SimpleBlock (regex-based splitting).
 * Memoized on block.hash - only re-renders when content actually changes.
 * 
 * Uses shared components from sharedComponents.tsx to avoid code duplication.
 */

import { memo, useRef, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { rehypeAsyncMath } from '../../lib/markdown/rehypeAsyncMath';
import rehypeRaw from 'rehype-raw';
import type { SimpleBlock } from '../../hooks/useIncrementalMarkdown';
import { 
  buildMarkdownComponents, 
  type ClozeVariant,
  type ClozeHandlerCallbacks 
} from '../../lib/markdown/sharedComponents';

// Re-export types
export type { ClozeVariant };

// Stable plugin arrays (module-level to avoid recreation)
const remarkPlugins = [remarkGfm, remarkMath];
// Use async math rendering via Web Worker instead of synchronous rehype-katex
const rehypePlugins: any = [rehypeAsyncMath, rehypeRaw];

// Heading class styles
const HEADING_CLASSES = {
  h1: 'font-serif text-3xl font-bold mt-8 mb-4 text-base-content scroll-mt-20',
  h2: 'font-serif text-2xl font-bold mt-6 mb-3 text-base-content/90 border-b border-base-content/10 pb-2 scroll-mt-20',
  h3: 'font-serif text-xl font-bold mt-5 mb-2 text-base-content/80 scroll-mt-20',
  h4: 'font-bold mt-4 mb-2 text-base-content/80 scroll-mt-20',
  h5: 'font-bold mt-3 mb-2 text-base-content/70 scroll-mt-20',
  h6: 'font-bold mt-3 mb-2 text-base-content/60 scroll-mt-20',
};

interface SimpleBlockRendererProps extends ClozeHandlerCallbacks {
  block: SimpleBlock;
  variant?: ClozeVariant;
  blockIndex: number;
  /**
   * Optional shared cloze occurrence counter for the entire document.
   * When provided, ensures cloze keys (id-occurrence) are unique across
   * all blocks instead of being reset per-block.
   */
  clozeCountsRef?: MutableRefObject<Record<number, number>>;
}

/**
 * Simple Block Renderer Component
 * 
 * Memoized on block.hash - only re-renders when content actually changes.
 */
export const SimpleBlockRenderer = memo(({
  block,
  variant = 'edit',
  blockIndex,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
  clozeCountsRef,
}: SimpleBlockRendererProps) => {
  // Track cloze occurrences:
  // - If parent provides a shared ref, use it to keep occurrence indices
  //   consistent across all blocks in the document (ClozeMode behavior).
  // - Otherwise fall back to a local per-block counter.
  const localClozeCounts = useRef<Record<number, number>>({});
  const clozeCounts = clozeCountsRef ?? localClozeCounts;

  // Only reset when using local counts; shared counts are managed by parent.
  if (!clozeCountsRef) {
    clozeCounts.current = {};
  }

  // Build components using shared factory - memoized to prevent unnecessary re-renders
  const components = useMemo(
    () => buildMarkdownComponents(variant, clozeCounts, {
      onClozeClick,
      onClozeContextMenu,
      onErrorLinkClick,
    }),
    [variant, onClozeClick, onClozeContextMenu, onErrorLinkClick]
  );
  
  // Heading-specific rendering
  if (block.type === 'heading' && block.headingLevel) {
    const HeadingTag = `h${block.headingLevel}` as keyof typeof HEADING_CLASSES;
    
    return (
      <div 
        data-block-id={block.id}
        data-block-index={blockIndex}
        data-block-type="heading"
      >
        <HeadingTag id={block.headingId} className={HEADING_CLASSES[HeadingTag]}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{ 
              p: ({ children }) => <>{children}</>,
              h1: ({ children }) => <>{children}</>,
              h2: ({ children }) => <>{children}</>,
              h3: ({ children }) => <>{children}</>,
              h4: ({ children }) => <>{children}</>,
              h5: ({ children }) => <>{children}</>,
              h6: ({ children }) => <>{children}</>,
            }}
          >
            {block.content}
          </ReactMarkdown>
        </HeadingTag>
      </div>
    );
  }

  return (
    <div 
      data-block-id={block.id}
      data-block-index={blockIndex}
      data-block-type={block.type}
      className="markdown-block"
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {block.content}
      </ReactMarkdown>
    </div>
  );
}, (prev, next) => {
  // Custom comparison: only re-render if hash or variant changes
  return prev.block.hash === next.block.hash && 
         prev.variant === next.variant &&
         prev.blockIndex === next.blockIndex;
});

SimpleBlockRenderer.displayName = 'SimpleBlockRenderer';

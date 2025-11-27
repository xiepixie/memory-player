/**
 * BlockRenderer (MDAST-based - Phase 2)
 * 
 * Renders a single markdown block with memoization.
 * Only re-renders when block hash changes, enabling incremental updates.
 * 
 * KEY OPTIMIZATION: Uses block.rawContent directly instead of serializing
 * MDAST nodes back to markdown. This avoids double parsing:
 * 
 * Old flow: markdown → MDAST → nodesToMarkdown() → ReactMarkdown → MDAST → render
 * New flow: markdown → MDAST (for splitting) → rawContent → ReactMarkdown → render
 * 
 * Uses shared components from sharedComponents.tsx to avoid code duplication.
 */

import { memo, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { rehypeAsyncMath } from '../../lib/markdown/rehypeAsyncMath';
import rehypeRaw from 'rehype-raw';
import type { Block } from '../../lib/markdown/blockSplitter';
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

interface BlockRendererProps extends ClozeHandlerCallbacks {
  block: Block;
  variant?: ClozeVariant;
  blockIndex: number;
}

/**
 * Block Renderer Component
 * 
 * Memoized on block.hash - only re-renders when content actually changes.
 * Uses block.rawContent directly to avoid double parsing overhead.
 */
export const BlockRenderer = memo(({
  block,
  variant = 'edit',
  blockIndex,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
}: BlockRendererProps) => {
  // Track cloze occurrences within this block
  // Reset on every render - safe because memo's custom comparison ensures
  // we only re-render when block.hash changes
  const clozeCounts = useRef<Record<number, number>>({});
  clozeCounts.current = {};
  
  // Use rawContent directly - no AST→MD serialization needed!
  const markdown = block.rawContent;
  
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
            {markdown}
          </ReactMarkdown>
        </HeadingTag>
      </div>
    );
  }

  // Memoize components to prevent unnecessary re-renders
  const components = useMemo(
    () => buildMarkdownComponents(variant, clozeCounts, {
      onClozeClick,
      onClozeContextMenu,
      onErrorLinkClick,
    }),
    [variant, onClozeClick, onClozeContextMenu, onErrorLinkClick]
  );

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
        {markdown}
      </ReactMarkdown>
    </div>
  );
}, (prev, next) => {
  // Custom comparison: only re-render if hash or variant changes
  return prev.block.hash === next.block.hash && 
         prev.variant === next.variant &&
         prev.blockIndex === next.blockIndex;
});

BlockRenderer.displayName = 'BlockRenderer';

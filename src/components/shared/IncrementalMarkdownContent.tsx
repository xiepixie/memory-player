/**
 * IncrementalMarkdownContent
 * 
 * Drop-in replacement for MarkdownContent with incremental rendering.
 * Uses block-level caching and optional virtualization for large documents.
 * 
 * Key differences from MarkdownContent:
 * - Splits content into blocks and memoizes each block
 * - Only re-renders blocks that changed
 * - Optional virtualization for documents > 15 blocks
 * 
 * Compatible with all MarkdownContent use cases:
 * - EditMode (edit variant)
 * - ClozeMode (review variant)
 * - BlurMode (blur variant)
 */

import { memo, forwardRef, useMemo } from 'react';
import { useIncrementalMarkdown } from '../../hooks/useIncrementalMarkdown';
import { 
  AdaptiveMarkdown, 
  FullRenderMarkdown,
  type VirtualizedMarkdownHandle 
} from './VirtualizedMarkdown';
import type { ClozeVariant } from './SimpleBlockRenderer';

// Re-export handle type for consumers
export type { VirtualizedMarkdownHandle as IncrementalMarkdownHandle };

interface IncrementalMarkdownContentProps {
  /** Markdown content to render */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Rendering mode: 'edit' (default), 'review' (ClozeMode), 'blur' (BlurMode) */
  variant?: ClozeVariant;
  /** Disable virtualization entirely (use full render) */
  disableVirtualize?: boolean;
  
  // === EditMode Props ===
  onClozeClick?: (id: number, occurrenceIndex: number, target: HTMLElement) => void;
  onClozeContextMenu?: (id: number, occurrenceIndex: number, target: HTMLElement, event: React.MouseEvent) => void;
  onErrorLinkClick?: (kind: 'unclosed' | 'malformed' | 'dangling', occurrenceIndex: number, target?: HTMLElement) => void;
}

/**
 * Incremental Markdown Content Component
 * 
 * Provides the same API as MarkdownContent but with incremental rendering.
 * Use this for better performance on frequently updating content.
 */
export const IncrementalMarkdownContent = memo(forwardRef<VirtualizedMarkdownHandle, IncrementalMarkdownContentProps>(({
  content,
  className,
  variant = 'edit',
  disableVirtualize = false,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
}, ref) => {
  // Split content into blocks with caching
  const { blocks } = useIncrementalMarkdown(content);
  
  // Wrapper class for styling consistency
  const wrapperClassName = useMemo(() => 
    `font-sans leading-loose text-lg text-base-content/90 ${className || ''}`.trim(),
    [className]
  );
  
  // Decide rendering mode
  if (disableVirtualize || blocks.length === 0) {
    return (
      <div className={wrapperClassName}>
        <FullRenderMarkdown
          ref={ref}
          blocks={blocks}
          variant={variant}
          onClozeClick={onClozeClick}
          onClozeContextMenu={onClozeContextMenu}
          onErrorLinkClick={onErrorLinkClick}
        />
      </div>
    );
  }
  
  return (
    <div className={wrapperClassName}>
      <AdaptiveMarkdown
        ref={ref}
        blocks={blocks}
        variant={variant}
        onClozeClick={onClozeClick}
        onClozeContextMenu={onClozeContextMenu}
        onErrorLinkClick={onErrorLinkClick}
      />
    </div>
  );
}));

IncrementalMarkdownContent.displayName = 'IncrementalMarkdownContent';

export default IncrementalMarkdownContent;

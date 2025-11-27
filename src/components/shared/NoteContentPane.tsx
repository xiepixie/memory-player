/**
 * NoteContentPane
 * 
 * Unified content container for Markdown rendering across all modes.
 * Ensures consistent typography, spacing, and behavior.
 * 
 * Key features:
 * - Consistent prose styling for reader modes (Cloze/Blur)
 * - Hides duplicate first H1 (title shown separately in header)
 * - Supports editor variant with minimal styling
 * - Proper flex layout for scrollable content
 */

import { memo, forwardRef } from 'react';
import clsx from 'clsx';

interface NoteContentPaneProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Display variant:
   * - 'reader': Full prose styling for Cloze/Blur modes (larger text, line height)
   * - 'editor': Minimal styling for EditMode preview (inherits from parent)
   */
  variant?: 'reader' | 'editor';
  /**
   * Whether to hide the first H1 in the content.
   * Useful when title is already displayed in a header above.
   * Default: true for reader, false for editor
   */
  hideFirstH1?: boolean;
}

/**
 * CSS selector explanation for hiding first H1:
 * [&>div>div:first-child_h1:first-of-type]:hidden
 * 
 * This targets:
 * - NoteContentPane > IncrementalMarkdownContent wrapper div
 *   > First block div (which contains the h1)
 *     > h1:first-of-type
 * 
 * The DOM structure is:
 * <NoteContentPane>           ← this component
 *   <div className="font-sans...">  ← IncrementalMarkdownContent wrapper
 *     <div>                         ← FullRenderMarkdown or AdaptiveMarkdown
 *       <div data-block-...>        ← first block
 *         <h1>Title</h1>            ← target to hide
 */
const HIDE_FIRST_H1_SELECTOR = '[&>div>div:first-child_h1:first-of-type]:hidden';

export const NoteContentPane = memo(forwardRef<HTMLDivElement, NoteContentPaneProps>(({
  children,
  className,
  variant = 'reader',
  hideFirstH1,
}, ref) => {
  // Default hideFirstH1 based on variant
  const shouldHideH1 = hideFirstH1 ?? (variant === 'reader');
  
  return (
    <div
      ref={ref}
      className={clsx(
        // Base: relative positioning for absolute children (badges, etc.)
        "relative",
        
        // Reader variant: Full prose styling for immersive reading
        variant === 'reader' && [
          "prose prose-lg",
          // Override prose max-width to allow full width (parent controls actual width)
          "max-w-none",
        ],
        
        // Editor variant: Minimal styling, let parent/children control typography
        // (No prose - EditMode preview uses its own styling via IncrementalMarkdownContent className)
        
        // Hide first H1 if requested (avoids duplicate title)
        shouldHideH1 && HIDE_FIRST_H1_SELECTOR,
        
        // Custom classes from parent (including flex-1 if needed)
        className,
      )}
    >
      {children}
    </div>
  );
}));

NoteContentPane.displayName = 'NoteContentPane';

export default NoteContentPane;

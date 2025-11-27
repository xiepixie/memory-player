/**
 * MathBlock - Async block-level math rendering
 * 
 * Renders display math ($$...$$) asynchronously via Web Worker.
 * Used as replacement for rehype-katex block output.
 */

import { memo } from 'react';
import { useKatexRender } from '../../hooks/useKatexRender';

interface MathBlockProps {
  /** LaTeX source (without $$ delimiters) */
  latex: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Loading skeleton for block math
 */
const BlockMathSkeleton = () => (
  <div className="flex items-center justify-center gap-2 h-16 my-4 animate-pulse">
    <span className="text-2xl text-base-content/15">∫</span>
    <div className="h-6 w-32 bg-base-content/10 rounded" />
    <span className="text-2xl text-base-content/15">∑</span>
  </div>
);

export const MathBlock = memo(({ latex, className }: MathBlockProps) => {
  const { html, isLoading } = useKatexRender(latex, { displayMode: true });

  if (isLoading) {
    return <BlockMathSkeleton />;
  }

  return (
    <div 
      className={`my-4 overflow-x-auto text-center ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
});

MathBlock.displayName = 'MathBlock';

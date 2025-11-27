/**
 * MathInline - Async inline math rendering
 * 
 * Renders inline math ($...$) asynchronously via Web Worker.
 * Used as replacement for rehype-katex inline output.
 */

import { memo } from 'react';
import { useKatexRender } from '../../hooks/useKatexRender';

interface MathInlineProps {
  /** LaTeX source (without $ delimiters) */
  latex: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Loading skeleton for inline math (minimal, matches text height)
 */
const InlineMathSkeleton = () => (
  <span className="inline-block animate-pulse">
    <span className="inline-block h-4 w-8 bg-base-content/10 rounded align-middle" />
  </span>
);

export const MathInline = memo(({ latex, className }: MathInlineProps) => {
  const { html, isLoading } = useKatexRender(latex, { displayMode: false });

  if (isLoading) {
    return <InlineMathSkeleton />;
  }

  return (
    <span 
      className={className}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
});

MathInline.displayName = 'MathInline';

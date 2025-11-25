import { memo } from 'react';
import clsx from 'clsx';

interface InlineClozeProps {
    id: number;
    clozeKey: string;
    isTarget: boolean;
    isContext: boolean;
    isRevealed: boolean;
    hint?: string;
    onToggle: (key: string) => void;
    children: React.ReactNode;
}

/**
 * Memoized inline cloze component for performance optimization in long documents.
 * Only re-renders when its specific props change, not when other clozes change.
 */
export const InlineCloze = memo(({
    id,
    clozeKey,
    isTarget,
    isContext,
    isRevealed,
    hint,
    onToggle,
    children
}: InlineClozeProps) => {
    return (
        <span 
            id={`cloze-${id}`} 
            data-cloze-key={clozeKey} 
            className="inline-flex items-center gap-1 align-baseline mx-1"
        >
            {/* ID Badge - unified with MathClozeBlock style */}
            <span
                className={clsx(
                    "text-[10px] font-mono font-bold select-none px-1 rounded border transition-colors duration-150",
                    isTarget
                        ? 'text-primary bg-primary/10 border-primary/20'
                        : 'text-base-content/40 bg-transparent border-transparent',
                    // Hover effect on parent group (consistent with MathClozeBlock)
                    isTarget && !isRevealed && 'group-hover:bg-primary/20 group-hover:border-primary/40'
                )}
            >
                {id}
            </span>

            {/* Cloze chip - unified styling with MathClozeBlock */}
            <span
                className={clsx(
                    "relative font-medium px-1.5 py-0.5 rounded border-b-2 transition-all duration-200 ease-out",
                    isTarget ? 'cursor-pointer' : 'cursor-default',
                    isContext
                        ? 'bg-primary/5 border-primary/25 text-base-content/90 opacity-90'
                        : isRevealed
                            // Success state - exact same as MathClozeBlock
                            ? 'bg-success/15 border-success/50 text-success font-bold shadow-sm shadow-success/20'
                            // Hidden state - ENHANCED hover effect matching MathClozeBlock
                            : 'bg-base-200/60 border-base-300 hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm hover:shadow-primary/10 active:bg-primary/15 select-none'
                )}
                onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    if (isTarget || !isContext) {
                        onToggle(clozeKey);
                    }
                }}
                title={hint || 'Click to reveal'}
                // Keyboard accessibility (unified with MathClozeBlock)
                tabIndex={isTarget && !isRevealed ? 0 : undefined}
                role={isTarget ? "button" : undefined}
                aria-pressed={isTarget ? isRevealed : undefined}
                onKeyDown={(e) => {
                    if (isTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onToggle(clozeKey);
                    }
                }}
            >
                {/* Hidden: mystery placeholder | Revealed: actual content */}
                {isRevealed ? (
                    <span>{children}</span>
                ) : (
                    <span className="inline-flex items-center justify-center text-base-content/50 font-mono text-sm tracking-tight">
                        {hint ? (
                            <span className="uppercase text-xs tracking-wide">{hint}</span>
                        ) : (
                            <span className="opacity-60">[ ? ]</span>
                        )}
                    </span>
                )}
            </span>
        </span>
    );
});

InlineCloze.displayName = 'InlineCloze';

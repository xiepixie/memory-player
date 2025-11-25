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
            className="inline group"
        >
            {/* ID Badge - inline superscript style for minimal height impact */}
            <sup
                className={clsx(
                    "text-[9px] font-mono font-bold select-none px-0.5 rounded transition-colors duration-150",
                    // Target + Revealed: success
                    isTarget && isRevealed && 'text-success bg-success/10',
                    // Target + Hidden: primary with hover
                    isTarget && !isRevealed && 'text-primary bg-primary/10 group-hover:bg-primary/20',
                    // Context: visible but muted (stronger than plain text)
                    isContext && 'text-base-content/50 bg-base-200/50',
                )}
            >
                {id}
            </sup>

            {/* Cloze content - inline with minimal height impact */}
            <span
                className={clsx(
                    "border-b-2 transition-colors duration-150",
                    isTarget ? 'cursor-pointer' : 'cursor-default',
                    // Context cloze (not being reviewed) - just underline, normal text
                    // Stronger than plain text: has ID badge + subtle underline
                    // Weaker than target: no background, no color change
                    isContext && 'border-base-content/30',
                    // Target + Revealed: success theme with background
                    // Use text-base-content for best contrast, success color for affordance
                    !isContext && isRevealed && [
                        'bg-success/15 border-success/50 text-base-content font-medium rounded-sm px-0.5',
                        isTarget && 'hover:bg-success/25 hover:border-success/60 active:bg-success/30'
                    ],
                    // Target + Hidden: clear click affordance with background
                    !isContext && !isRevealed && [
                        'bg-base-200/80 border-base-300 rounded-sm px-1',
                        isTarget && 'hover:bg-primary/10 hover:border-primary/40 active:bg-primary/15 select-none'
                    ]
                )}
                onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    if (isTarget || !isContext) {
                        onToggle(clozeKey);
                    }
                }}
                title={isRevealed ? 'Click to hide' : (hint || 'Click to reveal')}
                // Keyboard accessibility
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
                {/* Hidden: mystery placeholder | Revealed: actual content (-1 DOM level) */}
                {isRevealed ? (
                    children
                ) : (
                    <span className="inline-flex items-center justify-center text-base-content/50 font-mono text-sm">
                        {hint ? (
                            <span className="uppercase text-xs tracking-wide">{hint}</span>
                        ) : (
                            '[ ? ]'
                        )}
                    </span>
                )}
            </span>
        </span>
    );
});

InlineCloze.displayName = 'InlineCloze';

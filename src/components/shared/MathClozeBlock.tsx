import React, { memo } from 'react';
import clsx from 'clsx';
import { useKatexRender } from '../../hooks/useKatexRender';

interface MathClozeBlockProps {
    id: number;
    /** Unique key for this cloze occurrence (e.g., "1-0", "1-1") */
    clozeKey?: string;
    latex: string;
    isRevealed: boolean;
    isInteractive: boolean; // true for ClozeMode, false for EditMode/Preview
    onToggle?: () => void;
    className?: string;
    /** 'review' = ClozeMode (success/primary), 'edit' = EditMode (always primary) */
    variant?: 'review' | 'edit';
}

/**
 * Loading skeleton for async KaTeX render
 */
const MathSkeleton = () => (
    <div className="flex items-center justify-center gap-3 w-full py-4 animate-pulse opacity-60">
        <div className="h-1.5 w-6 bg-base-content/10 rounded-full" />
        <span className="text-2xl text-base-content/10 font-serif italic">f</span>
        <div className="h-8 w-32 bg-base-content/10 rounded-md" />
        <span className="text-xl text-base-content/10">=</span>
        <div className="h-8 w-20 bg-base-content/10 rounded-md" />
        <div className="h-1.5 w-6 bg-base-content/10 rounded-full" />
    </div>
);

export const MathClozeBlock: React.FC<MathClozeBlockProps> = memo(({
    id,
    clozeKey,
    latex,
    isRevealed,
    isInteractive,
    onToggle,
    className,
    variant = 'review'
}) => {
    // In edit mode, always use primary theme regardless of revealed state
    const useSuccessTheme = variant === 'review' && isRevealed;
    
    // Async KaTeX rendering via Web Worker
    // Cache hits are synchronous (no loading state), cache misses render async
    const { html: renderedHtml, isLoading } = useKatexRender(latex, { displayMode: true });

    // Determine visual state
    const showContent = !isInteractive || isRevealed;

    return (
        <div 
            id={`cloze-${id}`}
            data-cloze-key={clozeKey}
            className={clsx(
                "my-4 relative group math-cloze-block max-w-[95%] mx-auto", // Reduced margin + CSS containment + centered width
                isInteractive ? "cursor-pointer" : "cursor-default",
                className
            )}
            onClick={(e) => {
                if (isInteractive && onToggle) {
                    e.stopPropagation();
                    onToggle();
                }
            }}
        >
            {/* Badge Indicator - unified with text cloze style */}
            <div className="absolute -top-2.5 left-3 z-10">
                <span className={clsx(
                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors duration-100",
                    // Non-interactive (context view)
                    !isInteractive && "bg-neutral text-neutral-content/80 border-transparent",
                    // Interactive + success theme (ClozeMode revealed)
                    isInteractive && useSuccessTheme && "bg-success/15 text-success border-success/30",
                    // Interactive + primary theme (EditMode or ClozeMode hidden)
                    isInteractive && !useSuccessTheme && "bg-primary/10 text-primary border-primary/20 group-hover:bg-primary/20 group-hover:border-primary/40"
                )}>
                    c{id}
                </span>
            </div>

            {/* Content Container - unified styling with text cloze */}
            <div 
                data-cloze-id={id}
                className={clsx(
                    "rounded-lg border-2 px-4 overflow-x-auto",
                    "transition-colors duration-150",
                    // Non-interactive (context view)
                    !isInteractive && "bg-base-100 border-base-200 py-3",
                    // Interactive - common styles
                    isInteractive && [
                        "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
                        // Removed active:scale-[0.995] to prevent jumpy animation
                    ],
                    // Success theme (ClozeMode revealed)
                    isInteractive && useSuccessTheme && [
                        "bg-success/10 border-success/40 py-3",
                        "hover:bg-success/20 hover:border-success/50 hover:shadow-sm hover:shadow-success/20",
                        "active:bg-success/25"
                    ],
                    // Primary theme - hidden state (ClozeMode)
                    isInteractive && !useSuccessTheme && !isRevealed && [
                        "bg-base-200/60 border-base-300 py-6",
                        "hover:bg-primary/10 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10",
                        "active:bg-primary/15"
                    ],
                    // Primary theme - revealed state (EditMode preview)
                    // No background by default (like text clozes), only border
                    isInteractive && !useSuccessTheme && isRevealed && [
                        "border-primary/30 py-3",
                        "hover:bg-primary/10 hover:border-primary/40 hover:shadow-sm hover:shadow-primary/10",
                        "active:bg-primary/15"
                    ]
                )}
                tabIndex={isInteractive && !isRevealed ? 0 : undefined}
                role={isInteractive ? "button" : undefined}
                aria-pressed={isInteractive ? isRevealed : undefined}
                onKeyDown={(e) => {
                    if (isInteractive && onToggle && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onToggle();
                    }
                }}
            >
                {/* Hidden: mystery placeholder | Revealed: actual KaTeX formula */}
                {showContent ? (
                    isLoading ? (
                        <MathSkeleton />
                    ) : (
                        <div 
                            className="w-full text-center"
                            dangerouslySetInnerHTML={{ __html: renderedHtml || '' }}
                        />
                    )
                ) : (
                    <div className="flex items-center justify-center gap-3 text-base-content/50 font-mono select-none">
                        <span className="text-2xl opacity-30 group-hover:opacity-70 group-hover:text-primary transition-[color,opacity] duration-150">∫</span>
                        <span className="text-sm uppercase tracking-wider group-hover:text-primary font-medium transition-colors duration-150">Click to Reveal</span>
                        <span className="text-2xl opacity-30 group-hover:opacity-70 group-hover:text-primary transition-[color,opacity] duration-150">Σ</span>
                    </div>
                )}
            </div>
        </div>
    );
});

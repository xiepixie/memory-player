import React, { useEffect, useRef, useMemo, memo } from 'react';
import katex from 'katex';
import clsx from 'clsx';

interface MathClozeBlockProps {
    id: number;
    latex: string;
    isRevealed: boolean;
    isInteractive: boolean; // true for ClozeMode, false for EditMode/Preview
    onToggle?: () => void;
    className?: string;
}

// Memoize KaTeX HTML rendering to avoid re-parsing on every state change
const renderKatexToString = (latex: string): string => {
    try {
        return katex.renderToString(latex, {
            displayMode: true,
            throwOnError: false,
            trust: false
        });
    } catch {
        return `<span class="text-error">${latex}</span>`;
    }
};

export const MathClozeBlock: React.FC<MathClozeBlockProps> = memo(({
    id,
    latex,
    isRevealed,
    isInteractive,
    onToggle,
    className
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Memoize the rendered HTML so it doesn't re-render on reveal state changes
    const renderedHtml = useMemo(() => renderKatexToString(latex), [latex]);

    // Set innerHTML only when needed (revealed or non-interactive)
    useEffect(() => {
        if ((!isInteractive || isRevealed) && containerRef.current) {
            containerRef.current.innerHTML = renderedHtml;
        }
    }, [renderedHtml, isRevealed, isInteractive]);

    const shouldShowContent = !isInteractive || isRevealed;

    return (
        <div 
            className={clsx(
                "my-6 relative group transition-all duration-300",
                isInteractive 
                    ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
                    : "cursor-default",
                className
            )}
            onClick={(e) => {
                if (isInteractive && onToggle) {
                    e.stopPropagation();
                    onToggle();
                }
            }}
        >
            {/* Badge Indicator */}
            <div className="absolute -top-3 left-4 z-10">
                <span className={clsx(
                    "badge badge-sm font-mono font-bold shadow-sm transition-colors duration-300 text-[10px]",
                    !isInteractive && "badge-neutral text-neutral-content/80",
                    isInteractive && !isRevealed && "badge-primary text-primary-content group-hover:scale-105",
                    isInteractive && isRevealed && "badge-success text-success-content group-hover:scale-105"
                )}>
                    c{id}
                </span>
            </div>

            {/* Content Container */}
            <div 
                className={clsx(
                    "rounded-lg border-2 p-4 min-h-[4rem] flex items-center justify-center overflow-x-auto transition-all duration-300",
                    // Preview / non-interactive (EditMode, context)
                    !isInteractive && "bg-base-100 border-base-200 shadow-sm group-hover:border-primary/30 group-hover:bg-base-100/90",
                    // Interactive target - revealed state
                    isInteractive && isRevealed && "bg-success/10 border-success/60 text-success",
                    // Interactive target - hidden state
                    isInteractive && !isRevealed && "bg-base-200/60 border-primary/40 hover:bg-base-200 hover:border-primary/80 shadow-inner"
                )}
            >
                {shouldShowContent ? (
                    <div ref={containerRef} className="w-full text-center" />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-base-content/50 select-none">
                        <span className="text-xs font-medium uppercase tracking-widest opacity-70">
                            Math Formula
                        </span>
                        <span className="text-[11px] opacity-60">
                            Click to Reveal
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
});

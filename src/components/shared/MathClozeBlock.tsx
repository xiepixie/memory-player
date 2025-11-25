import React, { useEffect, useRef, useContext, useState, useMemo, useCallback, startTransition } from 'react';
import clsx from 'clsx';
import { useStore } from 'zustand';
import { ClozeStoreContext, createClozeStore } from '../modes/ClozeStore';
import { renderKatexCached, renderKatexAsync } from '../../lib/katexCache';

interface MathClozeBlockProps {
    id: number;
    latex: string;
    isRevealed?: boolean;
    isInteractive: boolean;
    onToggle?: () => void;
    className?: string;
    uniqueKey?: string; // Added for store subscription
}

// Dummy store for hooks stability when context is missing
const dummyStore = createClozeStore();

export const MathClozeBlock = React.memo(({
    id,
    latex,
    isRevealed: propIsRevealed = true,
    isInteractive,
    onToggle,
    className,
    uniqueKey,
    isInline = false
}: MathClozeBlockProps & { isInline?: boolean }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const store = useContext(ClozeStoreContext);
    const [hasOverflow, setHasOverflow] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);

    // Dummy store fallback
    const storeInstance = store || dummyStore;

    const storeState = useStore(storeInstance, (state) => {
        if (store && uniqueKey) {
            return state.revealed[uniqueKey];
        }
        return undefined;
    });

    const isRevealed = (store && uniqueKey && storeState !== undefined)
        ? storeState
        : propIsRevealed;

    const shouldShowContent = !isInteractive || isRevealed;

    // Async KaTeX rendering to avoid blocking main thread
    const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);

    useEffect(() => {
        if (!shouldShowContent) {
            setRenderedHtml(null);
            return;
        }

        // Try sync cache first (instant if cached)
        try {
            const cached = renderKatexCached(latex, { displayMode: !isInline });
            setRenderedHtml(cached);
            return;
        } catch {
            // Fall through to async
        }

        // Async render for uncached formulas
        setIsRendering(true);
        renderKatexAsync(latex, { displayMode: !isInline })
            .then((html) => {
                startTransition(() => {
                    setRenderedHtml(html);
                    setIsRendering(false);
                });
            })
            .catch((e) => {
                console.error('KaTeX rendering error:', e);
                setRenderedHtml(`<span class="text-error">${latex}</span>`);
                setIsRendering(false);
            });
    }, [latex, shouldShowContent, isInline]);

    // Check for horizontal overflow and track scroll progress
    const checkOverflow = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const hasHorizontalOverflow = el.scrollWidth > el.clientWidth + 2;
        setHasOverflow(hasHorizontalOverflow);
        if (hasHorizontalOverflow) {
            const maxScroll = el.scrollWidth - el.clientWidth;
            setScrollProgress(maxScroll > 0 ? el.scrollLeft / maxScroll : 0);
        }
    }, []);

    useEffect(() => {
        if (!shouldShowContent) return;
        // Check overflow after render
        const frame = requestAnimationFrame(checkOverflow);
        return () => cancelAnimationFrame(frame);
    }, [shouldShowContent, renderedHtml, checkOverflow]);

    // Listen for scroll events to update progress indicator
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el || !hasOverflow) return;

        const handleScroll = () => {
            const maxScroll = el.scrollWidth - el.clientWidth;
            setScrollProgress(maxScroll > 0 ? el.scrollLeft / maxScroll : 0);
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [hasOverflow]);

    // Estimate formula complexity for better placeholder
    const formulaHint = useMemo(() => {
        if (latex.includes('\\begin{align')) return 'Multi-line Equation';
        if (latex.includes('\\begin{matrix}') || latex.includes('\\begin{pmatrix}')) return 'Matrix';
        if (latex.includes('\\int') || latex.includes('\\sum') || latex.includes('\\prod')) return 'Calculus';
        if (latex.includes('\\frac')) return 'Fraction';
        if (latex.length > 100) return 'Complex Formula';
        return 'Math Formula';
    }, [latex]);

    return (
        <div
            ref={wrapperRef}
            data-cloze-id={id}
            data-revealed={isInteractive && isRevealed ? "true" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            role={isInteractive ? "button" : undefined}
            aria-pressed={isInteractive ? isRevealed : undefined}
            className={clsx(
                "relative group",
                isInline ? "inline-block align-middle mx-1" : "my-6 block",
                isInteractive
                    ? "cursor-pointer"
                    : "cursor-default",
                className
            )}
            onClick={(e) => {
                if (isInteractive && onToggle) {
                    e.stopPropagation();
                    onToggle();
                }
            }}
            onKeyDown={(e) => {
                if (isInteractive && onToggle && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle();
                }
            }}
        >
            {/* Cloze ID Badge */}
            <span
                className={clsx(
                    "absolute z-10 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-sm transition-all duration-200",
                    isInline ? "-top-2 -right-2" : "-top-3 left-4",
                    !isInteractive && "bg-base-300 text-base-content/70",
                    isInteractive && !isRevealed && "bg-primary text-primary-content animate-pulse",
                    isInteractive && isRevealed && "bg-success text-success-content"
                )}
            >
                c{id}
            </span>

            {/* Main Container */}
            <div
                className={clsx(
                    "rounded-lg border-2 transition-all duration-300 ease-out",
                    isInline ? "px-2 py-1 min-h-[2rem]" : "min-h-[4rem]",
                    // Preview / non-interactive
                    !isInteractive && "bg-base-100 border-base-200 shadow-sm group-hover:border-primary/30 group-hover:shadow-md",
                    // Interactive target - revealed
                    isInteractive && isRevealed && "bg-success/5 border-success/50 shadow-sm",
                    // Interactive target - hidden
                    isInteractive && !isRevealed && "bg-base-200/60 border-primary/40 hover:bg-base-200 hover:border-primary/60 shadow-inner hover:shadow-md"
                )}
            >
                {shouldShowContent && renderedHtml ? (
                    <div className="relative">
                        {/* Scrollable Content */}
                        <div
                            ref={scrollContainerRef}
                            className={clsx(
                                "overflow-x-auto scroll-smooth",
                                isInline ? "" : "p-4",
                                // Smooth reveal animation
                                "animate-in fade-in duration-200"
                            )}
                            style={{
                                // Subtle mask for overflow indication
                                maskImage: hasOverflow 
                                    ? `linear-gradient(to right, black ${scrollProgress < 0.05 ? '0%' : '0%, transparent 0%'}, black 5%, black 95%, ${scrollProgress > 0.95 ? 'black 100%' : 'transparent 100%'})`
                                    : undefined,
                                WebkitMaskImage: hasOverflow 
                                    ? `linear-gradient(to right, ${scrollProgress < 0.05 ? 'black' : 'transparent'} 0%, black 5%, black 95%, ${scrollProgress > 0.95 ? 'black' : 'transparent'} 100%)`
                                    : undefined,
                            }}
                        >
                            <div 
                                className={clsx("w-full", !isInline && "text-center")}
                                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                            />
                        </div>

                        {/* Overflow Scroll Indicator */}
                        {hasOverflow && !isInline && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                <span className="text-[9px] font-mono uppercase tracking-wider text-base-content/50">
                                    Scroll
                                </span>
                                <div className="w-12 h-1 bg-base-300 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary/60 rounded-full transition-all duration-100"
                                        style={{ width: `${Math.max(20, scrollProgress * 100)}%`, marginLeft: `${scrollProgress * 80}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Placeholder when hidden or loading
                    <div className={clsx(
                        "flex flex-col items-center justify-center gap-2 select-none w-full transition-all duration-200",
                        isInline ? "py-1" : "py-6"
                    )}>
                        {/* Formula type icon hint */}
                        <div className="flex items-center gap-2 text-base-content/40">
                            {isRendering ? (
                                // Loading spinner for async rendering
                                <svg className="w-5 h-5 animate-spin opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v7M14 17.5h6" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                            <span className="text-xs font-medium uppercase tracking-widest">
                                {isRendering ? 'Rendering...' : formulaHint}
                            </span>
                        </div>
                        {!isInline && isInteractive && !isRendering && (
                            <span className="text-[11px] text-base-content/30 font-medium">
                                Click or Press Space
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

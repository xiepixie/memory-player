import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useRef, useMemo } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { getThemeColors } from '../../lib/themeUtils';
import { MathClozeBlock } from '../shared/MathClozeBlock';
import { motion } from 'framer-motion';

export const ClozeMode = ({ immersive = false }: { immersive?: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  const currentClozeIndex = useAppStore((state) => state.currentClozeIndex);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const clozeCountsRef = useRef<Record<number, number>>({});

  // Reset per-render occurrence counters so that text and math clozes share
  // a consistent id+occurrenceIndex scheme aligned with parser order.
  clozeCountsRef.current = {};

  const allClozeKeys = useMemo(() => {
    if (!currentNote || !currentNote.clozes || currentNote.clozes.length === 0) {
      return [] as string[];
    }
    const counts: Record<number, number> = {};
    return currentNote.clozes.map((c) => {
      const count = counts[c.id] || 0;
      counts[c.id] = count + 1;
      return `${c.id}-${count}`;
    });
  }, [currentNote]);

  // Reset revealed state when note changes
  useEffect(() => {
    setRevealed({});
  }, [currentNote]);

  // Auto-scroll to active cloze
  useEffect(() => {
    if (currentClozeIndex !== null) {
        // Wait for render
        setTimeout(() => {
            const el = document.getElementById(`cloze-${currentClozeIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add a temporary highlight effect?
            }
        }, 100);
    }
  }, [currentClozeIndex, currentNote]);

  // Listen for global shortcut events
  useEffect(() => {
    const handleShortcut = () => {
        // Unified three-state toggle-all based on current mode
        toggleAll();
    };
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [currentNote]); 

  if (!currentNote) return null;

  const focusNextOccurrence = (currentKey: string) => {
    if (currentClozeIndex === null) return;

    // Find all occurrences for the current cloze id in document order
    const targetKeys = allClozeKeys.filter((key) => {
      const [idStr] = key.split('-');
      const id = parseInt(idStr, 10);
      return !Number.isNaN(id) && id === currentClozeIndex;
    });

    if (targetKeys.length <= 1) return;

    const index = targetKeys.indexOf(currentKey);
    if (index === -1 || index === targetKeys.length - 1) return;

    const nextKey = targetKeys[index + 1];
    const nextEl = document.querySelector<HTMLElement>(`[data-cloze-key="${nextKey}"]`);
    if (!nextEl) return;

    const rect = nextEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const margin = 96; // leave some breathing room around the target
    const isInView = rect.top >= margin && rect.bottom <= viewportHeight - margin;

    if (!isInView) {
      nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Reuse TOC target highlight pattern for cloze guidance
    document.querySelectorAll('.toc-target-highlight').forEach((el) => {
      el.classList.remove('toc-target-highlight');
    });

    // Force reflow to allow restarting animation on repeated focus
    void nextEl.offsetWidth;

    nextEl.classList.add('toc-target-highlight');

    setTimeout(() => {
      nextEl.classList.remove('toc-target-highlight');
    }, 1500);
  };

  const toggleReveal = (key: string) => {
    if (!revealed[key]) {
      setRevealed(prev => ({ ...prev, [key]: true }));
      
      // Confetti only for the active target or in free mode
      const [idStr] = key.split('-');
      const id = parseInt(idStr, 10);
      if (currentClozeIndex === null || (!Number.isNaN(id) && id === currentClozeIndex)) {
          const themeColors = getThemeColors();
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.6 },
            colors: themeColors.length > 0 ? themeColors : ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'],
            zIndex: 10000,
            disableForReducedMotion: true
          });
      }

      // Queue mode guidance: after revealing one occurrence, hint the next one
      if (currentClozeIndex !== null) {
        focusNextOccurrence(key);
      }
    }
  };

  const isAllRevealed = allClozeKeys.length > 0 && 
    allClozeKeys.every(key => revealed[key]);

  const toggleAll = () => {
    if (allClozeKeys.length === 0) return;

    setRevealed(prev => {
      // Free / preview mode: operate on all occurrences
      if (currentClozeIndex === null) {
        const allRevealedNow = allClozeKeys.every((key) => prev[key]);
        if (allRevealedNow) {
          return {};
        }
        const next: Record<string, boolean> = { ...prev };
        allClozeKeys.forEach((key) => {
          next[key] = true;
        });
        return next;
      }

      // Queue mode: only operate on occurrences of the current cloze id
      const targetKeys = allClozeKeys.filter((key) => {
        const [idStr] = key.split('-');
        const id = parseInt(idStr, 10);
        return !Number.isNaN(id) && id === currentClozeIndex;
      });

      if (targetKeys.length === 0) return prev;

      const allTargetRevealed = targetKeys.every((key) => prev[key]);
      const next: Record<string, boolean> = { ...prev };

      if (allTargetRevealed) {
        // Clear only the current cloze id occurrences; keep other ids as-is
        targetKeys.forEach((key) => {
          delete next[key];
        });
        return next;
      }

      // Reveal all occurrences of the current cloze id
      targetKeys.forEach((key) => {
        next[key] = true;
      });

      return next;
    });
  };

  return (
    <div className={`w-full h-full flex flex-col select-none transition-all duration-500 ease-out ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}>
      <div className={`flex justify-between items-center transition-all duration-300 ${immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'}`}>
        <div className="flex flex-col gap-1">
            <h1 className={`font-serif font-bold tracking-tight m-0 transition-all duration-300 ${immersive ? 'text-2xl' : 'text-4xl'}`}>
            {currentNote.frontmatter.title || 'Untitled Note'}
            </h1>
            {currentClozeIndex !== null && (
                <span className="text-xs font-mono text-primary/70 uppercase tracking-widest">
                    Reviewing Cloze #{currentClozeIndex}
                </span>
            )}
        </div>

        {!immersive && currentClozeIndex === null && (
            <ModeActionHint 
                label="to Reveal"
                action="Press"
                keys={['SPACE']}
                extraContent={
                    <button 
                        className="text-primary hover:text-primary-content hover:bg-primary px-2 py-0.5 rounded text-xs font-bold transition-all uppercase tracking-wider min-w-[80px]"
                        onClick={toggleAll}
                    >
                        {isAllRevealed ? 'Hide All' : 'Show All'}
                    </button>
                }
            />
        )}
      </div>

      <div className="transition-all duration-300 flex-1 prose prose-lg relative" ref={scrollRef}>
        <MarkdownContent
          content={currentNote.renderableContent} 
          components={{
            a: ({ href, children, title }) => {
              if (href?.startsWith('#cloze-')) {
                const parts = href.replace('#cloze-', '').split('-');
                const idStr = parts[0];
                const id = parseInt(idStr, 10);
                const hintStr = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : undefined;
                
                // Logic:
                // If currentClozeIndex is SET (Review Mode):
                //   - If id == currentClozeIndex: Show as HIDDEN (unless revealed) -> Active Target
                //   - If id != currentClozeIndex: Show as REVEALED (Context) -> Reduced opacity?
                // If currentClozeIndex is NULL (Free Mode):
                //   - Show as HIDDEN (unless revealed)
                
                const isTarget = currentClozeIndex !== null ? id === currentClozeIndex : true;
                const isContext = !isTarget;

                let occurrenceIndex = 0;
                if (!Number.isNaN(id)) {
                  const current = clozeCountsRef.current[id] ?? 0;
                  occurrenceIndex = current;
                  clozeCountsRef.current[id] = current + 1;
                }
                const key = `${id}-${occurrenceIndex}`;

                const baseRevealed = !!revealed[key];
                const isRevealed = currentClozeIndex !== null
                  ? (isTarget ? baseRevealed : true) // Queue mode: context always revealed / locked open
                  : baseRevealed; // Free mode: all ids respect per-occurrence revealed state

                const hint = hintStr || title;

                return (
                  <span id={`cloze-${id}`} data-cloze-key={key} className="inline-flex items-center gap-1 align-baseline mx-1">
                    {/* ID Badge */}
                    <span className={`text-[10px] font-mono font-bold select-none px-1 rounded border transition-colors ${
                        isTarget 
                            ? 'text-primary bg-primary/10 border-primary/20' 
                            : 'text-base-content/40 bg-transparent border-transparent'
                    }`}>
                        {id}
                    </span>

                    <motion.span
                      className={clsx(
                        "font-medium px-1 rounded transition-all duration-300 ease-out border-b-2 -translate-y-0.5",
                        isTarget ? "cursor-pointer" : "cursor-default",
                        isContext 
                            ? "bg-primary/5 border-primary/25 text-base-content/90" // Context Style: soft primary chip
                            : isRevealed
                                ? "bg-success/20 border-success text-success font-bold" // Revealed Target chip
                                : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none relative overflow-hidden" // Hidden Target chip
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        // Free mode: any cloze is clickable; queue mode: only current id
                        const canToggle = currentClozeIndex === null || isTarget;
                        if (canToggle) toggleReveal(key);
                      }}
                      title={hint || "Click to reveal"}
                      initial={false}
                      animate={
                        isContext
                          ? { opacity: 0.9, scale: 1 }
                          : isRevealed
                              ? { opacity: 1, scale: 1 }
                              : { opacity: 0.9, scale: 0.97 }
                      }
                      whileHover={isTarget ? { scale: 1.03 } : undefined}
                      whileTap={isTarget ? { scale: 0.97 } : undefined}
                      transition={{ type: "spring", stiffness: 260, damping: 20, mass: 0.4 }}
                    >
                      {!isRevealed && hint && (
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-base-content/40 font-mono uppercase tracking-wide">
                              {hint}
                          </span>
                      )}
                      <span className={!isRevealed ? "invisible" : ""}>{children}</span>
                    </motion.span>
                  </span>
                );
              }
              return <a href={href} title={title} className="link link-primary" target={href?.startsWith('http') ? "_blank" : undefined}>{children}</a>;
            },
            code: ({ className, children, ...props }) => {
              const match = /language-([\w-]+)/.exec(className || '');
              const lang = match?.[1];
              const isInline = !match;

              if (lang && lang.startsWith('math-cloze-')) {
                const idStr = lang.replace('math-cloze-', '');
                const id = parseInt(idStr, 10);
                const latex = String(children).trim();

                const isTarget = currentClozeIndex !== null ? id === currentClozeIndex : true;
                const isContext = !isTarget;

                let occurrenceIndex = 0;
                if (!Number.isNaN(id)) {
                  const current = clozeCountsRef.current[id] ?? 0;
                  occurrenceIndex = current;
                  clozeCountsRef.current[id] = current + 1;
                }
                const key = `${id}-${occurrenceIndex}`;

                const baseRevealed = !!revealed[key];
                const isRevealed = currentClozeIndex !== null
                  ? (isTarget ? baseRevealed : true)
                  : baseRevealed;

                const handleToggle = () => {
                  const canToggle = currentClozeIndex === null || isTarget;
                  if (canToggle) toggleReveal(key);
                };

                return (
                  <div id={`cloze-${id}`} data-cloze-key={key} className="my-6">
                    <MathClozeBlock
                      id={Number.isNaN(id) ? 0 : id}
                      latex={latex}
                      isRevealed={isRevealed}
                      isInteractive={isTarget}
                      onToggle={handleToggle}
                      className={isContext ? 'opacity-60' : undefined}
                    />
                  </div>
                );
              }

              // Fallback to a regular code rendering similar to MarkdownContent
              return isInline ? (
                <code className="bg-base-300 px-1.5 py-0.5 rounded text-sm font-mono text-primary font-bold" {...props}>
                  {children}
                </code>
              ) : (
                <div className="mockup-code bg-neutral text-neutral-content my-4 text-sm">
                  <pre className="px-4"><code>{children}</code></pre>
                </div>
              );
            },
          }}
        />
      </div>
    </div>
  );
};


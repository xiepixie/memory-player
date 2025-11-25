import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useRef, useMemo } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import confetti from 'canvas-confetti';
import { getThemeColors } from '../../lib/themeUtils';
import { MathClozeBlock } from '../shared/MathClozeBlock';

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
      setTimeout(() => {
        const el = document.getElementById(`cloze-${currentClozeIndex}`);
        const container = document.getElementById('note-scroll-container');
        if (el && container) {
          // Use manual scroll calculation to avoid layout thrashing
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const scrollOffset = elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
          container.scrollTop += scrollOffset;
        }
      }, 100);
    }
  }, [currentClozeIndex, currentNote]);

  // Listen for global shortcut events
  useEffect(() => {
    const handleShortcut = () => {
      toggleAll();
    };
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [currentNote]);

  if (!currentNote) return null;

  const focusNextOccurrence = (currentKey: string) => {
    if (currentClozeIndex === null) return;

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
    const margin = 96;
    const isInView = rect.top >= margin && rect.bottom <= viewportHeight - margin;

    if (!isInView) {
      // Use manual scroll calculation to avoid layout thrashing
      const container = document.getElementById('note-scroll-container');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const scrollOffset = rect.top - containerRect.top - containerRect.height / 2 + rect.height / 2;
        container.scrollTop += scrollOffset;
      }
    }

    // Use RAF to batch DOM operations and avoid forced reflow
    requestAnimationFrame(() => {
      document.querySelectorAll('.toc-target-highlight').forEach((el) => {
        el.classList.remove('toc-target-highlight');
      });
      requestAnimationFrame(() => {
        nextEl.classList.add('toc-target-highlight');
      });
    });

    setTimeout(() => {
      nextEl.classList.remove('toc-target-highlight');
    }, 1500);
  };

  const toggleReveal = (key: string) => {
    if (!revealed[key]) {
      setRevealed((prev) => ({ ...prev, [key]: true }));

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
          disableForReducedMotion: true,
        });
      }

      if (currentClozeIndex !== null) {
        focusNextOccurrence(key);
      }
    }
  };

  const isAllRevealed = allClozeKeys.length > 0 && allClozeKeys.every((key) => revealed[key]);

  const toggleAll = () => {
    if (allClozeKeys.length === 0) return;

    setRevealed((prev) => {
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

      const targetKeys = allClozeKeys.filter((key) => {
        const [idStr] = key.split('-');
        const id = parseInt(idStr, 10);
        return !Number.isNaN(id) && id === currentClozeIndex;
      });

      if (targetKeys.length === 0) return prev;

      const allTargetRevealed = targetKeys.every((key) => prev[key]);
      const next: Record<string, boolean> = { ...prev };

      if (allTargetRevealed) {
        targetKeys.forEach((key) => {
          delete next[key];
        });
        return next;
      }

      targetKeys.forEach((key) => {
        next[key] = true;
      });

      return next;
    });
  };

  return (
    <div
      className={`w-full h-full flex flex-col select-none transition-all duration-500 ease-out ${
        immersive ? 'px-12 py-4' : 'px-8 py-8'
      }`}
    >
      <div
        className={`flex justify-between items-center transition-all duration-300 ${
          immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'
        }`}
      >
        <div className="flex flex-col gap-1">
          <h1
            className={`font-serif font-bold tracking-tight m-0 transition-all duration-300 ${
              immersive ? 'text-2xl' : 'text-4xl'
            }`}
          >
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

      <div
        className="transition-all duration-300 flex-1 prose prose-lg relative"
        ref={scrollRef}
      >
        <MarkdownContent
          content={currentNote.renderableContent}
          components={{
            a: ({ href, children, title }) => {
              if (href?.startsWith('#cloze-')) {
                const parts = href.replace('#cloze-', '').split('-');
                const idStr = parts[0];
                const id = parseInt(idStr, 10);
                const hintStr = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : undefined;

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

                const hint = hintStr || title;

                return (
                  <span id={`cloze-${id}`} data-cloze-key={key} className="inline-flex items-center gap-1 align-baseline mx-1">
                    {/* ID Badge */}
                    <span
                      className={`text-[10px] font-mono font-bold select-none px-1 rounded border transition-colors ${
                        isTarget
                          ? 'text-primary bg-primary/10 border-primary/20'
                          : 'text-base-content/40 bg-transparent border-transparent'
                      }`}
                    >
                      {id}
                    </span>

                    {/* Cloze chip with CSS transitions instead of Framer Motion */}
                    <span
                      className={`font-medium px-1 rounded border-b-2 -translate-y-0.5 transition-all duration-200 ${
                        isTarget
                          ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.97]'
                          : 'cursor-default'
                      } ${
                        isContext
                          ? 'bg-primary/5 border-primary/25 text-base-content/90 opacity-90'
                          : isRevealed
                              ? 'bg-success/20 border-success text-success font-bold'
                              : 'bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none relative overflow-hidden'
                      }`}
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        const canToggle = currentClozeIndex === null || isTarget;
                        if (canToggle) toggleReveal(key);
                      }}
                      title={hint || 'Click to reveal'}
                    >
                      {!isRevealed && hint && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-base-content/40 font-mono uppercase tracking-wide">
                          {hint}
                        </span>
                      )}
                      <span className={!isRevealed ? 'invisible' : ''}>{children}</span>
                    </span>
                  </span>
                );
              }
              return (
                <a
                  href={href}
                  title={title}
                  className="link link-primary"
                  target={href?.startsWith('http') ? '_blank' : undefined}
                >
                  {children}
                </a>
              );
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

              return isInline ? (
                <code
                  className="bg-base-300 px-1.5 py-0.5 rounded text-sm font-mono text-primary font-bold"
                  {...props}
                >
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


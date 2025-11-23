import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useRef } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { getThemeColors } from '../../lib/themeUtils';
import { MathClozeBlock } from '../shared/MathClozeBlock';

export const ClozeMode = ({ immersive = false }: { immersive?: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  const currentClozeIndex = useAppStore((state) => state.currentClozeIndex);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

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
        if (currentClozeIndex !== null) {
            // In focused mode, reveal the current cloze
            toggleReveal(currentClozeIndex.toString());
        } else {
            revealAll();
        }
    };
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [currentNote, currentClozeIndex]); 

  if (!currentNote) return null;

  const toggleReveal = (id: string) => {
    if (!revealed[id]) {
      setRevealed(prev => ({ ...prev, [id]: true }));
      
      // Confetti only for the active target or in free mode
      if (currentClozeIndex === null || id === currentClozeIndex.toString()) {
          const themeColors = getThemeColors();
          confetti({
            particleCount: 30,
            spread: 50,
            origin: { y: 0.6 },
            colors: themeColors.length > 0 ? themeColors : ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a']
          });
      }
    }
  };

  const revealAll = () => {
    if (!currentNote) return;
    const allIds: Record<string, boolean> = {};
    currentNote.clozes.forEach(c => allIds[c.id] = true);
    setRevealed(prev => ({ ...prev, ...allIds }));
  };

  const isAllRevealed = currentNote && currentNote.clozes.length > 0 && 
    currentNote.clozes.every(c => revealed[c.id]);

  const toggleAll = () => {
    if (isAllRevealed) {
        setRevealed({});
    } else {
        revealAll();
    }
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
                const isRevealed = revealed[idStr] || !isTarget;
                const isContext = !isTarget;

                const hint = hintStr || title;

                return (
                  <span id={`cloze-${id}`} className="inline-flex items-center gap-1 align-middle mx-1">
                    {/* ID Badge */}
                    <span className={`text-[10px] font-mono font-bold select-none px-1 rounded border transition-colors ${
                        isTarget 
                            ? 'text-primary bg-primary/10 border-primary/20' 
                            : 'text-base-content/20 bg-base-200 border-base-content/5'
                    }`}>
                        {id}
                    </span>

                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded cursor-pointer transition-all duration-200 border-b-2",
                        isContext 
                            ? "bg-base-200 border-transparent text-base-content/50" // Context Style
                            : isRevealed
                                ? "bg-success/20 border-success text-success font-bold" // Revealed Target
                                : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none relative overflow-hidden" // Hidden Target
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isTarget) toggleReveal(idStr);
                      }}
                      title={hint || "Click to reveal"}
                    >
                      {!isRevealed && !isContext && hint && (
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-base-content/40 font-mono uppercase tracking-wide">
                              {hint}
                          </span>
                      )}
                      <span className={!isRevealed && !isContext ? "invisible" : ""}>{children}</span>
                    </span>
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
                const isRevealed = revealed[idStr] || !isTarget;
                const isContext = !isTarget;

                const handleToggle = () => {
                  if (isTarget) {
                    toggleReveal(idStr);
                  }
                };

                return (
                  <div id={`cloze-${id}`} className="my-6">
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


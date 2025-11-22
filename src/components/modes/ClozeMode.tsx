import { useAppStore } from '../../store/appStore';
import { useState, useEffect } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { getThemeColors } from '../../lib/themeUtils';

export const ClozeMode = ({ immersive = false }: { immersive?: boolean }) => {
  const { currentNote } = useAppStore();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRevealed({});
  }, [currentNote]);

  // Listen for global shortcut events
  useEffect(() => {
    const handleShortcut = () => revealAll();
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [currentNote]); // Re-bind if note changes just in case

  if (!currentNote) return null;

  const toggleReveal = (id: string) => {
    if (!revealed[id]) {
      setRevealed(prev => ({ ...prev, [id]: true }));
      
      const themeColors = getThemeColors();
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.6 },
        colors: themeColors.length > 0 ? themeColors : ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a']
      });
    }
  };

  const revealAll = () => {
    if (!currentNote) return;
    const allIds: Record<string, boolean> = {};
    currentNote.clozes.forEach(c => allIds[c.id] = true);
    setRevealed(prev => ({ ...prev, ...allIds }));
  };

  return (
    <div className={`w-full h-full flex flex-col select-none transition-all duration-500 ease-out ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}>
      <div className={`flex justify-between items-center transition-all duration-300 ${immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'}`}>
        <h1 className={`font-serif font-bold tracking-tight m-0 transition-all duration-300 ${immersive ? 'text-2xl' : 'text-4xl'}`}>
          {currentNote.frontmatter.title || 'Untitled Note'}
        </h1>
        {!immersive && (
            <ModeActionHint 
                label="to Reveal"
                action="Press"
                keys={['SPACE']}
                extraContent={
                    <button 
                        className="text-primary hover:text-primary-content hover:bg-primary px-2 py-0.5 rounded text-xs font-bold transition-all uppercase tracking-wider"
                        onClick={revealAll}
                    >
                        Show All
                    </button>
                }
            />
        )}
      </div>

      <div className="transition-all duration-300 flex-1 prose prose-lg relative">
        <MarkdownContent
          content={currentNote.renderableContent} // Use pre-parsed content with #cloze-id links
          components={{
            a: ({ href, children, title }) => {
              // Parser outputs: #cloze-1 or #cloze-1-Hint
              if (href?.startsWith('#cloze-')) {
                const parts = href.replace('#cloze-', '').split('-');
                const id = parts[0];
                const hintStr = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : undefined;
                
                const isRevealed = revealed[id];
                
                // Combine title attribute (if any) with parsed hint
                const hint = hintStr || title;

                return (
                  <span className="inline-flex items-center gap-1 align-middle mx-1">
                    {/* ID Badge - Always visible to clarify order */}
                    <span className="text-[10px] font-mono font-bold text-base-content/40 select-none bg-base-200 px-1 rounded border border-base-content/10">
                        {id}
                    </span>

                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded cursor-pointer transition-all duration-200 border-b-2",
                        isRevealed
                          ? "bg-success/20 border-success text-success font-bold"
                          : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none relative overflow-hidden"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleReveal(id);
                      }}
                      title={hint || "Click to reveal"}
                    >
                      {/* If hidden, we show hint if available, otherwise show nothing (transparent text handles size) */}
                      {!isRevealed && hint && (
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-base-content/40 font-mono uppercase tracking-wide">
                              {hint}
                          </span>
                      )}
                      <span className={!isRevealed ? "invisible" : ""}>{children}</span>
                    </span>
                  </span>
                );
              }
              // Pass through other links
              return <a href={href} title={title} className="link link-primary" target={href?.startsWith('http') ? "_blank" : undefined}>{children}</a>;
            },
          }}
        />
      </div>
    </div>
  );
};


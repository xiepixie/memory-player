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

  const processedContent = processClozes(currentNote.content);

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
          content={processedContent}
          components={{
            a: ({ href, children, title }) => {
              // Check for #cloze: protocol (safe from sanitization)
              if (href?.startsWith('#cloze:')) {
                const id = href.split(':')[1];
                const isRevealed = revealed[id];
                const hint = title;

                return (
                  <span
                    className={clsx(
                      "inline-block px-2 py-0.5 rounded mx-1 cursor-pointer transition-all duration-200 border-b-2 align-middle",
                      isRevealed
                        ? "bg-success/20 border-success text-success font-bold"
                        : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none"
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleReveal(id);
                    }}
                    title={hint || "Click to reveal"}
                  >
                    {children}
                  </span>
                );
              }
              return <a href={href} title={title} className="link link-primary">{children}</a>;
            },
          }}
        />
      </div>
    </div>
  );
};

function processClozes(content: string): string {
  let processed = content;

  // Replace ==text== with [text](#cloze:id)
  // We need to ensure IDs are unique or consistent. 
  // Since parser.ts assigns IDs, we should ideally use those, but here we are re-processing raw content.
  // The parser.ts logic is for the *data model*. Here is for *rendering*.
  // We can just auto-increment here too.

  let clozeId = 1;
  processed = processed.replace(/==(.*?)==/g, (_match, answer) => {
    const id = clozeId++;
    return `[${answer}](#cloze:${id})`;
  });

  return processed;
}

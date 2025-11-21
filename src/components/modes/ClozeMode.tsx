import { useAppStore } from '../../store/appStore';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { MarkdownImage } from '../shared/MarkdownImage';

export const ClozeMode = () => {
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
       confetti({
         particleCount: 30,
         spread: 50,
         origin: { y: 0.6 },
         colors: ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a']
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
    <div className="prose prose-lg max-w-4xl mx-auto py-10 px-6 select-none">
       <div className="flex justify-between items-center mb-6 border-b pb-4 border-base-content/10">
          <h1 className="font-serif text-4xl m-0">
            {currentNote.frontmatter.title || 'Untitled Note'}
          </h1>
          <div className="flex gap-2 items-center">
              <span className="text-xs opacity-50 hidden lg:inline">Space to Reveal</span>
              <button className="btn btn-sm btn-secondary" onClick={revealAll}>Show All</button>
          </div>
       </div>

      <div className="font-sans leading-loose">
        <ReactMarkdown
            components={{
                img: MarkdownImage,
                a: ({ href, children, title }) => {
                    if (href?.startsWith('cloze:')) {
                        const id = href.split(':')[1];
                        const isRevealed = revealed[id];
                        const hint = title;

                        return (
                            <span
                                className={clsx(
                                    "inline-block px-2 py-0.5 rounded mx-1 cursor-pointer transition-all duration-200 border-b-2",
                                    isRevealed
                                        ? "bg-success/20 border-success text-success-content"
                                        : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10"
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
                    return <a href={href} title={title}>{children}</a>;
                },
            }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};

function processClozes(content: string): string {
    let processed = content;

    processed = processed.replace(/\{\{c(\d+)::(.*?)(::(.*?))?\}\}/g, (_match, id, answer, _group3, hint) => {
        const safeHint = hint ? ` "${hint.replace(/"/g, '')}"` : '';
        return `[${answer}](cloze:${id}${safeHint})`;
    });

    processed = processed.replace(/==(.*?)==/g, (_match, answer) => {
        return `[${answer}](cloze:highlight)`;
    });

    return processed;
}

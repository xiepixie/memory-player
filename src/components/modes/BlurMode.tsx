import { useAppStore } from '../../store/appStore';
import { useRef, useEffect, useState } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';

export const BlurMode = ({ immersive = false }: { immersive?: boolean }) => {
  const { currentNote } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPeeking, setIsPeeking] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        containerRef.current.style.setProperty('--x', `${x}px`);
        containerRef.current.style.setProperty('--y', `${y}px`);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPeeking(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPeeking(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  if (!currentNote) return null;

  // Hints extraction
  const hints = currentNote.hints || [];

  return (
    <div className={`w-full min-h-full flex flex-col select-none transition-all duration-500 ease-out ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}>
      {/* Hints Section */}
      {hints.length > 0 && !immersive && (
        <div className="mb-8 p-4 bg-warning/10 border-l-4 border-warning rounded-r">
          <h3 className="font-bold text-warning mb-2">HINTS</h3>
          <ul className="list-disc list-inside">
            {hints.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </div>
      )}

      <div className={`flex justify-between items-center transition-all duration-300 ${immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'}`}>
        <h1 className={`font-serif font-bold tracking-tight m-0 transition-all duration-300 ${immersive ? 'text-2xl' : 'text-4xl'}`}>
          {currentNote.frontmatter.title || 'Untitled Note'}
        </h1>
        {!immersive && (
            <ModeActionHint 
                label="to Peek"
                action="Hold"
                keys={['SPACE']}
            />
        )}
      </div>

      {/* Flashlight Container */}
      <div
        ref={containerRef}
        className="relative flex-1 prose prose-lg max-w-none"
        style={{
          '--x': '0px',
          '--y': '0px',
          cursor: isPeeking ? 'default' : 'none'
        } as React.CSSProperties}
      >
        {/* Blurred Layer (Background) - Relative to set height */}
        <div
          className={`relative transition-all duration-200 ${isPeeking ? 'filter-none opacity-100' : 'filter blur-[6px] opacity-100'}`}
          aria-hidden="true"
        >
          <MarkdownContent content={cleanContent(currentNote.content)} />
        </div>

        {/* Reveal Layer (Flashlight) - Only visible when NOT peeking */}
        <div
          className="absolute inset-0 transition-opacity duration-200 pointer-events-none"
          style={{
            opacity: isPeeking ? 0 : 1,
            maskImage: 'radial-gradient(circle 80px at var(--x) var(--y), black 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(circle 80px at var(--x) var(--y), black 0%, transparent 100%)',
          }}
        >
          <MarkdownContent content={cleanContent(currentNote.content)} />
        </div>
      </div>
    </div>
  );
};

function cleanContent(content: string): string {
  return content.replace(/==(.*?)==/g, '$1');
}

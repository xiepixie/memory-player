import { useAppStore } from '../../store/appStore';
import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { MarkdownImage } from '../shared/MarkdownImage';

export const BlurMode = () => {
  const { currentNote } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

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

      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!currentNote) return null;

  // Hints extraction
  const hints = currentNote.hints || [];

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 h-full flex flex-col">
       {/* Hints Section */}
       {hints.length > 0 && (
           <div className="mb-8 p-4 bg-warning/10 border-l-4 border-warning rounded-r">
               <h3 className="font-bold text-warning mb-2">HINTS</h3>
               <ul className="list-disc list-inside">
                   {hints.map((h, i) => <li key={i}>{h}</li>)}
               </ul>
           </div>
       )}

       <h1 className="font-serif text-4xl mb-6 pb-4 border-b border-base-content/10">
            {currentNote.frontmatter.title || 'Untitled Note'}
       </h1>

       {/* Flashlight Container */}
       <div
         ref={containerRef}
         className="relative flex-1 prose prose-lg"
         style={{
             '--x': '0px',
             '--y': '0px',
             cursor: 'none' // Hide default cursor inside
         } as React.CSSProperties}
       >
          {/* Blurred Layer */}
          <div
            className="absolute inset-0 filter blur-[6px] select-none pointer-events-none"
            aria-hidden="true"
          >
             <ReactMarkdown components={{ img: MarkdownImage }}>{cleanContent(currentNote.content)}</ReactMarkdown>
          </div>

          {/* Reveal Layer (Masked) */}
          <div
            className="absolute inset-0"
            style={{
                maskImage: 'radial-gradient(circle 80px at var(--x) var(--y), black 0%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(circle 80px at var(--x) var(--y), black 0%, transparent 100%)',
            }}
          >
              <ReactMarkdown components={{ img: MarkdownImage }}>{cleanContent(currentNote.content)}</ReactMarkdown>
          </div>
       </div>
    </div>
  );
};

function cleanContent(content: string): string {
    return content.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').replace(/==(.*?)==/g, '$1');
}

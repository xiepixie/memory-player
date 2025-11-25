import { useAppStore } from '../../store/appStore';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { useShallow } from 'zustand/react/shallow';
import { getNoteDisplayTitle } from '../../lib/stringUtils';

export const BlurMode = ({ immersive = false }: { immersive?: boolean }) => {
  const { currentNote, currentFilepath, loadNote } = useAppStore(
    useShallow((state) => ({
      currentNote: state.currentNote,
      currentFilepath: state.currentFilepath,
      loadNote: state.loadNote,
    })),
  );

  useFileWatcher(currentFilepath, () => {
    if (currentFilepath) {
        loadNote(currentFilepath);
    }
  });

  if (!currentNote) return null;

  // Hints extraction
  const hints = currentNote.hints || [];

  return (
    <div
      className={`w-full min-h-full flex flex-col select-none transition-all duration-500 ease-out ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}
    >
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
          {getNoteDisplayTitle(currentNote.frontmatter.title)}
        </h1>
        {!immersive && (
            <ModeActionHint 
                label="to Peek"
                action="Hold"
                keys={['SPACE']}
            />
        )}
      </div>

      {/* Flashlight Container (layout only; blur handled at note-scroll-container level) */}
      <div className="relative flex-1 max-w-none">
        <div className="relative border-t border-transparent transition-all duration-200 prose prose-lg max-w-none">
          <MarkdownContent 
            content={cleanContent(currentNote.content)} 
            disableIds={false}
            hideFirstH1
          />
        </div>
      </div>
    </div>
  );
}

function cleanContent(content: string): string {
  return content
    .replace(/==(.*?)==/g, '$1')
    .replace(/{{c\d+::([\s\S]*?)(?:::(.*?))?}}/g, '$1');
}

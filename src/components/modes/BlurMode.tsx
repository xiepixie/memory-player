import { useAppStore } from '../../store/appStore';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
// REMOVED: useFileWatcher here - useVaultWatcher in Layout handles file watching globally
// Having multiple watchers causes duplicate IPC calls and performance issues in Tauri
import { getNoteDisplayTitle } from '../../lib/stringUtils';

export const BlurMode = ({ immersive = false }: { immersive?: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  // File watching is now handled globally by useVaultWatcher in Layout.tsx
  // This avoids duplicate watchers and reduces IPC overhead in Tauri

  if (!currentNote) return null;

  // Hints extraction
  const hints = currentNote.hints || [];

  return (
    <div
      className={`w-full min-h-full flex flex-col select-none ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}
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

      <div className={`flex justify-between items-center transition-opacity duration-200 ${immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'}`}>
        <h1 className={`font-serif font-bold tracking-tight m-0 ${immersive ? 'text-2xl' : 'text-4xl'}`}>
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

      {/* Content Container - merged wrappers for reduced DOM depth */}
      <div className="relative flex-1 prose prose-lg max-w-none">
        <MarkdownContent 
          content={currentNote.renderableContent}
          variant="blur"
          hideFirstH1
        />
      </div>
    </div>
  );
}

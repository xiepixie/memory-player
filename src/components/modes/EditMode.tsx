import { useAppStore } from '../../store/appStore';
import { useState, useRef, useEffect } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Heading2, Quote } from 'lucide-react';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useToastStore } from '../../store/toastStore';

export const EditMode = () => {
  const { currentNote, currentFilepath, loadNote } = useAppStore();
  const { addToast } = useToastStore();
  const [content, setContent] = useState(currentNote?.raw || '');
  const [previewContent, setPreviewContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (currentNote) {
      setContent(currentNote.raw);
      setPreviewContent(currentNote.raw);
    }
  }, [currentNote]);

  // Debounce preview update for performance on long files
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewContent(content);
    }, 200);
    return () => clearTimeout(timer);
  }, [content]);

  if (!currentNote || !currentFilepath) return null;

  const handleSave = async () => {
    try {
      if (typeof window.__TAURI__ !== 'undefined') {
        await writeTextFile(currentFilepath, content);
        addToast('Note saved successfully', 'success');
        await loadNote(currentFilepath); // Reload to update state
      } else {
        addToast('Saving is only available in desktop app', 'warning');
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to save note', 'error');
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    let selectedText = content.substring(start, end);

    // Smart wrapping: Trim whitespace from selection to avoid wrapping markers around spaces/newlines
    // This fixes the issue where "markers appear on the next line" when wrapping text with newlines
    if (selectedText.length > 0) {
        const leadingSpaceMatch = selectedText.match(/^\s*/);
        const leadingSpaceLen = leadingSpaceMatch ? leadingSpaceMatch[0].length : 0;
        
        const trailingSpaceMatch = selectedText.match(/\s*$/);
        const trailingSpaceLen = trailingSpaceMatch ? trailingSpaceMatch[0].length : 0;
        
        // Only trim if we're not selecting ONLY whitespace
        if (leadingSpaceLen + trailingSpaceLen < selectedText.length) {
            start += leadingSpaceLen;
            end -= trailingSpaceLen;
            selectedText = selectedText.substring(leadingSpaceLen, selectedText.length - trailingSpaceLen);
            
            // Update selection range to the trimmed text
            textarea.setSelectionRange(start, end);
        }
    }
    
    // Use execCommand to preserve Undo history
    // Although deprecated, it's the only way to integrate with the native undo stack reliably
    const newText = before + selectedText + after;
    
    // Select the text to be replaced so insertText replaces it
    // (We re-set this in case we didn't enter the trim block, or to confirm the trimmed selection)
    textarea.setSelectionRange(start, end);
    
    const success = document.execCommand('insertText', false, newText);
    
    if (!success) {
        // Fallback if execCommand fails (though unlikely in modern browsers for this)
        const combinedText = content.substring(0, start) + newText + content.substring(end);
        setContent(combinedText);
    }

    // Re-calculate cursor position to wrap the original selection
    setTimeout(() => {
      textarea.focus();
      // If we wrapped text, select the wrapped text inside the markers
      // e.g. **text** -> select "text"
      const innerStart = start + before.length;
      const innerEnd = innerStart + selectedText.length;
      textarea.setSelectionRange(innerStart, innerEnd);
    }, 0);
  };

  const insertCloze = () => {
      insertText('==', '==');
  };

  // Pre-process content to render ==text== as highlights
  const processedPreview = previewContent.replace(/==(.*?)==/g, '[$1](#highlight)');

  return (
    <div className="h-full flex flex-col bg-base-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-base-200 bg-base-100">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <span className="font-bold text-sm opacity-50 ml-2 mr-4">EDITING</span>
          
          <div className="join join-horizontal mr-2">
            <button className="btn btn-sm join-item btn-ghost" onClick={() => insertText('**', '**')} title="Bold">
                <Bold size={16} />
            </button>
            <button className="btn btn-sm join-item btn-ghost" onClick={() => insertText('*', '*')} title="Italic">
                <Italic size={16} />
            </button>
            <button className="btn btn-sm join-item btn-ghost" onClick={() => insertText('> ')} title="Quote">
                <Quote size={16} />
            </button>
          </div>

          <div className="join join-horizontal mr-2">
            <button className="btn btn-sm join-item btn-ghost" onClick={() => insertText('# ')} title="Heading 1">
                <Heading1 size={16} />
            </button>
            <button className="btn btn-sm join-item btn-ghost" onClick={() => insertText('## ')} title="Heading 2">
                <Heading2 size={16} />
            </button>
          </div>

          <button className="btn btn-sm btn-ghost" onClick={() => insertText('- ')} title="List">
            <List size={16} />
          </button>

          <div className="w-px h-6 bg-base-300 mx-2" />

           <button
            className="btn btn-sm btn-ghost gap-2 text-secondary"
            onClick={insertCloze}
            title="Highlight/Cloze (Ctrl+B)"
          >
            <Type size={16} />
            <span className="hidden sm:inline">Highlight</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-primary gap-2"
            onClick={handleSave}
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 border-r border-base-200 flex flex-col min-w-[300px]">
          <textarea
            ref={textareaRef}
            className="flex-1 w-full h-full p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed bg-base-100"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start typing..."
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                insertCloze();
              }
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>

        {/* Preview */}
        <div className="flex-1 bg-base-200/50 overflow-y-auto px-8 py-8">
          <MarkdownContent
            content={processedPreview}
            className="text-base" // Override text-lg to be slightly smaller for split view
            components={{
                a: ({ href, children }) => {
                    if (href === '#highlight') {
                        return (
                            <span className="bg-primary/20 text-primary border-b-2 border-primary px-1 rounded">
                                {children}
                            </span>
                        );
                    }
                    return <a href={href} className="link link-primary">{children}</a>;
                }
            }}
          />
        </div>
      </div>
    </div>
  );
};

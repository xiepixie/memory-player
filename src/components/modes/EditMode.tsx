import { useAppStore } from '../../store/appStore';
import { useState, useRef, useEffect } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Heading2, Quote, Copy } from 'lucide-react';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useToastStore } from '../../store/toastStore';
import { ClozeUtils } from '../../lib/markdown/clozeUtils';
import { parseNote } from '../../lib/markdown/parser';

export const EditMode = () => {
  const { currentNote, currentFilepath, loadNote, dataService } = useAppStore();
  const { addToast } = useToastStore();
  const [content, setContent] = useState(currentNote?.raw || '');
  const [isSaving, setIsSaving] = useState(false);

  // Instead of raw preview content, we parse it to use our renderableContent logic
  // We use a parsed state to hold the result of parseNote
  const [parsedPreview, setParsedPreview] = useState(() => parseNote(content));
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (currentNote) {
      setContent(currentNote.raw);
      setParsedPreview(parseNote(currentNote.raw));
    }
  }, [currentNote]);

  // Debounce preview update
  useEffect(() => {
    const timer = setTimeout(() => {
      setParsedPreview(parseNote(content));
    }, 200);
    return () => clearTimeout(timer);
  }, [content]);

  if (!currentNote || !currentFilepath) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (typeof window.__TAURI__ !== 'undefined') {
        await writeTextFile(currentFilepath, content);
        
        // Sync to Supabase
        const noteId = useAppStore.getState().pathMap[currentFilepath];
        
        if (noteId && dataService) {
            addToast('Syncing to cloud...', 'info');
            await dataService.syncNote(currentFilepath, content, noteId);
        }

        addToast('Note saved & synced', 'success');
        await loadNote(currentFilepath); // Reload to update state
      } else {
        addToast('Saving is only available in desktop app', 'warning');
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to save note', 'error');
    } finally {
        setIsSaving(false);
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    let selectedText = content.substring(start, end);

    // Smart trim logic...
    if (selectedText.length > 0) {
        const leadingSpaceMatch = selectedText.match(/^\s*/);
        const leadingSpaceLen = leadingSpaceMatch ? leadingSpaceMatch[0].length : 0;
        const trailingSpaceMatch = selectedText.match(/\s*$/);
        const trailingSpaceLen = trailingSpaceMatch ? trailingSpaceMatch[0].length : 0;
        
        if (leadingSpaceLen + trailingSpaceLen < selectedText.length) {
            start += leadingSpaceLen;
            end -= trailingSpaceLen;
            selectedText = selectedText.substring(leadingSpaceLen, selectedText.length - trailingSpaceLen);
            textarea.setSelectionRange(start, end);
        }
    }
    
    const newText = before + selectedText + after;
    const success = document.execCommand('insertText', false, newText);
    
    if (!success) {
        const combinedText = content.substring(0, start) + newText + content.substring(end);
        setContent(combinedText);
    }

    setTimeout(() => {
      textarea.focus();
      const innerStart = start + before.length;
      const innerEnd = innerStart + selectedText.length;
      textarea.setSelectionRange(innerStart, innerEnd);
    }, 0);
  };

  /**
   * Inserts a new cloze with auto-incremented ID (e.g., c1 -> c2)
   */
  const insertCloze = (sameId = false) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // 1. Find current max ID in the WHOLE content
      const maxId = ClozeUtils.getMaxClozeNumber(content);
      
      // 2. Determine new ID
      // If sameId is true, use maxId (group with previous). 
      // If maxId is 0, force 1.
      // If sameId is false, use maxId + 1.
      const newId = sameId ? (maxId || 1) : (maxId + 1);

      // 3. Get selection
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end);

      // 4. Wrap
      const wrapped = ClozeUtils.createCloze(selectedText || '...', newId);

      // 5. Insert
      insertText(wrapped, '');
  };

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

           {/* Cloze Group */}
           <div className="join join-horizontal">
              <button
                className="btn btn-sm join-item btn-ghost gap-2 text-secondary"
                onClick={() => insertCloze(false)}
                title="New Cloze (Ctrl+B)"
              >
                <Type size={16} />
                <span className="hidden sm:inline">New Cloze</span>
              </button>
              <button
                className="btn btn-sm join-item btn-ghost gap-2 text-secondary/70"
                onClick={() => insertCloze(true)}
                title="Same Cloze ID (Group)"
              >
                <Copy size={16} />
              </button>
           </div>
        </div>

        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-primary gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={16} />}
            {isSaving ? 'Syncing...' : 'Save'}
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
                insertCloze(false);
              }
              // Shift+Ctrl+B for same ID cloze
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
                  e.preventDefault();
                  insertCloze(true);
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
            content={parsedPreview.renderableContent}
            className="text-base"
          />
        </div>
      </div>
    </div>
  );
};

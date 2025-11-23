import { useAppStore } from '../../store/appStore';
import { isTauri } from '../../lib/tauri';
import { useState, useRef, useEffect, useMemo } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Heading2, Quote, Copy } from 'lucide-react';
import { fileSystem } from '../../lib/services/fileSystem';
import { useToastStore } from '../../store/toastStore';
import { ClozeUtils } from '../../lib/markdown/clozeUtils';
import { parseNote } from '../../lib/markdown/parser';
import { useFileWatcher } from '../../hooks/useFileWatcher';

export const EditMode = () => {
  const { currentNote, currentFilepath, loadNote, dataService, currentClozeIndex, updateLastSync, currentVault } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);
  const [content, setContent] = useState(currentNote?.raw || '');
  const [isSaving, setIsSaving] = useState(false);
  const [targetClozeId, setTargetClozeId] = useState<number | null>(null);

  // Instead of raw preview content, we parse it to use our renderableContent logic
  // We use a parsed state to hold the result of parseNote
  const [parsedPreview, setParsedPreview] = useState(() => parseNote(content));
  const isDirty = content !== (currentNote?.raw ?? '');
  const clozeStats = useMemo(() => {
    const clozes = ((parsedPreview as any)?.clozes ?? []) as { id?: number }[];
    const counts = new Map<number, number>();
    let total = 0;
    let maxId = 0;

    for (const c of clozes) {
      if (typeof c.id === 'number') {
        counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
        total += 1;
        if (c.id > maxId) maxId = c.id;
      }
    }

    // Check for gaps
    const missingIds: number[] = [];
    if (maxId > 0) {
      for (let i = 1; i <= maxId; i++) {
        if (!counts.has(i)) {
          missingIds.push(i);
        }
      }
    }

    const entries = Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([id, count]) => ({ id, count }));

    return { total, unique: entries.length, entries, missingIds };
  }, [parsedPreview]);

  const scrollToCloze = (id: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const val = textarea.value;
    const pattern = `{{c${id}::`;
    
    // Find all occurrences in editor
    const indices: number[] = [];
    let pos = val.indexOf(pattern);
    while (pos !== -1) {
        indices.push(pos);
        pos = val.indexOf(pattern, pos + 1);
    }

    if (indices.length === 0) return;

    // Cycle logic: Find the next occurrence after the current cursor
    const currentStart = textarea.selectionStart;
    let targetIndex = indices.findIndex(idx => idx > currentStart);
    
    // Wrap around if we are past the last one (or currently AT the last one)
    if (targetIndex === -1) {
        targetIndex = 0;
    }

    const targetPos = indices[targetIndex];

    // 1. Scroll Editor & Select
    textarea.focus();
    textarea.setSelectionRange(targetPos, targetPos + pattern.length);
    
    // Center the line in editor
    const textBefore = val.substring(0, targetPos);
    const lines = textBefore.split('\n').length;
    const lineHeight = 24; 
    const targetTop = (lines - 1) * lineHeight;
    const clientHeight = textarea.clientHeight;
    textarea.scrollTop = Math.max(0, targetTop - clientHeight / 2);

    // 2. Scroll Preview (Sync with the specific instance index)
    const previewElements = document.querySelectorAll(`[data-cloze-id="${id}"]`) as NodeListOf<HTMLElement>;
    const targetEl = previewElements[targetIndex];
    
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Reset animation trick
      previewElements.forEach((el) => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      });
      void targetEl.offsetWidth; // Force reflow
      previewElements.forEach((el) => {
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      });
      
      setTimeout(() => {
        previewElements.forEach((el) => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        });
      }, 4000);
    }
  };
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stateRef = useRef({ content, currentNote });
  const lastSelfSaveAtRef = useRef<number | null>(null);

  // Update ref for watcher
  useEffect(() => {
    stateRef.current = { content, currentNote };
  }, [content, currentNote]);

  // Watch file changes using hook
  useFileWatcher(currentFilepath, async () => {
    // Ignore file events that are very likely triggered by our own save
    if (lastSelfSaveAtRef.current && Date.now() - lastSelfSaveAtRef.current < 1500) {
      return;
    }

    const { content: localContent, currentNote: baseNote } = stateRef.current;
    const isDirty = baseNote && localContent !== baseNote.raw;

    if (!isDirty && currentFilepath) {
        // Safe to reload if we haven't changed anything
        await loadNote(currentFilepath);
        addToast('File updated externally', 'info');
    } else {
        addToast('External changes detected but you have unsaved work', 'warning');
    }
  });

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
    if (!isDirty) {
      addToast('No changes to save', 'info');
      return;
    }
    setIsSaving(true);
    try {
      if (isTauri()) {
        // Mark the time of this save so that the file watcher can ignore our own write event
        lastSelfSaveAtRef.current = Date.now();

        await fileSystem.writeNote(currentFilepath, content);
        
        // Immediately update in-memory cache and currentNote so other modes (Blur/Cloze)
        // and global UI see the latest content without waiting for reload
        useAppStore.setState((state) => ({
          contentCache: { ...state.contentCache, [currentFilepath]: content },
          currentNote: parseNote(content),
        }));
        
        // Sync to Supabase
        const noteId = useAppStore.getState().pathMap[currentFilepath];

        if (noteId && dataService) {
            addToast('Syncing to cloud...', 'info');
            await dataService.syncNote(currentFilepath, content, noteId, currentVault?.id);
            updateLastSync();
        }

        addToast('Note saved & synced', 'success');
        // Reload to refresh metadata (cards/due dates) while preserving current cloze focus if any
        await loadNote(currentFilepath, currentClozeIndex ?? null);
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

  const updateTargetClozeId = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const id = ClozeUtils.findPrecedingClozeId(textarea.value, textarea.selectionStart);
      setTargetClozeId(id);
  };

  /**
   * Inserts a new cloze with auto-incremented ID (e.g., c1 -> c2)
   */
  const insertCloze = (sameId = false) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Always use the live textarea value as the source of truth
      const full = textarea.value;

      // 1. Find current max ID in the WHOLE content
      const maxId = ClozeUtils.getMaxClozeNumber(full);

      // 2. Determine target ID
      let targetId: number;

      if (sameId) {
          // Try to reuse the closest previous cloze ID before the cursor
          const prevId = ClozeUtils.findPrecedingClozeId(full, textarea.selectionStart);

          if (prevId !== null) {
              targetId = prevId;
          } else if (maxId > 0) {
              targetId = maxId;
          } else {
              targetId = 1;
          }
      } else {
          // New cloze always gets a fresh ID after the global maximum
          targetId = maxId + 1;
      }

      // 3. Get selection and apply the same smart-trim logic used in insertText
      textarea.focus();

      let start = textarea.selectionStart;
      let end = textarea.selectionEnd;
      let selectedText = full.substring(start, end);

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

      const innerText = selectedText || '...';
      const newText = ClozeUtils.createCloze(innerText, targetId);

      const success = document.execCommand('insertText', false, newText);

      if (!success) {
          // Fallback: manually update content based on the previous full value
          const combinedText = full.substring(0, start) + newText + full.substring(end);
          setContent(combinedText);
      } else {
          // Keep React state in sync with the live textarea value
          setContent(textarea.value);
      }

      setTimeout(() => {
          const current = textareaRef.current;
          if (!current) return;

          current.focus();

          const innerOffset = newText.indexOf(innerText);
          if (innerOffset >= 0) {
              const innerStart = start + innerOffset;
              const innerEnd = innerStart + innerText.length;
              current.setSelectionRange(innerStart, innerEnd);
          } else {
              const pos = start + newText.length;
              current.setSelectionRange(pos, pos);
          }
      }, 0);
  };

  return (
    <div className="h-full flex flex-col bg-base-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-base-200 bg-base-100">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 ml-2 mr-4">
            <span className="font-bold text-xs opacity-60 tracking-wide">EDITING</span>
            <span className={`badge badge-xs ${isDirty ? 'badge-warning' : 'badge-ghost'}`}>
              {isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            {typeof currentClozeIndex === 'number' && (
              <span className="badge badge-outline badge-xs">
                Focus c{currentClozeIndex}
              </span>
            )}
            {clozeStats.total > 0 && (
              <span className="badge badge-ghost badge-xs">
                {clozeStats.total} cloze
                {clozeStats.unique > 0 ? ` / ${clozeStats.unique} ids` : ''}
              </span>
            )}
          </div>

          {/* Cloze Distribution Stats */}
          {(clozeStats.entries.length > 0 || clozeStats.missingIds.length > 0) && (
            <div className="hidden lg:flex items-center gap-1 mr-2 text-xs">
              {/* Warning for missing IDs */}
              {clozeStats.missingIds.length > 0 && (
                <div className="tooltip tooltip-bottom tooltip-warning" data-tip="Some cloze IDs are missing. If you deleted a cloze by accident, its review card may also be gone.">
                  <span className="badge badge-warning badge-outline badge-xs gap-1 font-mono mr-1">
                    ⚠ Missing: {clozeStats.missingIds.map(id => `c${id}`).join(', ')}
                  </span>
                </div>
              )}

              {/* Interactive Cloze Chips */}
              {clozeStats.entries.map(({ id, count }) => {
                const isHighCount = count > 5;
                return (
                  <button
                    key={id}
                    onClick={() => scrollToCloze(id)}
                    className={`badge badge-xs gap-1 font-mono cursor-pointer hover:scale-105 transition-transform active:scale-95 ${
                      isHighCount 
                        ? 'badge-warning text-warning-content' 
                        : 'badge-ghost hover:badge-neutral'
                    }`}
                    title={isHighCount 
                      ? `High count! ${count} occurrences share ONE review card. Consider splitting.` 
                      : `Jump to c${id} (${count} occurrences, 1 review card)`
                    }
                  >
                    c{id}
                    {count > 1 && <span className="opacity-70">×{count}</span>}
                  </button>
                );
              })}
            </div>
          )}

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
                title={targetClozeId ? `Add to card c${targetClozeId} (reuse same card, Ctrl+Shift+B)` : "Same Cloze ID: place cursor after an existing cloze to reuse its card"}
              >
                <Copy size={16} />
                {targetClozeId && <span className="text-[10px] font-mono opacity-60">c{targetClozeId}</span>}
              </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className={`btn btn-sm gap-2 ${isDirty ? 'btn-primary' : 'btn-ghost'}`}
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            {isSaving ? <span className="loading loading-spinner loading-xs"></span> : <Save size={16} />}
            {isSaving ? 'Syncing...' : isDirty ? 'Save & Sync' : 'Saved'}
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
            onChange={(e) => {
                setContent(e.target.value);
                updateTargetClozeId();
            }}
            onClick={updateTargetClozeId}
            onSelect={updateTargetClozeId}
            placeholder="Start typing..."
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                insertCloze(false);
              }
              // Shift+Ctrl+B for same ID cloze
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
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

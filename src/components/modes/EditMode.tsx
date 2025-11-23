import { useAppStore } from '../../store/appStore';
import { isTauri } from '../../lib/tauri';
import { useState, useRef, useEffect, useMemo } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Heading2, Quote, Copy, Eraser, RefreshCw, AlertTriangle, Wand2, Trash2, X, ExternalLink } from 'lucide-react';
import { fileSystem } from '../../lib/services/fileSystem';
import { useToastStore } from '../../store/toastStore';
import { ClozeUtils } from '../../lib/markdown/clozeUtils';
import { parseNote } from '../../lib/markdown/parser';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { createPortal } from 'react-dom';

export const EditMode = () => {
  const { currentNote, currentFilepath, loadNote, dataService, currentClozeIndex, updateLastSync, currentVault } = useAppStore();
  const addToast = useToastStore((state) => state.addToast);
  const [content, setContent] = useState(currentNote?.raw || '');
  const [isSaving, setIsSaving] = useState(false);
  const [targetClozeId, setTargetClozeId] = useState<number | null>(null);
  
  // State for Floating Menu in Preview
  const [activePreviewCloze, setActivePreviewCloze] = useState<{
      id: number;
      index: number;
      rect: DOMRect;
  } | null>(null);

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

    // Check for unclosed clozes (raw regex check on content)
    const unclosed = ClozeUtils.findUnclosedClozes(content);

    return { total, unique: entries.length, entries, missingIds, unclosed };
  }, [parsedPreview, content]);

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

    // 1. Scroll Editor & Select (select the opening tag for quick orientation)
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
      
      // Highlight only the target element with a short pulse
      previewElements.forEach((el) => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      });
      void targetEl.offsetWidth; // Force reflow
      targetEl.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      
      setTimeout(() => {
        targetEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 1200);
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

  // Close floating menu when content changes
  useEffect(() => {
      setActivePreviewCloze(null);
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

  const replaceTextRange = (newText: string, start: number, end: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(start, end);
      
      const success = document.execCommand('insertText', false, newText);
      
      // Fallback if execCommand fails
      if (!success) {
          const val = textarea.value;
          const combined = val.substring(0, start) + newText + val.substring(end);
          setContent(combined);
      }
      // If success, onChange will handle setContent
  };

  const replaceAllText = (newText: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const savedStart = textarea.selectionStart;
      const savedScroll = textarea.scrollTop;

      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('insertText', false, newText);
      
      if (!success) {
          setContent(newText);
      }

      // Restore cursor and scroll best effort
      // Note: indices might have shifted if ID lengths changed, but keeping relative pos is better than end
      try {
          textarea.setSelectionRange(savedStart, savedStart);
          textarea.scrollTop = savedScroll;
      } catch (e) {
          // Ignore range errors
      }
  };

  const handleClearCloze = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const full = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const hasSelection = start !== end;

      if (hasSelection) {
          // 只在选区子串上清除挖空，避免对整篇文本做不必要的重写
          const selected = full.substring(start, end);
          const result = ClozeUtils.removeClozesInRange(selected, 0, selected.length);
          if (result.removedCount > 0) {
              replaceTextRange(result.text, start, end);
              addToast(`Cleared ${result.removedCount} clozes`, 'success');
          } else {
              addToast('No clozes in selection', 'info');
          }
      } else {
          // 单点清除：基于全文字符串做一次变换
          const unclozeRes = ClozeUtils.unclozeAt(full, start);
          if (unclozeRes.changed) {
              replaceAllText(unclozeRes.text);
              if (unclozeRes.range) {
                 // 将光标放到还原文本末尾，便于继续编辑
                 setTimeout(() => {
                     const current = textareaRef.current;
                     if (!current) return;
                     current.setSelectionRange(unclozeRes.range!.end, unclozeRes.range!.end);
                 }, 0);
              }
          } else {
             addToast('No cloze at cursor', 'info');
          }
      }
  };

  const handleNormalizeIds = () => {
      if (!confirm('This will renumber all clozes sequentially (c1, c2, c3...) to fix gaps and ordering.\n\nThis may change card scheduling if IDs shift.\n\nContinue?')) {
          return;
      }
      // Use textarea.value to ensure we have latest without race conditions
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { text, changed } = ClozeUtils.normalizeClozeIds(textarea.value);
      if (changed) {
          const savedStart = textarea.selectionStart;
          const savedScroll = textarea.scrollTop;

          // Directly update React state instead of using replaceAllText/execCommand
          setContent(text);

          setTimeout(() => {
              const current = textareaRef.current;
              if (!current) return;
              try {
                  current.setSelectionRange(savedStart, savedStart);
                  current.scrollTop = savedScroll;
              } catch {
                  // Ignore range errors
              }
          }, 0);

          addToast('Cloze IDs normalized', 'success');
      } else {
          addToast('IDs are already normalized', 'info');
      }
  };

  const handleCleanInvalid = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { text, cleanedCount } = ClozeUtils.cleanInvalidClozes(textarea.value);
      if (cleanedCount > 0) {
          if (confirm(`Found ${cleanedCount} broken/invalid cloze patterns (e.g. missing colons).\n\nRemove their formatting (keep text)?`)) {
              const savedStart = textarea.selectionStart;
              const savedScroll = textarea.scrollTop;

              setContent(text);

              setTimeout(() => {
                  const current = textareaRef.current;
                  if (!current) return;
                  try {
                      current.setSelectionRange(savedStart, savedStart);
                      current.scrollTop = savedScroll;
                  } catch {
                      // Ignore range errors
                  }
              }, 0);

              addToast(`Cleaned ${cleanedCount} invalid clozes`, 'success');
          }
      } else {
          addToast('No invalid clozes found', 'info');
      }
  };

  const handleDeleteCloze = () => {
      if (!activePreviewCloze) return;
      
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { id, index } = activePreviewCloze;
      const full = textarea.value;

      const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, index);
      if (!info) return;

      const { matchStart, matchEnd } = info;

      // Delete the entire cloze segment, including answer and hint
      replaceTextRange('', matchStart, matchEnd);
      setActivePreviewCloze(null);
      addToast('Deleted cloze and text', 'info');
  };

  const handleClearPreviewCloze = () => {
      if (!activePreviewCloze) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { id, index } = activePreviewCloze;
      const full = textarea.value;

      const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, index);
      if (!info) return;

      const { matchStart, matchEnd, answerText } = info;

      // Replace the cloze wrapper with just the answer text
      replaceTextRange(answerText, matchStart, matchEnd);
      setActivePreviewCloze(null);
      addToast('Cloze cleared (text kept)', 'success');
  };

  const handleJumpToUnclosed = () => {
      const unclosed = clozeStats.unclosed;
      if (unclosed.length === 0) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      const currentPos = textarea.selectionStart;

      // Find the first unclosed cloze that comes after the current cursor
      let target = unclosed.find((u) => u.index > currentPos);

      // If none found, wrap around to the first unclosed
      if (!target) {
          target = unclosed[0];
      }

      textarea.focus();
      textarea.setSelectionRange(target.index, target.index + 2); // Select the {{

      // Scroll to center
      const val = textarea.value;
      const textBefore = val.substring(0, target.index);
      const lines = textBefore.split('\n').length;
      const lineHeight = 24;
      const targetTop = (lines - 1) * lineHeight;
      textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
  };

  const handlePreviewClozeClick = (id: number, occurrenceIndex: number, target: HTMLElement) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Update floating menu position
    if (target) {
        setActivePreviewCloze({
            id,
            index: occurrenceIndex,
            rect: target.getBoundingClientRect()
        });
    }

    const full = textarea.value;
    const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, occurrenceIndex);

    if (info) {
        const { answerStart, answerEnd } = info;

        textarea.focus();
        textarea.setSelectionRange(answerStart, answerEnd);

        // Scroll to center based on answer start
        const textBefore = full.substring(0, answerStart);
        const lines = textBefore.split('\n').length;
        const lineHeight = 24;
        const targetTop = (lines - 1) * lineHeight;
        textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
        return;
    }

    // Fallback: previous behavior if we failed to locate the cloze instance
    const indices = ClozeUtils.findClozeIndices(full, id);
    if (occurrenceIndex >= indices.length) return;

    const start = indices[occurrenceIndex];
    const tail = full.substring(start);
    const localRegex = new RegExp(ClozeUtils.CLOZE_REGEX.source);
    const match = localRegex.exec(tail);
    
    let length = `{{c${id}::`.length;
    if (match && match.index === 0) {
        length = match[0].length;
    }

    textarea.focus();
    textarea.setSelectionRange(start, start + length);
    
    const textBefore = full.substring(0, start);
    const lines = textBefore.split('\n').length;
    const lineHeight = 24;
    const targetTop = (lines - 1) * lineHeight;
    textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
  };

  return (
    <div className="h-full flex flex-col bg-base-100 relative">
      {/* Floating Menu Portal */}
      {activePreviewCloze && createPortal(
          <div 
            className="fixed z-50 flex flex-col gap-1 bg-base-100 shadow-lg border border-base-300 rounded-lg p-1 animate-in fade-in zoom-in-95 duration-100"
            style={{
                left: activePreviewCloze.rect.left,
                top: activePreviewCloze.rect.bottom + 8,
            }}
            onMouseLeave={() => setActivePreviewCloze(null)}
          >
            <div className="flex items-center gap-1 px-2 py-1 border-b border-base-200 bg-base-200/50 rounded-t mb-1">
                <span className="text-[10px] font-mono font-bold opacity-50">c{activePreviewCloze.id}</span>
                <div className="flex-1" />
                <button onClick={() => setActivePreviewCloze(null)} className="btn btn-ghost btn-xs btn-square h-4 w-4 min-h-0">
                    <X size={10} />
                </button>
            </div>
            
            <div className="flex flex-col gap-1">
                <button 
                    className="btn btn-xs btn-ghost justify-start gap-2 h-8 font-normal"
                    onClick={handleClearPreviewCloze}
                >
                    <Eraser size={14} className="text-secondary" />
                    Clear Cloze
                </button>
                <button 
                    className="btn btn-xs btn-ghost justify-start gap-2 h-8 font-normal text-error hover:bg-error/10"
                    onClick={handleDeleteCloze}
                >
                    <Trash2 size={14} />
                    Delete All
                </button>
                <div className="divider my-0 h-0" />
                <button 
                    className="btn btn-xs btn-ghost justify-start gap-2 h-8 font-normal"
                    onClick={() => {
                        // Already selected by the click, just close menu
                        setActivePreviewCloze(null);
                        // Focus editor
                        textareaRef.current?.focus();
                    }}
                >
                    <ExternalLink size={14} className="opacity-50" />
                    Edit Text
                </button>
            </div>
          </div>,
          document.body
      )}

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
          {(clozeStats.entries.length > 0 || clozeStats.missingIds.length > 0 || clozeStats.unclosed.length > 0) && (
            <div className="hidden lg:flex items-center gap-1 mr-2 text-xs">
              {/* Unclosed Warning */}
              {clozeStats.unclosed.length > 0 && (
                <button 
                    onClick={handleJumpToUnclosed}
                    className="badge badge-error badge-outline badge-xs gap-1 font-mono mr-1 cursor-pointer hover:bg-error hover:text-error-content"
                    title="Jump to unclosed cloze (missing '}}')"
                >
                    <AlertTriangle size={10} />
                    Unclosed: {clozeStats.unclosed.length}
                </button>
              )}

              {/* Warning for missing IDs / Normalize */}
              {(clozeStats.missingIds.length > 0) && (
                <div className="flex items-center">
                    <div className="tooltip tooltip-bottom tooltip-warning" data-tip="Some cloze IDs are missing.">
                    <span className="badge badge-warning badge-outline badge-xs gap-1 font-mono mr-1">
                        ⚠ Missing: {clozeStats.missingIds.map(id => `c${id}`).join(', ')}
                    </span>
                    </div>
                    <button 
                        onClick={handleNormalizeIds}
                        className="btn btn-xs btn-ghost text-warning px-1 h-5 min-h-0"
                        title="Normalize IDs (renumber c1..cN to fix gaps)"
                    >
                        <RefreshCw size={12} />
                    </button>
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
              <button
                className="btn btn-sm join-item btn-ghost text-secondary/60"
                onClick={handleClearCloze}
                title="Clear Cloze (Ctrl+Shift+U) - Remove formatting, keep text"
              >
                <Eraser size={16} />
              </button>
          </div>

          {/* Maintenance Tools */}
          <div className="ml-2 border-l border-base-300 pl-2">
             <button
                className="btn btn-sm btn-ghost btn-square text-base-content/40 hover:text-primary"
                onClick={handleCleanInvalid}
                title="Clean invalid/broken clozes"
             >
                <Wand2 size={14} />
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
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u')) {
                e.preventDefault();
                handleClearCloze();
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
            onClozeClick={handlePreviewClozeClick}
          />
        </div>
      </div>
    </div>
  );
};

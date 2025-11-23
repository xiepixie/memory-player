import { MAX_CONTENT_CACHE_ENTRIES, useAppStore } from '../../store/appStore';
import { isTauri } from '../../lib/tauri';
import { useState, useRef, useEffect, useMemo } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Copy, Eraser, RefreshCw, AlertTriangle, Wand2, Trash2, X, Clipboard, Keyboard, ChevronRight, ChevronDown, Tag } from 'lucide-react';
import { fileSystem } from '../../lib/services/fileSystem';
import { useToastStore } from '../../store/toastStore';
import { ClozeUtils } from '../../lib/markdown/clozeUtils';
import { parseNote } from '../../lib/markdown/parser';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { createPortal } from 'react-dom';

import matter from 'gray-matter';

const MetadataEditor = ({ content, onChange }: { content: string; onChange: (newContent: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    // Use an array for visual tags
    const [tags, setTags] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState('');
    
    // Parse initial state from content
    useEffect(() => {
        try {
            const { data } = matter(content);
            const parsedTags = Array.isArray(data.tags) 
                ? data.tags 
                : (typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []);
            setTags(parsedTags);
        } catch (e) {
            // ignore parse errors
        }
    }, [content, isOpen]); // Sync when opening or content changes externally

    // Commit the current tag list to the actual markdown content
    const commitToContent = (newTags: string[]) => {
        try {
            const file = matter(content);
            // Preserve other frontmatter
            const newData = { ...file.data, tags: newTags };
            // Use stringify
            const newContent = matter.stringify(file.content, newData);
            onChange(newContent);
        } catch (e) {
            console.error('Failed to update tags', e);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = inputValue.trim();
            if (val) {
                if (!tags.includes(val)) {
                    const nextTags = [...tags, val];
                    setTags(nextTags);
                    commitToContent(nextTags);
                }
                setInputValue('');
            }
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            // Remove last tag on backspace if input is empty
            const nextTags = tags.slice(0, -1);
            setTags(nextTags);
            commitToContent(nextTags);
        }
    };

    const removeTag = (tagToRemove: string) => {
        const nextTags = tags.filter(t => t !== tagToRemove);
        setTags(nextTags);
        commitToContent(nextTags);
    };

    return (
        <div className="border-b border-base-200 bg-base-100/50 backdrop-blur-sm transition-all">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-80 transition-opacity select-none"
            >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Properties
            </button>
            
            {isOpen && (
                <div className="px-4 pb-3 pt-1 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 text-base-content/50 min-w-[80px] h-7">
                            <Tag size={14} />
                            <span className="text-xs font-medium">Tags</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-wrap gap-1.5 min-h-[2rem] p-1 rounded-md bg-base-200/30 border border-base-200/50 focus-within:bg-base-100 focus-within:border-primary/30 transition-all">
                                {tags.map(tag => (
                                    <span key={tag} className="badge badge-sm badge-primary gap-1 pr-1 h-6 animate-in fade-in zoom-in duration-200">
                                        {tag}
                                        <button 
                                            onClick={() => removeTag(tag)}
                                            className="btn btn-ghost btn-xs btn-circle w-4 h-4 min-h-0 text-primary-content/50 hover:text-white"
                                        >
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    onBlur={() => {
                                        if (inputValue.trim()) {
                                            // Commit lingering text on blur
                                            const val = inputValue.trim();
                                            if (!tags.includes(val)) {
                                                const nextTags = [...tags, val];
                                                setTags(nextTags);
                                                commitToContent(nextTags);
                                            }
                                            setInputValue('');
                                        }
                                    }}
                                    className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-xs px-1 h-6 placeholder:text-base-content/30"
                                    placeholder={tags.length === 0 ? "Add tags..." : ""}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const EditMode = () => {
  const { currentNote, currentFilepath, loadNote, dataService, updateLastSync, currentVault } = useAppStore();
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showFixIdsConfirm, setShowFixIdsConfirm] = useState(false);

  // Reset delete confirm when menu closes or changes
  useEffect(() => {
      setDeleteConfirm(false);
  }, [activePreviewCloze]);

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

    // Check for broken clozes (raw regex checks on content)
    const unclosed = ClozeUtils.findUnclosedClozes(content);
    const malformed = ClozeUtils.findMalformedClozes(content);
    const dangling = ClozeUtils.findDanglingClosers(content);

    return { total, unique: entries.length, entries, missingIds, unclosed, malformed, dangling };
  }, [parsedPreview, content]);

  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const highlightedPreviewElementsRef = useRef<HTMLElement[]>([]);
  const MAX_HIGHLIGHT_RETRIES = 5;
  const HIGHLIGHT_RETRY_DELAY = 120;

  const clearCurrentPreviewHighlight = () => {
    if (highlightedPreviewElementsRef.current.length > 0) {
        highlightedPreviewElementsRef.current.forEach((el) => {
            el.classList.remove('cloze-target-highlight');
        });
        highlightedPreviewElementsRef.current = [];
    }
    if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
    }
  };

  const flashPreviewCloze = (id: number, attempt = 0) => {
    const elements = Array.from(document.querySelectorAll(`[data-cloze-id="${id}"]`) as NodeListOf<HTMLElement>);

    if (elements.length === 0) {
        if (attempt >= MAX_HIGHLIGHT_RETRIES) return;

        if (attempt === 0) {
            requestAnimationFrame(() => flashPreviewCloze(id, attempt + 1));
        } else {
            setTimeout(() => flashPreviewCloze(id, attempt + 1), HIGHLIGHT_RETRY_DELAY);
        }
        return;
    }

    clearCurrentPreviewHighlight();

    elements.forEach((el) => {
        el.classList.remove('cloze-target-highlight');
        void el.offsetWidth;
        el.classList.add('cloze-target-highlight');
    });

    highlightedPreviewElementsRef.current = elements;

    highlightTimerRef.current = setTimeout(() => {
        clearCurrentPreviewHighlight();
    }, 2000); // Match animation duration roughly (longer is fine, class handles it)
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to calculate exact pixel offset of a character index in the textarea
  // This is necessary because simple line counting (split \n) fails when lines wrap.
  const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
    const div = document.createElement('div');
    const style = getComputedStyle(element);
    
    // Copy styling
    const properties = [
      'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
      'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
      'tabSize', 'MozTabSize'
    ];

    properties.forEach(prop => {
        div.style[prop as any] = style.getPropertyValue(prop) || style[prop as any];
    });

    div.style.position = 'absolute';
    div.style.top = '0px';
    div.style.left = '0px';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word'; // Important for textarea wrapping behavior

    // Content up to the cursor
    div.textContent = element.value.substring(0, position);
    
    // Add a span to mark the end position
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.'; // Ensure span has height
    div.appendChild(span);

    document.body.appendChild(div);
    const top = span.offsetTop + parseInt(style.borderTopWidth);
    document.body.removeChild(div);
    
    return top;
  };

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
    
    // Accurate Scroll Position Logic
    const targetTop = getCaretCoordinates(textarea, targetPos);
    const clientHeight = textarea.clientHeight;
    // Position at 30% from top for better context visibility
    textarea.scrollTop = Math.max(0, targetTop - clientHeight * 0.3);

    // 2. Scroll Preview (Sync with the specific instance index)
    const previewElements = document.querySelectorAll(`[data-cloze-id="${id}"]`) as NodeListOf<HTMLElement>;
    const targetEl = previewElements[targetIndex];
    
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Highlight ALL occurrences of this cloze ID temporarily
    flashPreviewCloze(id);
    setTargetClozeId(id);
  };
  
  const jumpToSiblingCloze = (direction: 'next' | 'prev') => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const full = textarea.value;
      const currentPos = textarea.selectionStart;
      const regex = /{{c(\d+)::/g;
      const indices: { pos: number, id: number }[] = [];
      let match;
      
      while ((match = regex.exec(full)) !== null) {
          indices.push({ pos: match.index, id: parseInt(match[1], 10) });
      }
      
      if (indices.length === 0) return;
      
      let targetIndex = -1;
      
      if (direction === 'next') {
          // Find first index > currentPos
          targetIndex = indices.findIndex(item => item.pos > currentPos);
          if (targetIndex === -1) targetIndex = 0; // Wrap to start
      } else {
          // Find last index < currentPos
          const prevIndices = indices.map((item, idx) => ({...item, idx})).filter(item => item.pos < currentPos);
          if (prevIndices.length > 0) {
              targetIndex = prevIndices[prevIndices.length - 1].idx;
          } else {
              targetIndex = indices.length - 1; // Wrap to end
          }
      }
      
      const target = indices[targetIndex];
      // Manual jump logic to ensure precise positioning
      const pattern = `{{c${target.id}::`;
      textarea.focus();
      textarea.setSelectionRange(target.pos, target.pos + pattern.length);
      
      // Scroll Editor - Middle-Top Alignment (30%)
      const targetTop = getCaretCoordinates(textarea, target.pos);
      // Position at 30% from top for better context visibility
      textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight * 0.3);
      
      // Scroll Preview
      let instanceIndex = 0;
      for(let i=0; i<targetIndex; i++) {
          if (indices[i].id === target.id) instanceIndex++;
      }
      
      const previewElements = document.querySelectorAll(`[data-cloze-id="${target.id}"]`) as NodeListOf<HTMLElement>;
      const targetEl = previewElements[instanceIndex];
      
      if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      flashPreviewCloze(target.id);
      setTargetClozeId(target.id);
  };

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
      if (!isTauri()) {
        addToast('Saving is only available in desktop app', 'warning');
        return;
      }

      // Remember our own save to avoid reacting to the resulting file watcher event
      lastSelfSaveAtRef.current = Date.now();

      // 1. Save to local filesystem
      await fileSystem.writeNote(currentFilepath, content);

      // 2. Update in-memory cache (with size cap) and parsed note so UI is instantly fresh
      useAppStore.setState((state) => {
        const existing = { ...state.contentCache };
        delete existing[currentFilepath];
        const next = { ...existing, [currentFilepath]: content };
        const keys = Object.keys(next);
        if (keys.length > MAX_CONTENT_CACHE_ENTRIES) {
          const overflow = keys.length - MAX_CONTENT_CACHE_ENTRIES;
          for (let i = 0; i < overflow; i++) {
            delete next[keys[i]];
          }
        }
        return {
          contentCache: next,
          currentNote: parseNote(content),
        };
      });
      
      // OPTIMISTIC UI UPDATE: Finish "saving" state immediately
      setIsSaving(false);
      addToast('Saved locally', 'success');

      // 3. Best-effort cloud sync (Background)
      const noteId = useAppStore.getState().pathMap[currentFilepath];
      if (noteId && dataService) {
        // Fire-and-forget sync + metadata refresh
        dataService.syncNote(currentFilepath, content, noteId, currentVault?.id)
            .then(() => {
                updateLastSync();
                useAppStore.getState().markNoteSynced(currentFilepath);
                // Refresh metadata (like due dates) without reloading content to avoid overwriting editor
                useAppStore.getState().refreshMetadata(currentFilepath);
            })
            .catch((syncError) => {
                console.error('[EditMode] Cloud sync failed', syncError);
                useAppStore.getState().markNoteSyncPending(currentFilepath);
                addToast('Cloud sync failed (saved locally)', 'warning');
            });
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to save note', 'error');
      setIsSaving(false); // Ensure we stop spinner on error
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

  const computeSameIdTarget = (full: string, cursorIndex: number): number | null => {
      const prevId = ClozeUtils.findPrecedingClozeId(full, cursorIndex);
      if (prevId !== null) {
          return prevId;
      }
      const maxId = ClozeUtils.getMaxClozeNumber(full);
      if (maxId > 0) {
          return maxId;
      }
      return null;
  };

  const updateTargetClozeId = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const full = textarea.value;
      const id = computeSameIdTarget(full, textarea.selectionStart);
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
          const sameIdTarget = computeSameIdTarget(full, textarea.selectionStart);
          if (sameIdTarget !== null) {
              targetId = sameIdTarget;
          } else {
              targetId = Math.max(maxId + 1, 1);
          }
      } else {
          targetId = Math.max(maxId + 1, 1);
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

      setTargetClozeId(targetId);

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
      setShowFixIdsConfirm(true);
  };

  const confirmNormalizeIds = () => {
      setShowFixIdsConfirm(false);
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
      
      if (!deleteConfirm) {
          setDeleteConfirm(true);
          return;
      }

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

  const handleCopyClozeAnswer = () => {
      if (!activePreviewCloze) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { id, index } = activePreviewCloze;
      const full = textarea.value;
      const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, index);
      
      if (info) {
          navigator.clipboard.writeText(info.answerText);
          addToast('Answer text copied', 'success');
          setActivePreviewCloze(null);
      }
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
      const val = textarea.value;
      let end = target.index + 2;
      if (typeof (target as any).id === 'number') {
          const id = (target as any).id as number;
          const prefix = `{{c${id}::`;
          if (val.substring(target.index, target.index + prefix.length) === prefix) {
              end = target.index + prefix.length;
          }
      }
      textarea.setSelectionRange(target.index, end); // Select the {{

      // Scroll to center
      const textBefore = val.substring(0, target.index);
      const lines = textBefore.split('\n').length;
      const lineHeight = 24;
      const targetTop = (lines - 1) * lineHeight;
      textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
  };

  const handlePreviewErrorClick = (
      kind: 'unclosed' | 'malformed' | 'dangling',
      occurrenceIndex: number,
      _target?: HTMLElement,
  ) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const list = kind === 'unclosed'
          ? clozeStats.unclosed as { index: number }[]
          : kind === 'malformed'
              ? (clozeStats as any).malformed as { index: number; raw?: string }[] | undefined
              : (clozeStats as any).dangling as { index: number }[] | undefined;

      if (!list || list.length === 0) return;

      // Guard against out-of-range indices by wrapping around
      const safeIndex = ((occurrenceIndex % list.length) + list.length) % list.length;
      const entry = list[safeIndex];

      const val = textarea.value;
      const start = entry.index;
      let end: number;

      if (kind === 'malformed' && (entry as any).raw) {
          end = start + (entry as any).raw.length;
      } else if (kind === 'dangling') {
          end = start + 2; // Select the stray '}}'
      } else {
          let tentativeEnd = start + 2; // default: just the '{{'
          const id = (entry as any).id as number | undefined;
          if (typeof id === 'number') {
              const prefix = `{{c${id}::`;
              if (val.substring(start, start + prefix.length) === prefix) {
                  tentativeEnd = start + prefix.length;
              }
          }
          end = tentativeEnd;
      }

      textarea.focus();
      textarea.setSelectionRange(start, end);

      // Scroll to center
      const textBefore = val.substring(0, start);
      const lines = textBefore.split('\n').length;
      const lineHeight = 24;
      const targetTop = (lines - 1) * lineHeight;
      textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 2);
  };

  const handlePreviewClozeContextMenu = (id: number, occurrenceIndex: number, target: HTMLElement, _event: React.MouseEvent) => {
      // Trigger Menu on Right Click
      if (target) {
        const rect = target.getBoundingClientRect();
        setActivePreviewCloze({
            id,
            index: occurrenceIndex,
            rect
        });
      }
      setTargetClozeId(id);
  };

  const handlePreviewClozeClick = (id: number, occurrenceIndex: number, _target: HTMLElement) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Left Click: JUST Jump & Highlight (No Menu)
    setTargetClozeId(id);

    const full = textarea.value;
    const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, occurrenceIndex);

    if (info) {
        const { answerStart, answerEnd } = info;

        textarea.focus();
        textarea.setSelectionRange(answerStart, answerEnd);

        // Scroll to center based on answer start (30% from top)
        const targetTop = getCaretCoordinates(textarea, answerStart);
        textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight * 0.3);

        flashPreviewCloze(id);
        return;
    }

    // Fallback: previous behavior if we failed to locate the cloze instance
    const indices = ClozeUtils.findClozeIndices(full, id);
    if (indices.length === 0) return;

    // Guard against out-of-range occurrenceIndex by wrapping
    const safeIndex = ((occurrenceIndex % indices.length) + indices.length) % indices.length;
    const start = indices[safeIndex];
    const tail = full.substring(start);
    const localRegex = new RegExp(ClozeUtils.CLOZE_REGEX.source);
    const match = localRegex.exec(tail);
    
    let length = `{{c${id}::`.length;
    if (match && match.index === 0) {
        length = match[0].length;
    }

    textarea.focus();
    textarea.setSelectionRange(start, start + length);
    
    const targetTop = getCaretCoordinates(textarea, start);
    textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight * 0.3);

    flashPreviewCloze(id);
  };

  return (
    <div className="h-full flex flex-col bg-base-100 relative">
      {/* Floating Menu Portal */}
      {activePreviewCloze && createPortal(
          <div 
            className="fixed z-50 flex flex-col gap-1 bg-base-100 shadow-xl border border-base-300 rounded-lg p-1.5 animate-in fade-in zoom-in-95 duration-100 min-w-[140px]"
            style={{
                left: activePreviewCloze.rect.left,
                top: activePreviewCloze.rect.bottom + 8,
            }}
            onMouseLeave={() => setActivePreviewCloze(null)}
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-base-200 bg-base-200/30 rounded-t -mx-1.5 -mt-1.5 mb-1">
                <span className="text-xs font-mono font-bold opacity-70">Cloze #{activePreviewCloze.id}</span>
                <button onClick={() => setActivePreviewCloze(null)} className="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 opacity-50 hover:opacity-100">
                    <X size={12} />
                </button>
            </div>
            
            <div className="flex flex-col gap-0.5">
                <button 
                    className="btn btn-xs btn-ghost justify-start gap-2 h-7 font-normal text-base-content/80"
                    onClick={handleCopyClozeAnswer}
                >
                    <Clipboard size={13} />
                    Copy Text
                </button>
                <div className="divider my-0.5 h-px bg-base-200" />
                <button 
                    className="btn btn-xs btn-ghost justify-start gap-2 h-7 font-normal text-warning"
                    onClick={handleClearPreviewCloze}
                    title="Keep text, remove formatting"
                >
                    <Eraser size={13} />
                    Uncloze
                </button>
                <button 
                    className={`btn btn-xs justify-start gap-2 h-7 font-normal transition-all ${deleteConfirm ? 'btn-error text-white' : 'btn-ghost text-error hover:bg-error/10'}`}
                    onClick={handleDeleteCloze}
                >
                    <Trash2 size={13} />
                    {deleteConfirm ? 'Confirm Delete?' : 'Delete All'}
                </button>
            </div>
          </div>,
          document.body
      )}

      {/* Fix IDs Confirmation Modal */}
      {showFixIdsConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowFixIdsConfirm(false)}>
            <div className="bg-base-100 p-6 rounded-xl shadow-2xl max-w-sm w-full border border-base-200 animate-in fade-in zoom-in-95 duration-100" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-2 text-warning flex items-center gap-2">
                    <AlertTriangle size={20} />
                    Normalize Cloze IDs?
                </h3>
                <p className="text-sm text-base-content/80 mb-4 leading-relaxed">
                    This will renumber all clozes sequentially (c1, c2, c3...) to fix gaps.
                    <br/><br/>
                    <strong className="text-error">Warning:</strong> This may shift IDs and affect card scheduling history in Anki if synced.
                </p>
                <div className="flex justify-end gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowFixIdsConfirm(false)}>Cancel</button>
                    <button className="btn btn-sm btn-warning" onClick={confirmNormalizeIds}>Confirm Fix</button>
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcuts && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
            <div className="bg-base-100 p-6 rounded-xl shadow-2xl max-w-sm w-full border border-base-200 animate-in fade-in zoom-in-95 duration-100" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-base-content">
                <Keyboard size={20} /> 
                Shortcuts
            </h3>
            <div className="space-y-2">
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Bold / Italic</span> <div className="flex gap-1"><kbd className="kbd kbd-sm">Ctrl+B</kbd><kbd className="kbd kbd-sm">I</kbd></div></div>
                <div className="divider my-1 h-px bg-base-200"></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">New Cloze</span> <kbd className="kbd kbd-sm">Ctrl+Shift+C</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Same ID</span> <kbd className="kbd kbd-sm">Ctrl+Alt+C</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Uncloze</span> <kbd className="kbd kbd-sm">Ctrl+Shift+X</kbd></div>
                <div className="divider my-1 h-px bg-base-200"></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Navigation</span> <div className="flex gap-1"><kbd className="kbd kbd-sm">Alt+↑</kbd><kbd className="kbd kbd-sm">↓</kbd></div></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Save</span> <kbd className="kbd kbd-sm">Ctrl+S</kbd></div>
            </div>
            <div className="mt-6 flex justify-end">
                <button className="btn btn-sm" onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
            </div>
        </div>,
        document.body
      )}

      {/* Compact Glassy Toolbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 backdrop-blur-md bg-base-100/80 border-b border-base-200/50 transition-all gap-4">
          
          {/* Left: Status & Stats & Critical Actions */}
          <div className="flex items-center gap-3">
            {/* Status Badge (Pulse Dot) */}
            <div className={`flex items-center gap-1.5 text-xs font-medium ${isDirty ? 'text-warning' : 'text-base-content/50'}`} title={isDirty ? 'Unsaved Changes' : 'All Saved'}>
                <div className={`w-2 h-2 rounded-full ${isDirty ? 'bg-warning animate-pulse shadow-[0_0_8px_rgba(250,189,0,0.5)]' : 'bg-base-content/20'}`} />
            </div>

            <div className="h-3 w-px bg-base-content/10" />

            {/* Stats */}
            <div className="flex items-center gap-1 text-[10px] font-mono text-base-content/40 select-none">
                <span className="font-bold text-base-content/70">{clozeStats.total}</span>
                <span>items</span>
            </div>

             {/* Critical Actions (Conditional) */}
            {(clozeStats.unclosed.length > 0 || clozeStats.missingIds.length > 0) && (
                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                     {clozeStats.unclosed.length > 0 && (
                        <button 
                            onClick={handleJumpToUnclosed}
                            className="btn btn-xs btn-error btn-outline h-6 min-h-0 px-1.5 gap-1 font-mono"
                        >
                            <AlertTriangle size={10} />
                            {clozeStats.unclosed.length}
                        </button>
                    )}
                    {clozeStats.missingIds.length > 0 && (
                        <button 
                            onClick={handleNormalizeIds}
                            className="btn btn-xs btn-warning btn-outline h-6 min-h-0 px-1.5 gap-1 font-mono"
                            title="Fix Missing IDs"
                        >
                            <RefreshCw size={10} />
                            Fix
                        </button>
                    )}
                </div>
            )}
          </div>

          {/* Center: Tools (Collapsed Group) */}
          <div className="flex items-center gap-1.5 absolute left-1/2 -translate-x-1/2">
              
              {/* Formatting */}
              <div className="join bg-base-200/50 p-0.5 rounded-lg border border-base-content/5">
                <button className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-base-100" onClick={() => insertText('**', '**')} title="Bold (Ctrl+B)">
                    <Bold size={12} />
                </button>
                <button className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-base-100" onClick={() => insertText('*', '*')} title="Italic (Ctrl+I)">
                    <Italic size={12} />
                </button>
                <button className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-base-100" onClick={() => insertText('# ')} title="Heading 1">
                    <Heading1 size={12} />
                </button>
                <button className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-base-100" onClick={() => insertText('- ')} title="List">
                    <List size={12} />
                </button>
              </div>

              {/* Cloze Operations */}
              <div className="join bg-primary/5 p-0.5 rounded-lg border border-primary/10">
                  <button
                    className="btn btn-xs btn-ghost join-item h-6 px-2 min-h-0 hover:bg-primary/10 text-primary font-medium gap-1"
                    onClick={() => insertCloze(false)}
                    title="New Cloze (Ctrl+Shift+C)"
                  >
                    <Type size={12} />
                    New
                  </button>
                  <button
                    className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-primary/10 text-primary/80"
                    onClick={() => insertCloze(true)}
                    title={`Add to same card (Ctrl+Alt+C) ${targetClozeId ? `[c${targetClozeId}]` : ''}`}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    className="btn btn-xs btn-ghost join-item h-6 w-7 min-h-0 p-0 hover:bg-error/10 text-base-content/40 hover:text-error"
                    onClick={handleClearCloze}
                    title="Uncloze (Ctrl+Shift+X)"
                  >
                    <Eraser size={12} />
                  </button>
              </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
              <button
                className="btn btn-xs btn-ghost btn-square h-7 w-7 min-h-0 text-base-content/40 hover:text-primary"
                onClick={handleCleanInvalid}
                title="Clean invalid clozes"
              >
                <Wand2 size={14} />
              </button>
              
               <button
                    className="btn btn-xs btn-ghost btn-square h-7 w-7 min-h-0 text-base-content/40 hover:text-primary"
                    onClick={() => setShowShortcuts(true)}
                    title="Keyboard Shortcuts"
                >
                    <Keyboard size={14} />
                </button>

               <div className="h-4 w-px bg-base-content/10 mx-1" />

               <button
                    className={`btn btn-xs h-7 px-3 min-h-0 gap-1.5 transition-all ${isDirty ? 'btn-primary shadow-md shadow-primary/20' : 'btn-ghost opacity-70'}`}
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                >
                    {isSaving ? <span className="loading loading-spinner loading-xs w-3 h-3"></span> : <Save size={13} />}
                    {isSaving ? 'Syncing' : 'Save'}
                </button>
          </div>
      </div>

      {/* Cloze Navigator (Timeline Style) */}
      {clozeStats.entries.length > 0 && (
         <div className="relative z-20 bg-base-100/80 backdrop-blur-md border-b border-base-200/50">
            <div className="flex items-center px-2 py-2 overflow-x-auto no-scrollbar gap-1 mask-linear-fade">
                <div className="flex items-center gap-1 pr-4">
                    {clozeStats.entries.map(({ id, count }) => {
                        const isMulti = count > 1;
                        const isTarget = targetClozeId === id;
                        return (
                        <button
                            key={id}
                            onClick={() => scrollToCloze(id)}
                            className={`
                                group relative flex items-center justify-center
                                h-6 min-w-[24px] px-1.5 rounded-md text-[10px] font-mono transition-all duration-200
                                ${isTarget 
                                    ? 'bg-primary text-primary-content font-bold shadow-sm scale-105' 
                                    : 'bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content hover:scale-105'}
                            `}
                            title={`Jump to c${id} (${count} occurrences)`}
                        >
                            <span className="z-10 flex items-center gap-0.5">
                                c{id}
                                {isMulti && (
                                    <span className={`ml-0.5 px-1 rounded-full text-[8px] ${
                                        isTarget 
                                            ? 'bg-primary-content/20 text-primary-content' 
                                            : 'bg-base-content/10 text-base-content/60'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </span>
                            {/* Active Indicator */}
                            {isTarget && (
                                <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_4px_var(--color-primary)]" />
                            )}
                        </button>
                        );
                    })}
                </div>
            </div>
         </div>
      )}

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Pane */}
        <div className="flex-1 flex flex-col min-w-[300px] border-r border-base-200 bg-base-100 relative group/editor">
             <MetadataEditor content={content} onChange={setContent} />
             
             {/* Pane Header - Removed as it is redundant with MetadataEditor header area */}
             {/* <div className="h-8 min-h-[2rem] border-b border-base-200 bg-base-100/50 flex items-center px-4 justify-between select-none">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Source</span>
             </div> */}
             
             <textarea
                ref={textareaRef}
                id="note-editor"
                name="noteEditor"
                className="flex-1 w-full h-full p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed bg-base-100 overflow-y-auto custom-scrollbar scroll-smooth"
                value={content}
                onChange={(e) => {
                    setContent(e.target.value);
                    updateTargetClozeId();
                }}
                onClick={updateTargetClozeId}
                onSelect={updateTargetClozeId}
                placeholder="Start typing..."
                spellCheck={false}
                onKeyUp={(e) => {
                if (
                    e.key === 'ArrowLeft' ||
                    e.key === 'ArrowRight' ||
                    e.key === 'ArrowUp' ||
                    e.key === 'ArrowDown' ||
                    e.key === 'Home' ||
                    e.key === 'End' ||
                    e.key === 'PageUp' ||
                    e.key === 'PageDown'
                ) {
                    updateTargetClozeId();
                }
                }}
                onKeyDown={(e) => {
                // Save: Ctrl+S
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSave();
                    return;
                }

                // Bold: Ctrl+B
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'b') {
                    e.preventDefault();
                    insertText('**', '**');
                    return;
                }

                // Italic: Ctrl+I
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'i') {
                    e.preventDefault();
                    insertText('*', '*');
                    return;
                }

                // New Cloze: Ctrl+Shift+C (Anki Standard)
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                    e.preventDefault();
                    insertCloze(false);
                    return;
                }
                
                // Same Cloze: Ctrl+Alt+C (Anki Standard-ish)
                if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'c' || e.key === 'C')) {
                    e.preventDefault();
                    insertCloze(true);
                    return;
                }

                // Uncloze: Ctrl+Shift+X (Clear Cloze)
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
                    e.preventDefault();
                    handleClearCloze();
                    return;
                }

                // Navigation: Alt+Up/Down
                if (e.altKey && e.key === 'ArrowDown') {
                    e.preventDefault();
                    jumpToSiblingCloze('next');
                    return;
                }
                if (e.altKey && e.key === 'ArrowUp') {
                    e.preventDefault();
                    jumpToSiblingCloze('prev');
                    return;
                }
                }}
            />
        </div>

        {/* Preview Pane */}
        <div className="flex-1 flex flex-col bg-base-200/30 relative group/preview">
           {/* Pane Header */}
           <div className="h-8 min-h-[2rem] border-b border-base-200 bg-base-100/50 flex items-center px-4 justify-between select-none backdrop-blur-sm z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Preview</span>
           </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar scroll-smooth">
            <MarkdownContent
                content={parsedPreview.renderableContent}
                className="text-base max-w-none"
                onClozeClick={handlePreviewClozeClick}
                onClozeContextMenu={handlePreviewClozeContextMenu}
                onErrorLinkClick={handlePreviewErrorClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

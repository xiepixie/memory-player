import { useAppStore } from '../../store/appStore';
import { isTauri } from '../../lib/tauri';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { Save, Type, Bold, Italic, List, Heading1, Copy, Eraser, RefreshCw, AlertTriangle, Wand2, Trash2, X, Clipboard, Keyboard, ChevronRight, ChevronDown, Tag } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { ClozeUtils } from '../../lib/markdown/clozeUtils';
import { parseNote, ParsedNote } from '../../lib/markdown/parser';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { createPortal } from 'react-dom';

import matter from 'gray-matter';
import React from 'react';

// === CodeMirror 6 ===
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { CodeMirrorEditor } from '../shared/CodeMirrorEditor';
import { useCodeMirrorActions } from '../../hooks/useCodeMirrorActions';
import { createClozeKeymap } from '../../lib/codemirror/keymaps';

// === PERFORMANCE: Memoized Navigator to prevent re-render on every targetClozeId change ===
interface ClozeNavigatorProps {
  entries: { id: number; count: number }[];
  targetClozeId: number | null;
  onScrollToCloze: (id: number) => void;
}

const ClozeNavigator = React.memo(({ entries, targetClozeId, onScrollToCloze }: ClozeNavigatorProps) => {
  if (entries.length === 0) return null;
  
  return (
    <div className="relative z-20 bg-base-100/80 backdrop-blur-md border-b border-base-200/50">
      <div className="flex items-center px-2 py-2 pr-6 overflow-x-auto no-scrollbar gap-1 mask-linear-fade">
        {entries.map(({ id, count }) => {
          const isMulti = count > 1;
          const isTarget = targetClozeId === id;
          return (
            <button
              key={id}
              onClick={() => onScrollToCloze(id)}
              className={`
                group relative flex items-center justify-center
                h-6 min-w-[24px] px-1.5 rounded-md text-[10px] font-mono transition-colors duration-200
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
  );
});
ClozeNavigator.displayName = 'ClozeNavigator';

const MetadataEditor = ({ content, onChange }: { content: string; onChange: (newContent: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    // Use an array for visual tags
    const [tags, setTags] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState('');
    
    // Parse initial state from content - only when panel is open to avoid wasted parsing
    useEffect(() => {
        if (!isOpen) return; // Skip parsing when collapsed
        try {
            const { data } = matter(content);
            const parsedTags = Array.isArray(data.tags) 
                ? data.tags 
                : (typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []);
            setTags(parsedTags);
        } catch (e) {
            // ignore parse errors
        }
    }, [content, isOpen]); // Sync when opening or content changes while open

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
            // Error handled silently - frontmatter update failed
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

export const EditMode = ({ active = true }: { active?: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  const currentFilepath = useAppStore((state) => state.currentFilepath);
  const loadNote = useAppStore((state) => state.loadNote);
  const saveCurrentNote = useAppStore((state) => state.saveCurrentNote);
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

  // === PERFORMANCE FIX: Avoid double parsing ===
  // Store already parsed the note in loadNote(), use it directly for initial render
  // Only re-parse locally when user edits (via debounced content)
  const [debouncedContent, setDebouncedContent] = useState(content);
  
  // CRITICAL: Use currentNote directly for initial render (already parsed by store)
  // This avoids blocking the main thread with a second parseNote() call
  const [parsedPreview, setParsedPreview] = useState<ParsedNote>(() => currentNote || parseNote(content));
  
  // Track if we're ready for interaction (initial setup complete)
  const [isReady, setIsReady] = useState(false);
  
  // Defer "ready" state to next frame to ensure UI is painted and responsive
  useEffect(() => {
    if (!active) return;
    // Use requestIdleCallback for non-blocking initialization
    const handle = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(() => setIsReady(true), { timeout: 100 })
      : setTimeout(() => setIsReady(true), 16);
    return () => {
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [active]);
  const isDirty = content !== (currentNote?.raw ?? '');
  const clozeStats = useMemo(() => {
    const clozes = parsedPreview?.clozes ?? [];
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
    // Use debounced content for expensive regex checks
    const unclosed = ClozeUtils.findUnclosedClozes(debouncedContent);
    const malformed = ClozeUtils.findMalformedClozes(debouncedContent);
    const dangling = ClozeUtils.findDanglingClosers(debouncedContent);

    return { total, unique: entries.length, entries, missingIds, unclosed, malformed, dangling, maxId };
  }, [parsedPreview, debouncedContent]);

  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const highlightedPreviewElementsRef = useRef<HTMLElement[]>([]);
  const MAX_HIGHLIGHT_RETRIES = 5;
  const HIGHLIGHT_RETRY_DELAY = 120;
  
  // === PERFORMANCE: Preview Pane Cache ===
  // DOM queries are expensive; cache the preview pane reference
  // React best practice: useRef for mutable values that don't trigger re-renders
  const previewPaneRef = useRef<Element | null>(null);
  const getPreviewPane = useCallback(() => {
    // Lazy initialization + stale check (element may be removed from DOM)
    if (!previewPaneRef.current || !previewPaneRef.current.isConnected) {
      previewPaneRef.current = document.querySelector('.group\\/preview .overflow-y-auto');
    }
    return previewPaneRef.current;
  }, []);
  
  // === PERFORMANCE: Cloze Index Cache ===
  // Build index once when content changes, not on every jump
  // This is the most impactful optimization for long documents
  const clozeIndexRef = useRef<{
    content: string;  // Cache key
    allClozes: { pos: number; id: number }[];
    byId: Map<number, number[]>;  // id -> positions array
  } | null>(null);
  
  const getClozeIndex = useCallback((text: string) => {
    // Return cached if content unchanged (O(1) vs O(n) regex scan)
    if (clozeIndexRef.current && clozeIndexRef.current.content === text) {
      return clozeIndexRef.current;
    }
    
    // Build index in single pass - O(n) but only once per content change
    const allClozes: { pos: number; id: number }[] = [];
    const byId = new Map<number, number[]>();
    const regex = /{{c(\d+)::/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const id = parseInt(match[1], 10);
      allClozes.push({ pos: match.index, id });
      
      // Group by ID for scrollToCloze cycling
      const positions = byId.get(id);
      if (positions) {
        positions.push(match.index);
      } else {
        byId.set(id, [match.index]);
      }
    }
    
    clozeIndexRef.current = { content: text, allClozes, byId };
    return clozeIndexRef.current;
  }, []);

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

  // PERFORMANCE: Use useCallback to create stable reference
  const flashPreviewCloze = useCallback((id: number, attempt = 0) => {
    const elements = Array.from(document.querySelectorAll(`[data-cloze-id="${id}"]`) as NodeListOf<HTMLElement>);

    if (elements.length === 0) {
        if (attempt >= MAX_HIGHLIGHT_RETRIES) return;
        // Use setTimeout for retries to avoid blocking
        setTimeout(() => flashPreviewCloze(id, attempt + 1), HIGHLIGHT_RETRY_DELAY);
        return;
    }

    clearCurrentPreviewHighlight();

    // PERFORMANCE: Batch classList changes in a single microtask to reduce style recalculations
    // Using queueMicrotask to defer until after current task completes
    queueMicrotask(() => {
        elements.forEach((el) => {
            el.classList.add('cloze-target-highlight');
        });
    });

    highlightedPreviewElementsRef.current = elements;

    highlightTimerRef.current = setTimeout(() => {
        clearCurrentPreviewHighlight();
    }, 1800);
  }, []);

  // === CodeMirror 6 Editor Ref ===
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const cmActions = useCodeMirrorActions(editorRef);
  

  // PERFORMANCE: Wrap in useCallback for ClozeNavigator memo optimization
  const scrollToCloze = useCallback((id: number) => {
    // === CodeMirror 6: Use cmActions for content/selection ===
    const val = cmActions.getContent();
    if (!val) return;
    
    const pattern = `{{c${id}::`;
    
    // PERFORMANCE: Use cached index instead of scanning on every jump
    const clozeIndex = getClozeIndex(val);
    const indices = clozeIndex.byId.get(id);
    
    if (!indices || indices.length === 0) return;

    // Cycle logic: Find the next occurrence after the current cursor
    const currentStart = cmActions.getSelection().from;
    let targetIndex = indices.findIndex(idx => idx > currentStart);
    if (targetIndex === -1) targetIndex = 0;

    const targetPos = indices[targetIndex];

    // Pre-read preview scroll info BEFORE RAF (avoid read-after-write)
    // PERFORMANCE: Use cached preview pane reference
    const previewPane = getPreviewPane();
    const previewElements = document.querySelectorAll(`[data-cloze-id="${id}"]`);
    const targetEl = previewElements[targetIndex] as HTMLElement | undefined;
    let previewScrollOffset: number | null = null;
    if (targetEl && previewPane) {
        const paneRect = previewPane.getBoundingClientRect();
        const elRect = targetEl.getBoundingClientRect();
        previewScrollOffset = elRect.top - paneRect.top - paneRect.height * 0.2;
    }
    const currentPreviewScroll = previewPane?.scrollTop ?? 0;

    // Batch all DOM WRITE operations in a single RAF - no reads inside!
    requestAnimationFrame(() => {
      // 1. CodeMirror: Scroll to position and select (handles geometry internally)
      cmActions.scrollToPosition(targetPos, { from: targetPos, to: targetPos + pattern.length });

      // 2. Scroll Preview using pre-computed offset
      if (previewPane && previewScrollOffset !== null) {
        previewPane.scrollTo({ top: currentPreviewScroll + previewScrollOffset, behavior: 'smooth' });
      }
      
      // 3. Highlight (deferred via queueMicrotask inside flashPreviewCloze)
      flashPreviewCloze(id);
      
      // 4. Update React state AFTER all DOM operations (separate from DOM writes)
      queueMicrotask(() => setTargetClozeId(id));
    });
  }, [getClozeIndex, getPreviewPane, flashPreviewCloze, cmActions]);
  
  const jumpToSiblingCloze = useCallback((direction: 'next' | 'prev') => {
      // === CodeMirror 6: Use cmActions for content/selection ===
      const full = cmActions.getContent();
      if (!full) return;
      
      const currentPos = cmActions.getSelection().from;
      
      // PERFORMANCE: Use cached index - O(1) lookup vs O(n) regex scan
      const clozeIndex = getClozeIndex(full);
      const indices = clozeIndex.allClozes;
      
      if (indices.length === 0) return;
      
      // Find target based on direction
      let targetIndex: number;
      if (direction === 'next') {
          targetIndex = indices.findIndex(item => item.pos > currentPos);
          if (targetIndex === -1) targetIndex = 0;
      } else {
          targetIndex = -1;
          for (let i = indices.length - 1; i >= 0; i--) {
              if (indices[i].pos < currentPos) {
                  targetIndex = i;
                  break;
              }
          }
          if (targetIndex === -1) targetIndex = indices.length - 1;
      }
      
      const target = indices[targetIndex];
      const pattern = `{{c${target.id}::`;

      // Calculate instance index for preview sync (before RAF)
      let instanceIndex = 0;
      for (let i = 0; i < targetIndex; i++) {
          if (indices[i].id === target.id) instanceIndex++;
      }
      
      // PERFORMANCE: Pre-read ALL preview geometry BEFORE RAF to avoid Layout Thrashing
      const previewPane = getPreviewPane();
      const previewElements = document.querySelectorAll(`[data-cloze-id="${target.id}"]`);
      const targetEl = previewElements[instanceIndex] as HTMLElement | undefined;
      let previewScrollOffset: number | null = null;
      if (targetEl && previewPane) {
          const paneRect = previewPane.getBoundingClientRect();
          const elRect = targetEl.getBoundingClientRect();
          previewScrollOffset = elRect.top - paneRect.top - paneRect.height * 0.2;
      }
      const currentPreviewScroll = previewPane?.scrollTop ?? 0;

      // Batch all DOM WRITE operations in RAF - no reads inside!
      requestAnimationFrame(() => {
          // CodeMirror: Scroll to position and select (handles geometry internally)
          cmActions.scrollToPosition(target.pos, { from: target.pos, to: target.pos + pattern.length });
          
          // Scroll preview using pre-computed offset
          if (previewPane && previewScrollOffset !== null) {
              previewPane.scrollTo({ top: currentPreviewScroll + previewScrollOffset, behavior: 'smooth' });
          }

          // Highlight (deferred via queueMicrotask inside flashPreviewCloze)
          flashPreviewCloze(target.id);
          
          // Update React state AFTER all DOM operations
          queueMicrotask(() => setTargetClozeId(target.id));
      });
  }, [getClozeIndex, getPreviewPane, flashPreviewCloze, cmActions]);

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
    if (active && currentNote) {
      setContent(currentNote.raw);
      // PERFORMANCE: Use the already-parsed note from store, don't re-parse!
      // parseNote was already called in store's loadNote()
      setParsedPreview(currentNote);
    }
  }, [currentNote, active]);

  // Debounce preview and stats update
  // CRITICAL: Always update preview when content changes (including undo/redo)
  useEffect(() => {
    if (!active) return;
    
    // PERFORMANCE: Skip debounce if content matches debouncedContent (no change)
    if (content === debouncedContent) {
      return;
    }
    
    // FAST PATH: If content matches store version, use cached parsed note
    if (content === currentNote?.raw && currentNote) {
      setParsedPreview(currentNote);
      setDebouncedContent(content);
      return;
    }
    
    // SLOW PATH: Debounce re-parsing for user edits
    const timer = setTimeout(() => {
      setParsedPreview(parseNote(content));
      setDebouncedContent(content);
    }, 200);
    return () => clearTimeout(timer);
  }, [content, active, currentNote, debouncedContent]);

  // Cleanup timers on unmount
  useEffect(() => {
      return () => {
          // Clear highlight timer to prevent memory leaks
          clearCurrentPreviewHighlight();
      };
  }, []);

  // Close floating menu when content changes
  useEffect(() => {
      setActivePreviewCloze(null);
  }, [content]);

  const handleSave = async () => {
    if (!isDirty) {
      addToast('No changes to save', 'info');
      return;
    }
    setIsSaving(true);
    try {
      if (!isTauri()) {
        addToast('Saving is only available in desktop app', 'warning');
        setIsSaving(false);
        return;
      }

      // Remember our own save to avoid reacting to the resulting file watcher event
      lastSelfSaveAtRef.current = Date.now();

      // Delegate the actual save + sync pipeline to the store
      await saveCurrentNote(content);

      // OPTIMISTIC UI UPDATE: Finish "saving" state immediately
      setIsSaving(false);
      addToast('Saved locally', 'success');
    } catch (e) {
      console.error(e);
      addToast('Failed to save note', 'error');
      setIsSaving(false); // Ensure we stop spinner on error
    }
  };

  const insertText = (before: string, after: string = '') => {
    // === CodeMirror 6: Use cmActions ===
    // 直接从 CodeMirror 获取选区和内容
    const selection = cmActions.getSelection();
    let { from: start, to: end } = selection;
    
    // 使用 getSelectedText 获取选中文本，更可靠
    let selectedText = cmActions.getSelectedText();

    // Smart trim logic - 只在有选中文本时处理
    if (selectedText.length > 0) {
        const leadingSpaceMatch = selectedText.match(/^\s*/);
        const leadingSpaceLen = leadingSpaceMatch ? leadingSpaceMatch[0].length : 0;
        const trailingSpaceMatch = selectedText.match(/\s*$/);
        const trailingSpaceLen = trailingSpaceMatch ? trailingSpaceMatch[0].length : 0;
        
        if (leadingSpaceLen + trailingSpaceLen < selectedText.length) {
            start += leadingSpaceLen;
            end -= trailingSpaceLen;
            selectedText = selectedText.substring(leadingSpaceLen, selectedText.length - trailingSpaceLen);
        }
    }
    
    const newText = before + selectedText + after;
    
    // CodeMirror: Replace range and set cursor between markers if no selection
    const innerStart = start + before.length;
    const innerEnd = innerStart + selectedText.length;
    
    // 如果没有选中文本，光标应该在两个标记之间
    if (selectedText.length === 0) {
      cmActions.replaceRange(start, end, newText, { anchor: innerStart });
    } else {
      cmActions.replaceRange(start, end, newText, { anchor: innerStart, head: innerEnd });
    }
    
    // Note: React state will be updated by CodeMirror's onChange callback
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

  const updateTargetClozeId = useCallback(() => {
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;
      const cursorPos = cmActions.getSelection().from;
      
      // Optimize: Use the maxId from our stats instead of rescanning the whole file
      // This might be slightly stale (200ms) but that's acceptable for a hint
      const prevId = ClozeUtils.findPrecedingClozeId(full, cursorPos);
      
      if (prevId !== null) {
          setTargetClozeId(prevId);
          return;
      }
      
      const maxId = clozeStats.maxId;
      if (maxId > 0) {
          setTargetClozeId(maxId);
      } else {
          setTargetClozeId(null);
      }
  }, [clozeStats.maxId]);

  // Debounce cursor-dependent logic (target cloze ID)
  useEffect(() => {
      const timer = setTimeout(() => {
          updateTargetClozeId();
      }, 150);
      return () => clearTimeout(timer);
  }, [content, updateTargetClozeId]); // Re-run when content changes (cursor often moves with content change)

  /**
   * Inserts a new cloze with auto-incremented ID (e.g., c1 -> c2)
   */
  const insertCloze = (sameId = false) => {
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      // 1. Find current max ID in the WHOLE content
      const maxId = ClozeUtils.getMaxClozeNumber(full);
      const cursorPos = cmActions.getSelection().from;

      // 2. Determine target ID
      let targetId: number;

      if (sameId) {
          const sameIdTarget = computeSameIdTarget(full, cursorPos);
          if (sameIdTarget !== null) {
              targetId = sameIdTarget;
          } else {
              targetId = Math.max(maxId + 1, 1);
          }
      } else {
          targetId = Math.max(maxId + 1, 1);
      }

      // 3. Get selection and apply the same smart-trim logic
      let { from: start, to: end } = cmActions.getSelection();
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
          }
      }

      const innerText = selectedText || '...';
      const newText = ClozeUtils.createCloze(innerText, targetId);

      // CodeMirror: Replace range and select the inner text
      const innerOffset = newText.indexOf(innerText);
      const innerStart = start + innerOffset;
      const innerEnd = innerStart + innerText.length;
      cmActions.replaceRange(start, end, newText, { anchor: innerStart, head: innerEnd });

      // Note: React state will be updated by CodeMirror's onChange callback
      setTargetClozeId(targetId);
  };

  const replaceTextRange = (newText: string, start: number, end: number) => {
      // === CodeMirror 6: Use cmActions ===
      cmActions.replaceRange(start, end, newText);
      // Note: React state will be updated by CodeMirror's onChange callback
  };

  const replaceAllText = (newText: string) => {
      // === CodeMirror 6: Use cmActions ===
      cmActions.replaceAll(newText, true); // preserveCursor = true
      // Note: React state will be updated by CodeMirror's onChange callback
  };

  const handleClearCloze = () => {
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;
      
      const { from: start, to: end } = cmActions.getSelection();
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
                 cmActions.setSelection(unclozeRes.range.end);
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
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      const { text, changed } = ClozeUtils.normalizeClozeIds(full);
      if (changed) {
          const savedCursor = cmActions.getSelection().from;
          setContent(text);
          // Restore cursor position after React re-render
          setTimeout(() => {
              cmActions.setSelection(Math.min(savedCursor, text.length));
          }, 0);
          addToast('Cloze IDs normalized', 'success');
      } else {
          addToast('IDs are already normalized', 'info');
      }
  };

  const handleCleanInvalid = () => {
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      const { text, cleanedCount } = ClozeUtils.cleanInvalidClozes(full);
      if (cleanedCount > 0) {
          if (confirm(`Found ${cleanedCount} broken/invalid cloze patterns (e.g. missing colons).\n\nRemove their formatting (keep text)?`)) {
              const savedCursor = cmActions.getSelection().from;
              setContent(text);
              // Restore cursor position after React re-render
              setTimeout(() => {
                  cmActions.setSelection(Math.min(savedCursor, text.length));
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

      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      const { id, index } = activePreviewCloze;
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
      
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      const { id, index } = activePreviewCloze;
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
      
      // === CodeMirror 6: Use cmActions ===
      const full = cmActions.getContent();
      if (!full) return;

      const { id, index } = activePreviewCloze;
      const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, index);
      
      if (info) {
          navigator.clipboard.writeText(info.answerText);
          addToast('Answer text copied', 'success');
          setActivePreviewCloze(null);
      }
  };

  const handleMetadataChange = (newContent: string) => {
      // === CodeMirror 6: Use cmActions ===
      const previousContent = content;
      
      // Only restore cursor if CodeMirror is currently focused
      const editorIsFocused = document.activeElement?.closest('.cm-editor');
      const savedStart = editorIsFocused ? cmActions.getSelection().from : 0;

      let targetPos = savedStart;

      if (editorIsFocused) {
          try {
              const prevParsed = matter(previousContent);
              const nextParsed = matter(newContent);

              const prevBodyIndex = previousContent.indexOf(prevParsed.content);
              const nextBodyIndex = newContent.indexOf(nextParsed.content);

              if (prevBodyIndex !== -1 && nextBodyIndex !== -1 && savedStart >= prevBodyIndex) {
                  const delta = nextBodyIndex - prevBodyIndex;
                  targetPos = savedStart + delta;
              }
          } catch {
          }
      }

      setContent(newContent);

      // Only restore cursor position if editor was focused
      if (editorIsFocused) {
          setTimeout(() => {
              const clampedStart = Math.min(targetPos, newContent.length);
              cmActions.setSelection(clampedStart);
          }, 0);
      }
  };

  const handleJumpToUnclosed = () => {
      const unclosed = clozeStats.unclosed;
      if (unclosed.length === 0) return;

      // === CodeMirror 6: Use cmActions ===
      const val = cmActions.getContent();
      if (!val) return;
      
      const currentPos = cmActions.getSelection().from;

      // Find the first unclosed cloze that comes after the current cursor
      let target = unclosed.find((u) => u.index > currentPos);

      // If none found, wrap around to the first unclosed
      if (!target) {
          target = unclosed[0];
      }

      let end = target.index + 2;
      if (typeof (target as any).id === 'number') {
          const id = (target as any).id as number;
          const prefix = `{{c${id}::`;
          if (val.substring(target.index, target.index + prefix.length) === prefix) {
              end = target.index + prefix.length;
          }
      }

      // CodeMirror: Scroll to position and select (handles geometry internally)
      cmActions.scrollToPosition(target.index, { from: target.index, to: end });
  };

  const handleJumpToDangling = () => {
      const dangling = clozeStats.dangling;
      if (dangling.length === 0) return;

      // === CodeMirror 6: Use cmActions ===
      const val = cmActions.getContent();
      if (!val) return;
      
      const currentPos = cmActions.getSelection().from;

      // Find the first dangling }} that comes after the current cursor
      let target = dangling.find((d) => d.index > currentPos);

      // If none found, wrap around to the first dangling
      if (!target) {
          target = dangling[0];
      }

      // Select the }}
      cmActions.scrollToPosition(target.index, { from: target.index, to: target.index + 2 });
  };

  const handlePreviewErrorClick = useCallback((
      kind: 'unclosed' | 'malformed' | 'dangling',
      occurrenceIndex: number,
      _target?: HTMLElement,
  ) => {
      // === CodeMirror 6: Use cmActions ===
      const val = cmActions.getContent();
      if (!val) return;

      const list = kind === 'unclosed'
          ? clozeStats.unclosed as { index: number }[]
          : kind === 'malformed'
              ? (clozeStats as any).malformed as { index: number; raw?: string }[] | undefined
              : (clozeStats as any).dangling as { index: number }[] | undefined;

      if (!list || list.length === 0) return;

      // Guard against out-of-range indices by wrapping around
      const safeIndex = ((occurrenceIndex % list.length) + list.length) % list.length;
      const entry = list[safeIndex];

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

      // CodeMirror: Scroll to position and select (handles geometry internally)
      cmActions.scrollToPosition(start, { from: start, to: end });
  }, [clozeStats, cmActions]);

  const handlePreviewClozeContextMenu = useCallback((id: number, occurrenceIndex: number, target: HTMLElement, _event: React.MouseEvent) => {
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
  }, []);

  const handlePreviewClozeClick = useCallback((id: number, occurrenceIndex: number, _target: HTMLElement) => {
    // === CodeMirror 6: Use cmActions ===
    const full = cmActions.getContent();
    if (!full) return;
    
    const info = ClozeUtils.findClozeByIdAndOccurrence(full, id, occurrenceIndex);

    // RAF for write operations only
    requestAnimationFrame(() => {
      if (info) {
          const { answerStart, answerEnd } = info;
          
          // CodeMirror: Scroll to position and select (handles geometry internally)
          cmActions.scrollToPosition(answerStart, { from: answerStart, to: answerEnd });
          flashPreviewCloze(id);
          
          // React state update AFTER DOM operations (deferred to avoid blocking)
          queueMicrotask(() => setTargetClozeId(id));
          return;
      }

      // Fallback: previous behavior if we failed to locate the cloze instance
      const indices = ClozeUtils.findClozeIndices(full, id);
      if (indices.length === 0) return;

      const safeIndex = ((occurrenceIndex % indices.length) + indices.length) % indices.length;
      const start = indices[safeIndex];
      const pattern = `{{c${id}::`;
      
      // CodeMirror: Scroll to position and select
      cmActions.scrollToPosition(start, { from: start, to: start + pattern.length });
      flashPreviewCloze(id);
      
      // React state update AFTER DOM operations
      queueMicrotask(() => setTargetClozeId(id));
    });
  }, [flashPreviewCloze, cmActions]);

  // === CodeMirror Keymap (Best Practice: Use internal keymap system) ===
  // PERFORMANCE: useMemo ensures stable reference, preventing extension recreation
  const clozeKeymap = useMemo(() => {
    return createClozeKeymap({
      insertCloze,
      handleClearCloze,
      jumpToSiblingCloze,
      handleSave,
      insertBold: () => insertText('**', '**'),
      insertItalic: () => insertText('*', '*'),
    });
  }, [insertCloze, handleClearCloze, jumpToSiblingCloze, handleSave, insertText]);

  // Early return for missing data - return placeholder to maintain hook order
  if (!currentNote || !currentFilepath) {
    return <div className="h-full w-full" />;
  }
  
  // Show lightweight loading indicator while preparing for interaction
  // This ensures user sees the component is loading, not frozen
  if (!isReady) {
    return (
      <div className="h-full flex flex-col bg-base-100 relative">
        {/* Minimal skeleton that matches final layout */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 backdrop-blur-md bg-base-100/80 border-b border-base-200/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-base-content/20" />
            <div className="h-3 w-px bg-base-content/10" />
            <div className="h-4 w-16 bg-base-200 rounded animate-pulse" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-6 w-24 bg-base-200 rounded-lg animate-pulse" />
            <div className="h-6 w-20 bg-primary/10 rounded-lg animate-pulse" />
          </div>
          <div className="h-7 w-16 bg-base-200 rounded animate-pulse" />
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="w-[45%] p-6 space-y-4">
            <div className="h-4 w-3/4 bg-base-200 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-base-200 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-base-200 rounded animate-pulse" />
          </div>
          <div className="flex-1 p-6 bg-base-200/30 space-y-4">
            <div className="h-6 w-1/2 bg-base-200 rounded animate-pulse" />
            <div className="h-4 w-full bg-base-200 rounded animate-pulse" />
            <div className="h-4 w-4/5 bg-base-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

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
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Bold</span> <kbd className="kbd kbd-sm">Ctrl+B</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Italic</span> <kbd className="kbd kbd-sm">Ctrl+I</kbd></div>
                <div className="divider my-1 h-px bg-base-200"></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">New Cloze</span> <kbd className="kbd kbd-sm">Ctrl+Shift+C</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Same ID Cloze</span> <kbd className="kbd kbd-sm">Ctrl+Alt+C</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Remove Cloze</span> <kbd className="kbd kbd-sm">Ctrl+Shift+X</kbd></div>
                <div className="divider my-1 h-px bg-base-200"></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Next Cloze</span> <kbd className="kbd kbd-sm">Alt+↓</kbd></div>
                <div className="flex justify-between items-center text-sm"><span className="font-medium opacity-70">Prev Cloze</span> <kbd className="kbd kbd-sm">Alt+↑</kbd></div>
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
      <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 backdrop-blur-md bg-base-100/80 border-b border-base-200/50 transition-colors gap-4">
          
          {/* Left: Status & Stats & Critical Actions */}
          <div className="flex items-center gap-3">
            {/* Status Badge (Pulse Dot) */}
            <div className={`flex items-center gap-1.5 text-xs font-medium ${isDirty ? 'text-warning' : 'text-base-content/50'}`} title={isDirty ? 'Unsaved Changes' : 'All Saved'}>
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${isDirty ? 'bg-warning shadow-[0_0_8px_rgba(250,189,0,0.5)]' : 'bg-base-content/20'}`} />
            </div>

            <div className="h-3 w-px bg-base-content/10" />

            {/* Stats */}
            <div className="flex items-center gap-1 text-[10px] font-mono text-base-content/40 select-none">
                <span className="font-bold text-base-content/70">{clozeStats.total}</span>
                <span>items</span>
            </div>

             {/* Critical Actions (Conditional) */}
            {(clozeStats.unclosed.length > 0 || clozeStats.dangling.length > 0 || clozeStats.missingIds.length > 0) && (
                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                     {clozeStats.unclosed.length > 0 && (
                        <button 
                            onClick={handleJumpToUnclosed}
                            className="btn btn-xs btn-error btn-outline h-6 min-h-0 px-1.5 gap-1 font-mono"
                            title={`${clozeStats.unclosed.length} unclosed cloze(s) - missing }}`}
                        >
                            <AlertTriangle size={10} />
                            {clozeStats.unclosed.length}
                        </button>
                    )}
                    {clozeStats.dangling.length > 0 && (
                        <button 
                            onClick={handleJumpToDangling}
                            className="btn btn-xs btn-warning btn-outline h-6 min-h-0 px-1.5 gap-1 font-mono"
                            title={`${clozeStats.dangling.length} dangling }} - extra closing braces`}
                        >
                            <span className="text-[9px]">{'}}'}</span>
                            {clozeStats.dangling.length}
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

      {/* Cloze Navigator (Memoized for performance) */}
      <ClozeNavigator
        entries={clozeStats.entries}
        targetClozeId={targetClozeId}
        onScrollToCloze={scrollToCloze}
      />

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Pane - 45% width for more editing space */}
        <div className="w-[45%] flex flex-col min-w-[400px] border-r border-base-200 bg-base-100 relative group/editor">
             <MetadataEditor content={content} onChange={handleMetadataChange} />
             
             {/* === CodeMirror 6 Editor === */}
             <CodeMirrorEditor
                ref={editorRef}
                value={content}
                onChange={setContent}
                keymap={clozeKeymap}
                className="flex-1 overflow-hidden"
                placeholder="Start typing..."
             />
        </div>

        {/* Preview Pane - 45% width */}
        <div className="w-[45%] flex-1 flex flex-col bg-base-200/30 relative group/preview">
           {/* Pane Header */}
           <div className="h-8 min-h-[2rem] border-b border-base-200 bg-base-100/50 flex items-center px-4 justify-between select-none backdrop-blur-sm z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Preview</span>
           </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar scroll-smooth">
            {active && (
                <MarkdownContent
                    content={parsedPreview.renderableContent}
                    headings={parsedPreview.headings}
                    className="text-base max-w-none"
                    onClozeClick={handlePreviewClozeClick}
                    onClozeContextMenu={handlePreviewClozeContextMenu}
                    onErrorLinkClick={handlePreviewErrorClick}
                />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

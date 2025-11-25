import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { ModeActionHint } from '../shared/ModeActionHint';
import clsx from 'clsx';
import { getThemeColors } from '../../lib/themeUtils';
import { MathClozeBlock } from '../shared/MathClozeBlock';
import { createClozeStore, ClozeStoreContext, useClozeStore } from './ClozeStore';
import { VirtualizedMarkdown, useVirtualizedMarkdown } from '../shared/VirtualizedMarkdown';
import { ChevronUp, ChevronDown, Check, Eye, EyeOff } from 'lucide-react';
import { preCacheFormulas } from '../../lib/katexCache';


// Inner component to consume store for logic that needs state access
// This separates the Provider setup from the logic that uses the store
const ClozeModeContent = ({ immersive }: { immersive: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  const theme = useAppStore((state) => state.theme);
  const vm = useVirtualizedMarkdown();

  // We can use the store here because we are inside the Provider
  // Granular subscriptions for logic
  const currentClozeIndex = useClozeStore((s) => s.currentClozeIndex);
  const revealed = useClozeStore((s) => s.revealed);

  // Actions
  const toggleReveal = useClozeStore((s) => s.toggleReveal);
  const toggleAll = useClozeStore((s) => s.toggleAll);
  const setCurrentClozeIndex = useClozeStore((s) => s.setCurrentClozeIndex);
  const setThemeColors = useClozeStore((s) => s.setThemeColors);
  const reset = useClozeStore((s) => s.reset);

  const scrollRef = useRef<HTMLDivElement>(null);
  const clozeCountsRef = useRef<Record<number, number>>({});
  const highlightedElementRef = useRef<HTMLElement | null>(null); // Cache for highlighted element

  // Sync app store currentClozeIndex to local store
  // This allows the store to be the single source of truth for inner components
  const appCurrentClozeIndex = useAppStore((state) => state.currentClozeIndex);
  useEffect(() => {
    setCurrentClozeIndex(appCurrentClozeIndex);
  }, [appCurrentClozeIndex, setCurrentClozeIndex]);

  // Reset per-render occurrence counters
  clozeCountsRef.current = {};

  // All cloze occurrences - derived from clozes array
  const allClozeKeys = useMemo(() => {
    if (!currentNote?.clozes) return [];
    // Count occurrences per cloze ID
    const occurrenceCount: Record<number, number> = {};
    for (const cloze of currentNote.clozes) {
      occurrenceCount[cloze.id] = (occurrenceCount[cloze.id] ?? 0) + 1;
    }
    // Generate keys for each occurrence
    const uniqueIds = [...new Set(currentNote.clozes.map(c => c.id))];
    return uniqueIds.flatMap((id) => {
      const count = occurrenceCount[id] || 1;
      return Array.from({ length: count }, (_, i) => `${id}-${i}`);
    });
  }, [currentNote?.clozes]);

  // Pre-cache all math formulas in the document during idle time
  useEffect(() => {
    if (!currentNote?.blocks) return;
    
    const formulas: Array<{ latex: string; displayMode: boolean }> = [];
    for (const block of currentNote.blocks) {
      // Extract math-cloze blocks from content
      const mathMatches = block.content.matchAll(/```math-cloze-\d+(?:-\d+)?\n([\s\S]*?)\n```/g);
      for (const match of mathMatches) {
        formulas.push({ latex: match[1], displayMode: true });
      }
    }
    
    if (formulas.length > 0) {
      preCacheFormulas(formulas);
    }
  }, [currentNote?.blocks]);

  // Defer blocks rendering to keep interactions smooth
  const deferredBlocks = useDeferredValue(currentNote?.blocks);

  // Reset revealed state when note changes
  useEffect(() => {
    reset();
  }, [currentNote, reset]);

  useEffect(() => {
    const colors = getThemeColors();
    if (colors && colors.length > 0) {
      setThemeColors(colors);
    } else {
      setThemeColors([]);
    }
  }, [theme, setThemeColors]);

  // Auto-scroll to active cloze (integrated with virtualization)
  useEffect(() => {
    if (currentClozeIndex === null || !currentNote) {
      return;
    }

    const blocks = currentNote.blocks || [];

    const scrolledWithVirtualization = (() => {
      if (!vm || blocks.length === 0) return false;

      const targetBlock = blocks.find((b) => {
        if (!b.hasCloze) return false;
        const id = currentClozeIndex;
        const hash = `#cloze-${id}`;
        if (b.content.includes(hash)) return true;
        const mathMarker = `math-cloze-${id}-`;
        return b.content.includes(mathMarker);
      });

      if (!targetBlock) return false;

      vm.ensureBlockVisible({ blockId: targetBlock.id, align: 'center' });

      // Highlight the first matching occurrence after mount
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-cloze-id="${currentClozeIndex}"]`);
        if (!el) return;

        if (highlightedElementRef.current) {
          highlightedElementRef.current.classList.remove('toc-target-highlight');
        }

        highlightedElementRef.current = el;
        el.classList.add('toc-target-highlight');

        setTimeout(() => {
          if (highlightedElementRef.current === el) {
            el.classList.remove('toc-target-highlight');
            highlightedElementRef.current = null;
          }
        }, 2000);
      }, 200);

      return true;
    })();

    if (scrolledWithVirtualization) {
      return;
    }

    const timeout = setTimeout(() => {
      const el = document.getElementById(`cloze-${currentClozeIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [currentClozeIndex, currentNote, vm]);

  // Get all occurrence keys for the current cloze ID
  const getCurrentTargetKeys = useCallback(() => {
    if (currentClozeIndex === null) return [];
    return allClozeKeys.filter((key) => {
      const [idStr] = key.split('-');
      const id = parseInt(idStr, 10);
      return !Number.isNaN(id) && id === currentClozeIndex;
    });
  }, [currentClozeIndex, allClozeKeys]);

  // Track current occurrence index for navigation
  const currentOccurrenceRef = useRef<number>(0);

  const focusOccurrence = useCallback((targetKeys: string[], occurrenceIndex: number) => {
    if (targetKeys.length === 0) return;
    
    const safeIndex = ((occurrenceIndex % targetKeys.length) + targetKeys.length) % targetKeys.length;
    currentOccurrenceRef.current = safeIndex;
    const targetKey = targetKeys[safeIndex];

    const nextEl = document.querySelector<HTMLElement>(`[data-cloze-key="${targetKey}"]`);
    if (!nextEl) return;

    nextEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });

    if (highlightedElementRef.current) {
      highlightedElementRef.current.classList.remove('toc-target-highlight');
    }

    highlightedElementRef.current = nextEl;
    nextEl.classList.add('toc-target-highlight');

    setTimeout(() => {
      if (highlightedElementRef.current === nextEl) {
        nextEl.classList.remove('toc-target-highlight');
        highlightedElementRef.current = null;
      }
    }, 2000);
  }, []);

  const focusNextOccurrence = (currentKey: string) => {
    const targetKeys = getCurrentTargetKeys();
    if (targetKeys.length <= 1) return;

    const index = targetKeys.indexOf(currentKey);
    const nextIndex = (index + 1) % targetKeys.length;
    focusOccurrence(targetKeys, nextIndex);
  };

  // Navigate to prev/next occurrence (for progress indicator)
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    const targetKeys = getCurrentTargetKeys();
    if (targetKeys.length <= 1) return;
    
    const delta = direction === 'next' ? 1 : -1;
    focusOccurrence(targetKeys, currentOccurrenceRef.current + delta);
  }, [getCurrentTargetKeys, focusOccurrence]);

  const handleToggleReveal = (key: string) => {
    if (!revealed[key]) {
      toggleReveal(key);

      if (currentClozeIndex !== null) {
        focusNextOccurrence(key);
      }
    }
  };



  // Global shortcut
  useEffect(() => {
    const handleShortcut = () => toggleAll(allClozeKeys);
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [toggleAll, allClozeKeys]);

  // Memoized components to prevent MarkdownContent re-renders
  // IMPORTANT: These components now use the ClozeSpan/MathClozeBlock which subscribe to the store internally
  // so we don't need to pass `revealed` state here!
  const components = useMemo(() => ({
    a: ({ href, children, title }: any) => {
      if (href?.startsWith('#cloze-')) {
        const parts = href.replace('#cloze-', '').split('-');
        const idStr = parts[0];
        const id = parseInt(idStr, 10);
        const hintStr = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : undefined;

        let occurrenceIndex = 0;
        if (!Number.isNaN(id)) {
          const current = clozeCountsRef.current[id] ?? 0;
          occurrenceIndex = current;
          clozeCountsRef.current[id] = current + 1;
        }
        const key = `${id}-${occurrenceIndex}`;
        const hint = hintStr || title;

        // Render a ClozeSpan that consumes the store
        return (
          <ClozeSpan
            id={id}
            uniqueKey={key}
            hint={hint}
            onClick={() => handleToggleReveal(key)}
          >
            {children}
          </ClozeSpan>
        );
      }
      return <a href={href} title={title} className="link link-primary" target={href?.startsWith('http') ? "_blank" : undefined}>{children}</a>;
    },
    code: ({ className, children, ...props }: any) => {
      const match = /language-([\w-]+)/.exec(className || '');
      const lang = match?.[1];
      const isInline = !match;

      if (lang && lang.startsWith('math-cloze-')) {
        const idStr = lang.replace('math-cloze-', '');
        const id = parseInt(idStr, 10);
        const latex = String(children).trim();

        let occurrenceIndex = 0;
        if (!Number.isNaN(id)) {
          const current = clozeCountsRef.current[id] ?? 0;
          occurrenceIndex = current;
          clozeCountsRef.current[id] = current + 1;
        }
        const key = `${id}-${occurrenceIndex}`;

        return (
          <div id={`cloze-${id}`} data-cloze-key={key} className="my-6">
            <MathClozeBlock
              id={Number.isNaN(id) ? 0 : id}
              latex={latex}
              isInteractive={true}
              onToggle={() => handleToggleReveal(key)}
              uniqueKey={key}
            // isRevealed is handled internally by store subscription
            />
          </div>
        );
      }

      return isInline ? (
        <code className="bg-base-300 px-1.5 py-0.5 rounded text-sm font-mono text-primary font-bold" {...props}>
          {children}
        </code>
      ) : (
        <div className="mockup-code bg-neutral text-neutral-content my-4 text-sm">
          <pre className="px-4"><code>{children}</code></pre>
        </div>
      );
    },
  }), []); // Empty deps! Stable components.

  if (!currentNote) return null;

  return (
    <div 
      className={`w-full h-full flex flex-col select-none transition-all duration-500 ease-out ${immersive ? 'px-12 py-4' : 'px-8 py-8'}`}
      data-immersive={immersive ? "true" : undefined}
    >
      <div className={`flex justify-between items-center transition-all duration-300 ${immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'}`}>
        <div className="flex flex-col gap-1">
          <h1 className={`font-serif font-bold tracking-tight m-0 transition-all duration-300 ${immersive ? 'text-2xl' : 'text-4xl'}`}>
            {currentNote.frontmatter.title || 'Untitled Note'}
          </h1>
          {currentClozeIndex !== null && (
            <span className="text-xs font-mono text-primary/70 uppercase tracking-widest">
              Reviewing Cloze #{currentClozeIndex}
            </span>
          )}
        </div>

        {!immersive && currentClozeIndex === null && (
          <ModeActionHint
            label="to Reveal"
            action="Press"
            keys={['SPACE']}
            extraContent={
              <ClozeToggleAllButton allClozeKeys={allClozeKeys} />
            }
          />
        )}
      </div>

      <div className="transition-all duration-300 flex-1 prose prose-lg relative scroll-container overflow-y-auto" ref={scrollRef}>
        <VirtualizedMarkdown
          blocks={deferredBlocks || []}
          components={components}
        />
      </div>

      {/* Floating progress indicator */}
      {!immersive && (
        <ClozeProgressIndicator 
          allClozeKeys={allClozeKeys} 
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
};

// Inner component for text clozes to subscribe to store
const ClozeSpan = ({ id, uniqueKey, hint, children, onClick }: any) => {
  // Granular subscriptions
  const currentClozeIndex = useClozeStore((s) => s.currentClozeIndex);
  // Use a selector that returns a boolean to avoid object identity issues if we returned the whole map
  const isRevealedInStore = useClozeStore((s) => !!s.revealed[uniqueKey]);

  const isTarget = currentClozeIndex !== null ? id === currentClozeIndex : true;
  const isContext = !isTarget;

  // Logic:
  // Review Mode: Target respects reveal state, Context is always revealed (or dimmed)
  // Free Mode: All respect reveal state
  const isRevealed = currentClozeIndex !== null
    ? (isTarget ? isRevealedInStore : true)
    : isRevealedInStore;

  return (
    <span id={`cloze-${id}`} data-cloze-key={uniqueKey} className="inline-flex items-center gap-1 align-baseline mx-1">
      <span className={`text-[10px] font-mono font-bold select-none px-1 rounded border transition-colors ${isTarget
        ? 'text-primary bg-primary/10 border-primary/20'
        : 'text-base-content/40 bg-transparent border-transparent'
        }`}>
        {id}
      </span>

      <span
        className={clsx(
          "font-medium px-1 rounded transition-colors duration-200 ease-out border-b-2 -translate-y-0.5 inline-block align-middle",
          isTarget ? "cursor-pointer" : "cursor-default",
          isContext
            ? "bg-primary/5 border-primary/25 text-base-content/90"
            : isRevealed
              ? "bg-success/20 border-success text-success font-bold"
              : "bg-base-300 border-base-content/20 text-transparent min-w-[60px] hover:bg-base-content/10 select-none relative overflow-hidden"
        )}
        onClick={(e) => {
          e.preventDefault();
          const canToggle = currentClozeIndex === null || isTarget;
          if (canToggle) onClick();
        }}
        title={hint || "Click to reveal"}
        style={{
          transform: isTarget && !isRevealed ? 'scale(0.98)' : 'scale(1)',
          opacity: isContext ? 0.9 : 1
        }}
      >
        {!isRevealed && hint && (
          <span
            className="absolute inset-0 flex items-center justify-center text-xs text-base-content/40 font-mono uppercase tracking-wide"
          >
            {hint}
          </span>
        )}
        <span className={!isRevealed ? "invisible" : ""}>{children}</span>
      </span>
    </span>
  );
};

// Isolated component for the "Show All" button to prevent re-rendering the whole page
const ClozeToggleAllButton = ({ allClozeKeys }: { allClozeKeys: string[] }) => {
  const toggleAll = useClozeStore((s) => s.toggleAll);
  // We need to know if all are revealed to show the correct label
  // This is the ONLY component that needs to subscribe to the full revealed map (or a derived value)
  const isAllRevealed = useClozeStore((s) => {
    if (allClozeKeys.length === 0) return false;
    return allClozeKeys.every((key) => s.revealed[key]);
  });

  return (
    <button
      className="text-primary hover:text-primary-content hover:bg-primary px-2 py-0.5 rounded text-xs font-bold transition-all uppercase tracking-wider min-w-[80px]"
      onClick={() => toggleAll(allClozeKeys)}
    >
      {isAllRevealed ? 'Hide All' : 'Show All'}
    </button>
  );
};

// Progress indicator showing current cloze position and navigation controls
const ClozeProgressIndicator = ({ 
  allClozeKeys, 
  onNavigate 
}: { 
  allClozeKeys: string[];
  onNavigate: (direction: 'prev' | 'next') => void;
}) => {
  const currentClozeIndex = useClozeStore((s) => s.currentClozeIndex);
  const revealed = useClozeStore((s) => s.revealed);
  
  // Count revealed for current cloze ID
  const stats = useMemo(() => {
    if (currentClozeIndex === null) {
      // Free mode: show overall stats
      const totalKeys = allClozeKeys.length;
      const revealedCount = allClozeKeys.filter(k => revealed[k]).length;
      return { 
        mode: 'free' as const, 
        total: totalKeys, 
        revealed: revealedCount,
        currentId: null,
        occurrences: 0 
      };
    }

    // Queue mode: show stats for current cloze ID
    const targetKeys = allClozeKeys.filter(key => {
      const [idStr] = key.split('-');
      return parseInt(idStr, 10) === currentClozeIndex;
    });
    const revealedCount = targetKeys.filter(k => revealed[k]).length;
    
    return {
      mode: 'queue' as const,
      total: targetKeys.length,
      revealed: revealedCount,
      currentId: currentClozeIndex,
      occurrences: targetKeys.length
    };
  }, [currentClozeIndex, allClozeKeys, revealed]);

  if (allClozeKeys.length === 0) return null;

  const isComplete = stats.revealed === stats.total && stats.total > 0;

  return (
    <div className={clsx(
      "fixed bottom-24 right-6 z-40 flex items-center gap-2 p-2 rounded-full shadow-lg border backdrop-blur-sm transition-all duration-300",
      isComplete 
        ? "bg-success/90 border-success-content/20 text-success-content" 
        : "bg-base-100/90 border-base-content/10 text-base-content"
    )}>
      {/* Navigation buttons (only in queue mode with multiple occurrences) */}
      {stats.mode === 'queue' && stats.occurrences > 1 && (
        <>
          <button 
            className="btn btn-circle btn-ghost btn-xs"
            onClick={() => onNavigate('prev')}
            title="Previous occurrence (Alt+↑)"
          >
            <ChevronUp size={14} />
          </button>
        </>
      )}

      {/* Progress display */}
      <div className="flex items-center gap-2 px-2">
        {stats.mode === 'queue' ? (
          <>
            <span className="text-xs font-mono font-bold bg-base-content/10 px-1.5 py-0.5 rounded">
              c{stats.currentId}
            </span>
            <span className="text-xs font-medium">
              {stats.revealed} / {stats.total}
            </span>
            {isComplete && <Check size={14} className="text-success-content" />}
          </>
        ) : (
          <>
            <span className="text-xs font-medium opacity-70">
              {stats.revealed} / {stats.total} revealed
            </span>
            {isComplete ? (
              <Eye size={14} className="opacity-70" />
            ) : (
              <EyeOff size={14} className="opacity-50" />
            )}
          </>
        )}
      </div>

      {/* Navigation buttons (only in queue mode with multiple occurrences) */}
      {stats.mode === 'queue' && stats.occurrences > 1 && (
        <>
          <button 
            className="btn btn-circle btn-ghost btn-xs"
            onClick={() => onNavigate('next')}
            title="Next occurrence (Alt+↓)"
          >
            <ChevronDown size={14} />
          </button>
        </>
      )}
    </div>
  );
};

export const ClozeMode = ({ immersive = false }: { immersive?: boolean }) => {
  // Initialize store once per mount
  const store = useState(() => createClozeStore())[0];

  return (
    <ClozeStoreContext.Provider value={store}>
      <ClozeModeContent immersive={immersive} />
    </ClozeStoreContext.Provider>
  );
};

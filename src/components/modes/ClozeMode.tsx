import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MarkdownContent } from '../shared/MarkdownContent';
import { ModeActionHint } from '../shared/ModeActionHint';
import { fireConfetti } from '../../lib/confettiService';
import { getNoteDisplayTitle } from '../../lib/stringUtils';
import { useClozeRevealStore } from '../../store/clozeRevealStore';

export const ClozeMode = ({ immersive = false }: { immersive?: boolean }) => {
  const currentNote = useAppStore((state) => state.currentNote);
  const currentClozeIndex = useAppStore((state) => state.currentClozeIndex);
  
  // Zustand store for fine-grained cloze reveal state
  // NOTE: Do NOT subscribe to `revealed` object here - it changes on every reveal
  // and would cause unnecessary re-renders of the entire ClozeMode component.
  // Instead, use getState() in callbacks and computed selectors for derived values.
  const storeSetRevealed = useClozeRevealStore((state) => state.setRevealed);
  const storeReset = useClozeRevealStore((state) => state.reset);
  const storeSetCurrentClozeIndex = useClozeRevealStore((state) => state.setCurrentClozeIndex);
  
  // Ref to track latest currentClozeIndex for subscription callback (avoids stale closure)
  const currentClozeIndexRef = useRef(currentClozeIndex);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track the last revealed key to trigger confetti via useEffect
  const [lastRevealedKey, setLastRevealedKey] = useState<string | null>(null);
  
  // State for "Show All" / "Hide All" button - derived from store on demand
  const [isAllRevealed, setIsAllRevealed] = useState(false);

  // === MEMOIZED VALUES ===
  const allClozeKeys = useMemo(() => {
    if (!currentNote || !currentNote.clozes || currentNote.clozes.length === 0) {
      return [] as string[];
    }
    const counts: Record<number, number> = {};
    return currentNote.clozes.map((c) => {
      const count = counts[c.id] || 0;
      counts[c.id] = count + 1;
      return `${c.id}-${count}`;
    });
  }, [currentNote]);

  // === CALLBACKS (must be defined before useEffects that use them) ===
  
  // Toggle all clozes - uses getState() to avoid subscribing to revealed object
  const toggleAll = useCallback(() => {
    if (allClozeKeys.length === 0) return;
    
    // Read current state at call time (not closure)
    const revealed = useClozeRevealStore.getState().revealed;

    if (currentClozeIndex === null) {
      const allRevealedNow = allClozeKeys.every((key) => revealed[key]);
      if (allRevealedNow) {
        storeSetRevealed({});
      } else {
        const next: Record<string, boolean> = { ...revealed };
        allClozeKeys.forEach((key) => {
          next[key] = true;
        });
        storeSetRevealed(next);
      }
      return;
    }

    const targetKeys = allClozeKeys.filter((key) => {
      const [idStr] = key.split('-');
      const id = parseInt(idStr, 10);
      return !Number.isNaN(id) && id === currentClozeIndex;
    });

    if (targetKeys.length === 0) return;

    const allTargetRevealed = targetKeys.every((key) => revealed[key]);
    const next: Record<string, boolean> = { ...revealed };

    if (allTargetRevealed) {
      targetKeys.forEach((key) => {
        delete next[key];
      });
    } else {
      targetKeys.forEach((key) => {
        next[key] = true;
      });
    }
    storeSetRevealed(next);
  }, [allClozeKeys, currentClozeIndex, storeSetRevealed]);

  // PERFORMANCE: Defer focus/scroll operations to idle time
  const focusNextOccurrence = useCallback((currentKey: string) => {
    // Use ref for current value to avoid stale closure in deferred callback
    const clozeIndex = currentClozeIndexRef.current;
    if (clozeIndex === null) return;

    const doFocus = () => {
      const targetKeys = allClozeKeys.filter((key) => {
        const [idStr] = key.split('-');
        const id = parseInt(idStr, 10);
        return !Number.isNaN(id) && id === clozeIndex;
      });

      if (targetKeys.length <= 1) return;

      const index = targetKeys.indexOf(currentKey);
      if (index === -1 || index === targetKeys.length - 1) return;

      const nextKey = targetKeys[index + 1];
      const nextEl = document.querySelector<HTMLElement>(`[data-cloze-key="${nextKey}"]`);
      if (!nextEl) return;

      requestAnimationFrame(() => {
        const rect = nextEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const margin = 96;
        const isInView = rect.top >= margin && rect.bottom <= viewportHeight - margin;

        if (!isInView) {
          const container = document.getElementById('note-scroll-container');
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const scrollOffset = rect.top - containerRect.top - containerRect.height / 2 + rect.height / 2;
            container.scrollTo({ top: container.scrollTop + scrollOffset, behavior: 'smooth' });
          }
        }

        nextEl.classList.add('toc-target-highlight');
        setTimeout(() => {
          nextEl.classList.remove('toc-target-highlight');
        }, 1500);
      });
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(doFocus, { timeout: 300 });
    } else {
      setTimeout(doFocus, 150);
    }
  }, [allClozeKeys]); // Removed currentClozeIndex - using ref instead

  // === EFFECTS ===

  // Keep ref in sync with currentClozeIndex
  useEffect(() => {
    currentClozeIndexRef.current = currentClozeIndex;
  }, [currentClozeIndex]);

  // Reset revealed state when note changes
  useEffect(() => {
    storeReset();
    setIsAllRevealed(false);
  }, [currentNote, storeReset]);

  // Sync currentClozeIndex to store for ClozeWithContext to access
  useEffect(() => {
    storeSetCurrentClozeIndex(currentClozeIndex);
  }, [currentClozeIndex, storeSetCurrentClozeIndex]);

  // Auto-scroll to active cloze
  useEffect(() => {
    if (currentClozeIndex !== null) {
      // Use RAF to batch read/write and avoid layout thrashing
      const timerId = setTimeout(() => {
        const el = document.getElementById(`cloze-${currentClozeIndex}`);
        const container = document.getElementById('note-scroll-container');
        if (el && container) {
          // BATCH READ: Get all geometry first
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const scrollOffset = elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
          const targetScroll = container.scrollTop + scrollOffset;
          
          // BATCH WRITE: Apply scroll in RAF to avoid forced reflow
          requestAnimationFrame(() => {
            container.scrollTop = targetScroll;
          });
        }
      }, 100);
      return () => clearTimeout(timerId);
    }
  }, [currentClozeIndex, currentNote]);

  // Listen for global shortcut events
  useEffect(() => {
    const handleShortcut = () => {
      toggleAll();
    };
    window.addEventListener('shortcut-reveal', handleShortcut);
    return () => window.removeEventListener('shortcut-reveal', handleShortcut);
  }, [toggleAll]);

  // === CONFETTI EFFECT ===
  // PERFORMANCE: Uses pre-initialized confetti service for instant celebration
  useEffect(() => {
    if (!lastRevealedKey) return;

    const [idStr] = lastRevealedKey.split('-');
    const id = parseInt(idStr, 10);
    const isTargetCloze = currentClozeIndex === null || (!Number.isNaN(id) && id === currentClozeIndex);

    if (!isTargetCloze) {
      setLastRevealedKey(null);
      return;
    }

    fireConfetti();
    setLastRevealedKey(null);
  }, [lastRevealedKey, currentClozeIndex]);

  // Subscribe to store changes to:
  // 1. Trigger confetti on reveal
  // 2. Focus next occurrence
  // 3. Update isAllRevealed state for UI
  useEffect(() => {
    const unsubscribe = useClozeRevealStore.subscribe(
      (state, prevState) => {
        // Find newly revealed key
        const newKeys = Object.keys(state.revealed).filter(
          key => state.revealed[key] && !prevState.revealed[key]
        );
        if (newKeys.length > 0) {
          setLastRevealedKey(newKeys[0]);
          // Focus next occurrence - use ref for latest value (avoids stale closure)
          if (currentClozeIndexRef.current !== null) {
            focusNextOccurrence(newKeys[0]);
          }
        }
        
        // Update isAllRevealed for UI button state
        // This is more efficient than subscribing to entire revealed object
        if (allClozeKeys.length > 0) {
          const allRevealed = allClozeKeys.every((key) => state.revealed[key]);
          setIsAllRevealed(allRevealed);
        }
      }
    );
    return unsubscribe;
  }, [focusNextOccurrence, allClozeKeys]);

  // === EARLY RETURN (after all hooks) ===
  if (!currentNote) return null;

  return (
    <div
      className={`w-full h-full flex flex-col select-none ${
        immersive ? 'px-12 py-4' : 'px-8 py-8'
      }`}
    >
      <div
        className={`flex justify-between items-center transition-opacity duration-200 ${
          immersive ? 'mb-6 opacity-0 hover:opacity-100' : 'border-b border-white/5 mb-8 pb-6'
        }`}
      >
        <div className="flex flex-col gap-1">
          <h1
            className={`font-serif font-bold tracking-tight m-0 ${
              immersive ? 'text-2xl' : 'text-4xl'
            }`}
          >
            {getNoteDisplayTitle(currentNote.frontmatter.title)}
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
              <button
                className="text-primary hover:text-primary-content hover:bg-primary px-2 py-0.5 rounded text-xs font-bold transition-all uppercase tracking-wider min-w-[80px]"
                onClick={toggleAll}
              >
                {isAllRevealed ? 'Hide All' : 'Show All'}
              </button>
            }
          />
        )}
      </div>

      <div
        className="flex-1 prose prose-lg relative"
        ref={scrollRef}
      >
        {/* No Provider needed - ClozeWithContext uses Zustand store directly */}
        <MarkdownContent
          content={currentNote.renderableContent}
          hideFirstH1
          variant="review"
        />
      </div>
    </div>
  );
};


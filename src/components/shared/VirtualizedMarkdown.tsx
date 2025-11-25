import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, startTransition, type ReactNode, type MouseEvent } from 'react';
import type { Components } from 'react-markdown';
import { MarkdownContent } from './MarkdownContent';
import type { MarkdownBlock } from '../../lib/markdown/parser';

interface BlockApi {
  headingSlug?: string;
  mount: () => void;
  getElement: () => HTMLElement | null;
}

interface EnsureArgs {
  headingSlug?: string;
  blockId?: string;
  align?: ScrollLogicalPosition;
}

interface VirtualizedMarkdownContextValue {
  registerBlock: (blockId: string, headingSlug: string | undefined, api: BlockApi) => void;
  unregisterBlock: (blockId: string) => void;
  ensureBlockVisible: (args: EnsureArgs) => void;
}

const VirtualizedMarkdownContext = createContext<VirtualizedMarkdownContextValue | null>(null);

// Shared IntersectionObserver for all blocks - avoids creating hundreds of observers
let sharedObserver: IntersectionObserver | null = null;
const observerCallbacks = new Map<Element, () => void>();

const getSharedObserver = () => {
  if (sharedObserver) return sharedObserver;
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null;

  sharedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const callback = observerCallbacks.get(entry.target);
          if (callback) {
            // Use startTransition to avoid blocking user interactions
            startTransition(() => {
              callback();
            });
            observerCallbacks.delete(entry.target);
            sharedObserver?.unobserve(entry.target);
          }
        }
      });
    },
    {
      root: null,
      rootMargin: '600px 0px', // Larger margin for smoother scrolling
      threshold: 0,
    }
  );

  return sharedObserver;
};

export const VirtualizedMarkdownProvider = ({ children }: { children: ReactNode }) => {
  const blockMapRef = useRef<Record<string, BlockApi>>({});
  const slugToIdRef = useRef<Record<string, string>>({});

  const registerBlock = useCallback(
    (blockId: string, headingSlug: string | undefined, api: BlockApi) => {
      blockMapRef.current[blockId] = api;
      if (headingSlug) {
        slugToIdRef.current[headingSlug] = blockId;
      }
    },
    [],
  );

  const unregisterBlock = useCallback((blockId: string) => {
    delete blockMapRef.current[blockId];
    // We intentionally do not clean slugToIdRef here to avoid O(n) scans.
    // Stale entries are ignored in ensureBlockVisible when no matching BlockApi is found.
  }, []);

  const ensureBlockVisible = useCallback((args: EnsureArgs) => {
    const { headingSlug, blockId, align = 'start' } = args;

    const id = blockId ?? (headingSlug ? slugToIdRef.current[headingSlug] : undefined);
    if (!id) return;

    const api = blockMapRef.current[id];
    if (!api) return;

    api.mount();

    if (typeof window === 'undefined') return;

    const scroll = () => {
      const el = api.getElement();
      if (!el) return;

      el.scrollIntoView({
        behavior: 'smooth',
        block: align,
      });
    };

    if ('requestAnimationFrame' in window) {
      window.requestAnimationFrame(scroll);
    } else {
      setTimeout(scroll, 0);
    }
  }, []);

  const value = useMemo<VirtualizedMarkdownContextValue>(
    () => ({ registerBlock, unregisterBlock, ensureBlockVisible }),
    [registerBlock, unregisterBlock, ensureBlockVisible],
  );

  return (
    <VirtualizedMarkdownContext.Provider value={value}>
      {children}
    </VirtualizedMarkdownContext.Provider>
  );
};

export const useVirtualizedMarkdown = () => {
  return useContext(VirtualizedMarkdownContext);
};

interface VirtualizedMarkdownProps {
  blocks: MarkdownBlock[];
  components?: Components;
  className?: string;
  transformBlockContent?: (block: MarkdownBlock) => string;
  disableIds?: boolean;
  onClozeClick?: (id: number, occurrenceIndex: number, target: HTMLElement) => void;
  onClozeContextMenu?: (
    id: number,
    occurrenceIndex: number,
    target: HTMLElement,
    event: MouseEvent,
  ) => void;
  onErrorLinkClick?: (
    kind: 'unclosed' | 'malformed' | 'dangling',
    occurrenceIndex: number,
    target?: HTMLElement,
  ) => void;
  /**
   * Number of blocks to eagerly mount at the top of the document.
   * Remaining blocks are lazily mounted via IntersectionObserver.
   */
  initialWindow?: number;
}

export const VirtualizedMarkdown = ({
  blocks,
  components,
  className,
  transformBlockContent,
  disableIds,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
  initialWindow = 8,
}: VirtualizedMarkdownProps) => {
  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <VirtualizedBlock
          key={block.id}
          block={block}
          index={index}
          initialWindow={initialWindow}
          components={components}
          transformBlockContent={transformBlockContent}
          disableIds={disableIds}
          onClozeClick={onClozeClick}
          onClozeContextMenu={onClozeContextMenu}
          onErrorLinkClick={onErrorLinkClick}
        />
      ))}
    </div>
  );
};

interface VirtualizedBlockProps {
  block: MarkdownBlock;
  index: number;
  initialWindow: number;
  components?: Components;
  transformBlockContent?: (block: MarkdownBlock) => string;
  disableIds?: boolean;
  onClozeClick?: (id: number, occurrenceIndex: number, target: HTMLElement) => void;
  onClozeContextMenu?: (
    id: number,
    occurrenceIndex: number,
    target: HTMLElement,
    event: React.MouseEvent,
  ) => void;
  onErrorLinkClick?: (
    kind: 'unclosed' | 'malformed' | 'dangling',
    occurrenceIndex: number,
    target?: HTMLElement,
  ) => void;
}

const VirtualizedBlock = ({
  block,
  index,
  initialWindow,
  components,
  transformBlockContent,
  disableIds,
  onClozeClick,
  onClozeContextMenu,
  onErrorLinkClick,
}: VirtualizedBlockProps) => {
  const ctx = useContext(VirtualizedMarkdownContext);
  const [mounted, setMounted] = useState(index < initialWindow);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Register with the shared context so TOC / cloze navigation can target blocks.
  useEffect(() => {
    if (!ctx) return;

    const api: BlockApi = {
      headingSlug: block.heading?.slug,
      mount: () => setMounted(true),
      getElement: () => wrapperRef.current,
    };

    ctx.registerBlock(block.id, block.heading?.slug, api);
    return () => ctx.unregisterBlock(block.id);
  }, [ctx, block.id, block.heading?.slug]);

  // Lazy-mount blocks when they approach the viewport using shared observer
  useEffect(() => {
    if (mounted) return;
    
    const target = wrapperRef.current;
    if (!target) {
      setMounted(true);
      return;
    }

    const observer = getSharedObserver();
    if (!observer) {
      setMounted(true);
      return;
    }

    // Register callback and observe
    observerCallbacks.set(target, () => setMounted(true));
    observer.observe(target);

    return () => {
      observerCallbacks.delete(target);
      observer.unobserve(target);
    };
  }, [mounted]);

  const content = useMemo(
    () => (transformBlockContent ? transformBlockContent(block) : block.content),
    [block, transformBlockContent],
  );

  const mergedComponents = useMemo<Components | undefined>(() => {
    if (!block.heading) return components;

    const level = block.heading.level;

    const headingClassName = (() => {
      switch (level) {
        case 1:
          return 'font-serif text-3xl font-bold mt-8 mb-4 text-base-content scroll-mt-20';
        case 2:
          return 'font-serif text-2xl font-bold mt-6 mb-3 text-base-content/90 border-b border-base-content/10 pb-2 scroll-mt-20';
        case 3:
          return 'font-serif text-xl font-bold mt-5 mb-2 text-base-content/80 scroll-mt-20';
        default:
          return 'font-bold mt-4 mb-2 text-base-content/80 scroll-mt-20';
      }
    })();

    const slug = block.heading.slug || undefined;

    let overrides: Components = {};

    if (level === 1) {
      overrides = {
        h1: (({ children }: { children: ReactNode }) => (
          <h1 id={slug} className={headingClassName}>
            {children}
          </h1>
        )) as Components['h1'],
      };
    } else if (level === 2) {
      overrides = {
        h2: (({ children }: { children: ReactNode }) => (
          <h2 id={slug} className={headingClassName}>
            {children}
          </h2>
        )) as Components['h2'],
      };
    } else if (level === 3) {
      overrides = {
        h3: (({ children }: { children: ReactNode }) => (
          <h3 id={slug} className={headingClassName}>
            {children}
          </h3>
        )) as Components['h3'],
      };
    } else {
      overrides = {
        h4: (({ children }: { children: ReactNode }) => (
          <h4 id={slug} className={headingClassName}>
            {children}
          </h4>
        )) as Components['h4'],
      };
    }

    return {
      ...(components || {}),
      ...overrides,
    };
  }, [block.heading, components]);

  // Estimate height based on content for better CLS
  const estimatedHeight = useMemo(() => {
    const lines = content.split('\n').length;
    const hasMath = content.includes('```math-cloze') || content.includes('$$');
    // Math blocks need more height
    return hasMath ? Math.max(100, lines * 2.5) : Math.max(24, lines * 1.5);
  }, [content]);

  return (
    <div 
      ref={wrapperRef} 
      className="virtualized-block"
      style={{ containIntrinsicSize: `auto ${estimatedHeight}px` } as React.CSSProperties}
    >
      {mounted ? (
        <MarkdownContent
          content={content}
          components={mergedComponents}
          disableIds={disableIds}
          onClozeClick={onClozeClick}
          onClozeContextMenu={onClozeContextMenu}
          onErrorLinkClick={onErrorLinkClick}
        />
      ) : (
        <div
          className="bg-base-200/30 rounded animate-pulse"
          style={{
            minHeight: `${estimatedHeight}px`,
          }}
        />
      )}
    </div>
  );
};

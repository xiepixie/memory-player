import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { MarkdownSplitter } from '../../lib/markdown/splitter';

interface Header {
    id: string;
    text: string;
    level: number;
}

const headersAreEqual = (a: Header[], b: Header[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const prev = a[i];
        const next = b[i];
        if (prev.id !== next.id || prev.level !== next.level || prev.text !== next.text) {
            return false;
        }
    }
    return true;
};

export const TableOfContents = () => {
    const currentNote = useAppStore((state) => state.currentNote);
    const viewMode = useAppStore((state) => state.viewMode);
    const [headers, setHeaders] = useState<Header[]>([]);
    const [sectionCardCounts, setSectionCardCounts] = useState<Record<string, number>>({});

    // Debounce timer ref for MutationObserver - prevents excessive DOM queries in Tauri WebView
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // PERFORMANCE: Track currently highlighted element to avoid querySelectorAll
    const highlightedRef = useRef<HTMLElement | null>(null);
    const DEBOUNCE_MS = 300; // Increased debounce for better Tauri performance

    const collectHeaders = useCallback((container: HTMLElement) => {
        const headingElements = container.querySelectorAll<HTMLHeadingElement>('h1[id], h2[id], h3[id], h4[id]');
        const extracted: Header[] = [];

        headingElements.forEach((el) => {
            // Ignore headings that are inside aria-hidden containers
            if (el.closest('[aria-hidden="true"]')) return;

            const level = Number(el.tagName.substring(1));
            if (!level || level < 1 || level > 4) return;

            const text = el.textContent?.trim() || '';
            if (!text) return;

            if (!el.id) return;

            extracted.push({
                id: el.id,
                text,
                level,
            });
        });

        setHeaders((prev) => (headersAreEqual(prev, extracted) ? prev : extracted));
    }, []);

    useEffect(() => {
        if (!currentNote) {
            setHeaders([]);
            return;
        }

        const container = document.getElementById('note-scroll-container');
        if (!container) {
            setHeaders([]);
            return;
        }

        // Initial collection
        collectHeaders(container);

        // Debounced MutationObserver callback - critical for Tauri WebView performance
        // In Tauri, MutationObserver fires much more frequently than in browser
        const observer = new MutationObserver(() => {
            // Cancel any pending debounce
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            // Schedule new collection with debounce
            debounceTimerRef.current = setTimeout(() => {
                collectHeaders(container);
            }, DEBOUNCE_MS);
        });

        // Only observe childList changes, not characterData or attributes
        // This reduces the number of callbacks significantly
        observer.observe(container, { childList: true, subtree: true });

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            observer.disconnect();
        };
    }, [currentNote, viewMode, collectHeaders]);

    useEffect(() => {
        if (!currentNote) {
            setSectionCardCounts({});
            return;
        }

        const tags = Array.isArray((currentNote.frontmatter as any)?.tags)
            ? (currentNote.frontmatter as any).tags as string[]
            : [];

        const blocks = MarkdownSplitter.split(currentNote.content, tags);
        const counts: Record<string, number> = {};

        blocks.forEach(block => {
            const clozeCount = block.clozeIds?.length || 0;
            if (clozeCount === 0) return;
            block.sectionPath.forEach(title => {
                counts[title] = (counts[title] || 0) + clozeCount;
            });
        });

        setSectionCardCounts(counts);
    }, [currentNote]);

    if (headers.length === 0) return null;

    const scrollToHeader = (id: string) => {
        const container = document.getElementById('note-scroll-container');
        if (!container) {
            return;
        }

        // 1) Prefer the DOM element with this id that actually lives inside the scroll container
        let element = document.getElementById(id) as HTMLElement | null;
        if (!element || !container.contains(element)) {
            const candidates = Array.from(container.querySelectorAll<HTMLElement>('[id]'));
            element = candidates.find((el) => el.id === id) ?? null;
        }

        if (!element) {
            return;
        }

        // PERFORMANCE: Single RAF to batch all DOM reads/writes
        // Avoids layout thrashing by grouping getBoundingClientRect calls
        requestAnimationFrame(() => {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element!.getBoundingClientRect();
            const scrollMarginTop = 80; // scroll-mt-20 = 5rem = 80px
            const targetScroll = container.scrollTop + elementRect.top - containerRect.top - scrollMarginTop;
            
            // Smooth scroll for better UX
            container.scrollTo({ 
                top: Math.max(0, targetScroll), 
                behavior: 'smooth' 
            });

            // Clear previous highlight (no querySelectorAll needed)
            if (highlightedRef.current) {
                highlightedRef.current.classList.remove('toc-target-highlight');
            }

            // Add new highlight
            element!.classList.add('toc-target-highlight');
            highlightedRef.current = element;
        });

        // Clean up after animation
        setTimeout(() => {
            if (highlightedRef.current === element) {
                element!.classList.remove('toc-target-highlight');
                highlightedRef.current = null;
            }
        }, 1500);
    };

    return (
        <div className="h-full overflow-y-auto p-4 text-sm relative">
            {/* Decorative background line */}
            <div className="absolute left-6 top-12 bottom-4 w-px bg-gradient-to-b from-base-content/20 to-transparent" />
            
            <h3 className="font-bold mb-6 px-2 opacity-40 uppercase tracking-widest text-[10px] text-base-content">Outline</h3>
            <ul className="space-y-1 relative">
                {headers.map((header, i) => (
                    <li
                        key={i}
                        className={`
                            group flex items-center gap-3
                            cursor-pointer py-1.5 pr-2 rounded-lg transition-colors duration-150
                            hover:bg-base-content/5 active:bg-base-content/10
                        `}
                        style={{ paddingLeft: `${(header.level - 1) * 12 + 8}px` }}
                        onClick={() => scrollToHeader(header.id)}
                    >
                        {/* Active indicator dot (optional - could rely on scroll spy later) */}
                        <div className="w-1 h-1 rounded-full bg-base-content/20 group-hover:bg-primary transition-colors" />
                        
                        <span className="flex-1 truncate opacity-60 group-hover:opacity-100 group-hover:text-primary-content transition-[color,opacity] duration-150 text-xs font-medium" title={header.text}>
                            {header.text}
                        </span>

                        {sectionCardCounts[header.text] > 0 && (
                            <span className="ml-2 text-[10px] font-mono opacity-50">
                                {sectionCardCounts[header.text]}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

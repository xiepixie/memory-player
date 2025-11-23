import { useEffect, useState } from 'react';
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

        let rafId: number | null = null;

        const collectHeaders = () => {
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

            const nextHeaders = extracted;

            setHeaders((prev) => (headersAreEqual(prev, nextHeaders) ? prev : nextHeaders));
        };

        collectHeaders();

        const observer = new MutationObserver(() => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(collectHeaders);
        });

        observer.observe(container, { childList: true, subtree: true });

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [currentNote, viewMode]);

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
            console.warn(`[TableOfContents] Scroll container not found when trying to scroll to id "${id}"`);
            return;
        }

        // 1) Prefer the DOM element with this id that actually lives inside the scroll container
        let element = document.getElementById(id) as HTMLElement | null;
        if (!element || !container.contains(element)) {
            const candidates = Array.from(container.querySelectorAll<HTMLElement>('[id]'));
            element = candidates.find((el) => el.id === id) ?? null;
        }

        if (!element) {
            console.warn(`[TableOfContents] Scroll target not found for id "${id}"`);
            return;
        }

        // Let the browser find the nearest scroll container and respect `scroll-margin-top` (scroll-mt-20)
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });

        // UX: Highlight the target heading to assist visual scanning
        document.querySelectorAll('.toc-target-highlight').forEach(el => {
            el.classList.remove('toc-target-highlight');
        });

        // Restart CSS animation in the next frame without forcing synchronous reflow
        requestAnimationFrame(() => {
            element.classList.add('toc-target-highlight');

            // Clean up after animation
            setTimeout(() => {
                element.classList.remove('toc-target-highlight');
            }, 1500);
        });
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
                            cursor-pointer py-1.5 pr-2 rounded-lg transition-all duration-200
                            hover:bg-base-content/5
                        `}
                        style={{ paddingLeft: `${(header.level - 1) * 12 + 8}px` }}
                        onClick={() => scrollToHeader(header.id)}
                    >
                        {/* Active indicator dot (optional - could rely on scroll spy later) */}
                        <div className="w-1 h-1 rounded-full bg-base-content/20 group-hover:bg-primary transition-colors" />
                        
                        <span className="flex-1 truncate opacity-60 group-hover:opacity-100 group-hover:text-primary-content transition-all text-xs font-medium" title={header.text}>
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

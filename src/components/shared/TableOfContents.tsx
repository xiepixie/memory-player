import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { MarkdownSplitter } from '../../lib/markdown/splitter';
import { useVirtualizedMarkdown } from './VirtualizedMarkdown';

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
    const vm = useVirtualizedMarkdown();

    useEffect(() => {
        if (!currentNote) {
            setHeaders([]);
            return;
        }

        const extracted: Header[] = [];
        const blocks = currentNote.blocks || [];

        blocks.forEach((block) => {
            if (!block.heading || !block.heading.slug) return;
            extracted.push({
                id: block.heading.slug,
                text: block.heading.text,
                level: block.heading.level,
            });
        });

        setHeaders((prev) => (headersAreEqual(prev, extracted) ? prev : extracted));
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
        if (vm) {
            vm.ensureBlockVisible({ headingSlug: id, align: 'start' });

            // Apply highlight after the target block has had a chance to mount and scroll
            setTimeout(() => {
                const element = document.getElementById(id) as HTMLElement | null;
                if (!element) return;

                element.classList.add('toc-target-highlight');
                setTimeout(() => {
                    element.classList.remove('toc-target-highlight');
                }, 1500);
            }, 200);

            return;
        }

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

        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });

        element.classList.add('toc-target-highlight');
        setTimeout(() => {
            element.classList.remove('toc-target-highlight');
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

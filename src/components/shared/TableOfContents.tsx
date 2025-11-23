import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { MarkdownSplitter } from '../../lib/markdown/splitter';

interface Header {
    id: string;
    text: string;
    level: number;
}

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

        setHeaders(extracted);
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
        const element = document.getElementById(id);

        if (!container || !element) {
            console.warn(`[TableOfContents] Scroll target not found for id "${id}"`);
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const currentScroll = container.scrollTop;
        const offset = 80;
        const targetScrollTop = currentScroll + (elementRect.top - containerRect.top) - offset;

        container.scrollTo({
            top: Math.max(targetScrollTop, 0),
            behavior: 'smooth',
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

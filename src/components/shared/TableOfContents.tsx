import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';

interface Header {
    id: string;
    text: string;
    level: number;
}

export const TableOfContents = () => {
    const { currentNote } = useAppStore();
    const [headers, setHeaders] = useState<Header[]>([]);

    useEffect(() => {
        if (!currentNote?.content) return;

        const lines = currentNote.content.split('\n');
        const extracted: Header[] = [];

        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,3})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                // Create a simple ID based on text
                const id = text.toLowerCase().replace(/[^\w]+/g, '-');
                extracted.push({ id, text, level });
            }
        });

        setHeaders(extracted);
    }, [currentNote]);

    if (headers.length === 0) return null;

    const scrollToHeader = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
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
                        
                        <span className="truncate opacity-60 group-hover:opacity-100 group-hover:text-primary-content transition-all text-xs font-medium">
                            {header.text}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

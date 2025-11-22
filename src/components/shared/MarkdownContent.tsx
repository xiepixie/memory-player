import ReactMarkdown, { Components } from 'react-markdown';
import { MarkdownImage } from './MarkdownImage';
import clsx from 'clsx';
import remarkGfm from 'remark-gfm';
import { useRef } from 'react';

import { generateSlug } from '../../lib/stringUtils';

interface MarkdownContentProps {
    content: string;
    components?: Components;
    className?: string;
    disableIds?: boolean;
}

const extractText = (children: any): string => {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (children?.props?.children) return extractText(children.props.children);
    return '';
};

export const MarkdownContent = ({ content, components, className, disableIds = false }: MarkdownContentProps) => {
    const slugCounts = useRef<Record<string, number>>({});
    // Reset slug counts on every render to ensure IDs are deterministic for the current content
    slugCounts.current = {};

    const generateId = (children: any) => {
        if (disableIds) return undefined;
        
        const text = extractText(children);
        const baseSlug = generateSlug(text);
        
        if (!baseSlug) return undefined;

        const count = slugCounts.current[baseSlug] || 0;
        slugCounts.current[baseSlug] = count + 1;
        
        return count === 0 ? baseSlug : `${baseSlug}-${count}`;
    };

    return (
        <div className={clsx("font-sans leading-loose text-lg text-base-content/90", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    img: MarkdownImage,
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-6 rounded-lg border border-base-content/10 shadow-sm">
                            <table className="table table-zebra w-full bg-base-100 text-left">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-base-200/70 text-base-content font-bold border-b border-base-content/20">{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => <tr className="border-b border-base-content/10 last:border-none hover:bg-base-200/40 transition-colors">{children}</tr>,
                    th: ({ children }) => <th className="px-4 py-3 text-sm font-bold tracking-wide whitespace-nowrap align-middle">{children}</th>,
                    td: ({ children }) => <td className="px-4 py-3 text-sm align-top leading-relaxed">{children}</td>,
                    h1: ({ children }) => {
                        const id = generateId(children);
                        return <h1 id={id} className="font-serif text-3xl font-bold mt-8 mb-4 text-base-content scroll-mt-20">{children}</h1>;
                    },
                    h2: ({ children }) => {
                        const id = generateId(children);
                        return <h2 id={id} className="font-serif text-2xl font-bold mt-6 mb-3 text-base-content/90 border-b border-base-content/10 pb-2 scroll-mt-20">{children}</h2>;
                    },
                    h3: ({ children }) => {
                         const id = generateId(children);
                        return <h3 id={id} className="font-serif text-xl font-bold mt-5 mb-2 text-base-content/80 scroll-mt-20">{children}</h3>;
                    },
                    h4: ({ children }) => {
                        const id = generateId(children);
                        return <h4 id={id} className="font-bold mt-4 mb-2 text-base-content/80 scroll-mt-20">{children}</h4>;
                    },
                    p: ({ children }) => <p className="mb-4 leading-8">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-outside ml-6 mb-4 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-outside ml-6 mb-4 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="pl-1">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-4 bg-base-200/30 italic text-base-content/70 rounded-r">
                            {children}
                        </blockquote>
                    ),
                    code: ({ className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
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
                    a: ({ href, children }) => {
                        if (href?.startsWith('#cloze-')) {
                            // Parse format: #cloze-1-Hint%20Text or #cloze-1
                            const parts = href.replace('#cloze-', '').split('-');
                            const id = parts[0];
                            const hint = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : undefined;
                            
                            return (
                                <span 
                                    id={`cloze-item-${id}`}
                                    data-cloze-id={id}
                                    className="inline-flex items-center gap-1.5 mx-1 align-baseline group relative cursor-help transition-all"
                                    title={hint ? `Hint: ${hint}` : `Cloze #${id}`}
                                >
                                    <span className="badge badge-neutral badge-sm font-mono font-bold h-5 px-1.5 rounded text-[10px] text-neutral-content/80">
                                        {id}
                                    </span>
                                    <span className={clsx(
                                        "font-medium px-1 rounded transition-colors border-b-2 border-transparent",
                                        "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
                                    )}>
                                        {children}
                                    </span>
                                    {hint && (
                                        <span className="sr-only">Hint: {hint}</span>
                                    )}
                                </span>
                            );
                        }
                        
                        // Legacy/explicit highlight format used by ==text== in parser
                        if (href === '#highlight') {
                            return (
                                <span className="border-b-2 border-primary/60 pb-0.5 text-primary">
                                    {children}
                                </span>
                            );
                        }
                        return <a href={href} className="link link-primary" target={href?.startsWith('http') ? "_blank" : undefined}>{children}</a>;
                    },
                    strong: ({ children }) => <strong className="font-bold text-primary/90">{children}</strong>,
                    hr: () => <hr className="my-8 border-base-content/10" />,
                    ...components,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

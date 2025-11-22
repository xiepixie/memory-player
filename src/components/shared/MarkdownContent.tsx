import ReactMarkdown, { Components } from 'react-markdown';
import { MarkdownImage } from './MarkdownImage';
import clsx from 'clsx';

interface MarkdownContentProps {
    content: string;
    components?: Components;
    className?: string;
}

const slugify = (text: string) => {
    return text.toLowerCase().replace(/[^\w]+/g, '-');
};

export const MarkdownContent = ({ content, components, className }: MarkdownContentProps) => {
    return (
        <div className={clsx("font-sans leading-loose text-lg text-base-content/90", className)}>
            <ReactMarkdown
                components={{
                    img: MarkdownImage,
                    h1: ({ children }) => {
                        const id = typeof children === 'string' ? slugify(children) : undefined;
                        return <h1 id={id} className="font-serif text-3xl font-bold mt-8 mb-4 text-base-content scroll-mt-20">{children}</h1>;
                    },
                    h2: ({ children }) => {
                        const id = typeof children === 'string' ? slugify(children) : undefined;
                        return <h2 id={id} className="font-serif text-2xl font-bold mt-6 mb-3 text-base-content/90 border-b border-base-content/10 pb-2 scroll-mt-20">{children}</h2>;
                    },
                    h3: ({ children }) => {
                         const id = typeof children === 'string' ? slugify(children) : undefined;
                        return <h3 id={id} className="font-serif text-xl font-bold mt-5 mb-2 text-base-content/80 scroll-mt-20">{children}</h3>;
                    },
                    h4: ({ children }) => {
                        const id = typeof children === 'string' ? slugify(children) : undefined;
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

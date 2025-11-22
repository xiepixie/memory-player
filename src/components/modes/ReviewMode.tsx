import { useAppStore } from '../../store/appStore';
import ReactMarkdown from 'react-markdown';
import { MarkdownImage } from '../shared/MarkdownImage';

export const ReviewMode = () => {
  const { currentNote } = useAppStore();

  if (!currentNote) return null;

  return (
    <div className="prose prose-lg max-w-4xl mx-auto py-10 px-6">
      <h1 className="font-serif mb-4 text-4xl border-b pb-4 border-base-content/10">
        {currentNote.frontmatter.title || 'Untitled Note'}
      </h1>
      <div className="font-sans leading-relaxed opacity-90">
        <ReactMarkdown
          components={{
            img: MarkdownImage
          }}
        >
          {cleanContent(currentNote.content)}
        </ReactMarkdown>
      </div>
    </div>
  );
};

function cleanContent(content: string): string {
    let cleaned = content.replace(/\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/g, '$1');
    return cleaned;
}

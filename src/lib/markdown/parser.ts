import matter from 'gray-matter';
import { ClozeUtils } from './clozeUtils';

export interface ParsedNote {
  content: string;
  frontmatter: Record<string, any>;
  hints: string[];
  clozes: ClozeItem[];
  raw: string;
  renderableContent: string; // Content with clozes replaced by [Answer](#cloze-id) for rendering
}

export interface ClozeItem {
  id: number;
  original: string; // {{c1::Answer}}
  answer: string;   // Answer
  hint?: string;    // Hint if {{c1::Answer::Hint}}
}

export const parseNote = (rawMarkdown: string): ParsedNote => {
  const { content, data: frontmatter } = matter(rawMarkdown);

  // Extract hints from frontmatter
  let hints: string[] = [];
  if (frontmatter.hints && Array.isArray(frontmatter.hints)) {
    hints = frontmatter.hints;
  } else if (frontmatter.hint && typeof frontmatter.hint === 'string') {
    hints = [frontmatter.hint];
  }

  const clozes: ClozeItem[] = [];
  
  // 1. Parse Anki-style clozes: {{c1::Answer::Hint}}
  // We replace them in renderableContent with a special link format for ReactMarkdown
  let renderableContent = content.replace(ClozeUtils.CLOZE_REGEX, (match, idStr, answer, hint) => {
    const id = parseInt(idStr, 10);
    clozes.push({
      id,
      original: match,
      answer,
      hint
    });
    // Replace with link syntax: [Answer](#cloze-id-hint) or [Answer](#cloze-id)
    const hash = hint ? `#cloze-${id}-${encodeURIComponent(hint)}` : `#cloze-${id}`;
    return `[${answer}](${hash})`;
  });

  // 2. Parse Legacy Highlighting: ==Answer==
  // We assign them IDs starting after the highest Anki ID found
  let maxId = clozes.reduce((max, c) => Math.max(max, c.id), 0);
  let legacyIdCounter = maxId + 1;

  const highlightRegex = /==(.*?)==/g;
  renderableContent = renderableContent.replace(highlightRegex, (match, answer) => {
      const id = legacyIdCounter++;
      clozes.push({
          id,
          original: match,
          answer,
          hint: undefined
      });
      return `[${answer}](#cloze-${id})`;
  });

  return {
    content, // Original content minus frontmatter
    frontmatter,
    hints,
    clozes,
    raw: rawMarkdown,
    renderableContent
  };
};

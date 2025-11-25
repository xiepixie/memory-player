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

/**
 * Parse raw markdown into a structured note object.
 */
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

  // Before parsing clozes, pre-mark any dangling closing braces `}}` that
  // are not part of valid/malformed cloze patterns. This keeps the
  // rendering and toolbar statistics in sync because both rely on
  // ClozeUtils.findDanglingClosers with the same ordering.
  const dangling = ClozeUtils.findDanglingClosers(content);
  let renderSource = content;

  if (dangling.length > 0) {
    let built = '';
    let last = 0;
    dangling.forEach((entry, idx) => {
      built += content.slice(last, entry.index);
      built += `[}}](#error-dangling-${idx})`;
      last = entry.index + 2; // skip the original '}}'
    });
    built += content.slice(last);
    renderSource = built;
  }

  // 1. Parse Anki-style clozes: {{c1::Answer::Hint}}
  // We replace them in renderableContent with a special link format for ReactMarkdown
  let renderableContent = renderSource.replace(ClozeUtils.CLOZE_REGEX, (match, idStr, answer, hint) => {
    const id = parseInt(idStr, 10);
    clozes.push({
      id,
      original: match,
      answer,
      hint
    });

    if (typeof answer === 'string') {
      const trimmed = answer.trim();
        // Special handling for full $$...$$ math clozes: convert to a fenced code block
      // with language "math-cloze-{id}" so ReactMarkdown can delegate to a custom
      // renderer without interfering with remark-math/rehype-katex.
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
        const inner = trimmed.slice(2, -2).trim();
        // Produces a block like:
        // ```math-cloze-4\n<latex here>\n```\n
        return '```math-cloze-' + id + '\n' + inner + '\n```\n';
      }
    }

    // Replace with link syntax: [Answer](#cloze-id-hint) or [Answer](#cloze-id)
    const hash = hint ? `#cloze-${id}-${encodeURIComponent(hint)}` : `#cloze-${id}`;
    return `[${answer}](${hash})`;
  });

  // We also want to surface broken clozes in the preview and be able to
  // map each error back to a specific occurrence in the editor.
  // To do that, we encode an ordinal index into the hash so the
  // EditMode can use the same ordering when scanning the raw text.

  let unclosedErrorIndex = 0;
  let malformedErrorIndex = 0;

  // 2. Highlight Unclosed Clozes (Leftover opening tags)
  // Any {{cN:: that remains is unclosed because the main regex matches balanced pairs
  renderableContent = renderableContent.replace(/{{c(\d+)::/g, (match) => {
      const idx = unclosedErrorIndex++;
      return `[${match}](#error-unclosed-${idx})`;
  });

  // 3. Highlight Malformed Clozes (e.g. {{c1:Answer}} missing double colon)
  // We look for {{c followed by digits but NOT followed by ::
  renderableContent = renderableContent.replace(/{{c(\d+)(?![::])([^}]*)}}/g, (match) => {
       const idx = malformedErrorIndex++;
       return `[${match}](#error-malformed-${idx})`;
  });

  // 4. Parse Legacy Highlighting: ==Answer==
  // Render as visual highlight only (no additional cloze IDs)
  const highlightRegex = /==(.*?)==/g;
  renderableContent = renderableContent.replace(highlightRegex, (_match, answer) => {
      return `[${answer}](#highlight)`;
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

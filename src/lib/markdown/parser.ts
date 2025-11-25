import matter from 'gray-matter';
import { ClozeUtils } from './clozeUtils';
import { generateSlug } from '../stringUtils';

export interface ParsedNote {
  content: string;
  frontmatter: Record<string, any>;
  hints: string[];
  clozes: ClozeItem[];
  raw: string;
  renderableContent: string; // Content with clozes replaced by [Answer](#cloze-id) for rendering
  blocks: MarkdownBlock[];
}

export interface ClozeItem {
  id: number;
  original: string; // {{c1::Answer}}
  answer: string;   // Answer
  hint?: string;    // Hint if {{c1::Answer::Hint}}
}

export interface MarkdownBlock {
  id: string;
  content: string;
  startLine: number;
  endLine: number;
  heading?: {
    level: number;
    text: string;
    slug: string;
  };
  hasCloze: boolean;
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
  const clozeOccurrences: Record<number, number> = {};

  const nextOccurrence = (id: number) => {
    const current = clozeOccurrences[id] ?? 0;
    clozeOccurrences[id] = current + 1;
    return current;
  };

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

    const occurrence = nextOccurrence(id);
    const occurrenceSuffix = `-o${occurrence}`;

    if (typeof answer === 'string') {
      const trimmed = answer.trim();
        // Special handling for full $$...$$ math clozes: convert to a fenced code block
      // with language "math-cloze-{id}" so ReactMarkdown can delegate to a custom
      // renderer without interfering with remark-math/rehype-katex.
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
        const inner = trimmed.slice(2, -2).trim();
        // Produces a block like:
        // ```math-cloze-4\n<latex here>\n```\n
        return `\u0060\u0060\u0060math-cloze-${id}${occurrenceSuffix}\n${inner}\n\u0060\u0060\u0060\n`;
      }
    }

    // Replace with link syntax: [Answer](#cloze-id-hint) or [Answer](#cloze-id)
    const hintPart = hint ? `-${encodeURIComponent(hint)}` : '';
    const hash = `#cloze-${id}${occurrenceSuffix}${hintPart}`;
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

  const blocks = buildBlocks(renderableContent);

  return {
    content, // Original content minus frontmatter
    frontmatter,
    hints,
    clozes,
    raw: rawMarkdown,
    renderableContent,
    blocks
  };
};

const buildBlocks = (markdown: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split('\n');
  let currentLines: string[] = [];
  let blockStartLine = 0;
  let inFence = false;
  let fenceMarker: string | null = null;
  const slugCounts: Record<string, number> = {};

  const pushBlock = (endLine: number, heading?: MarkdownBlock['heading']) => {
    if (currentLines.length === 0 && !heading) {
      return;
    }

    const content = currentLines.join('\n').trimEnd();
    currentLines = [];

    if (!content && !heading) {
      return;
    }

    const hasCloze = /#cloze-|math-cloze-/.test(content);
    blocks.push({
      id: `block-${blocks.length}`,
      content,
      startLine: blockStartLine,
      endLine,
      heading,
      hasCloze,
    });
  };

  const getHeadingInfo = (level: number, text: string) => {
    const baseSlug = generateSlug(text);
    if (!baseSlug) {
      return { level, text, slug: '' };
    }
    const count = slugCounts[baseSlug] || 0;
    slugCounts[baseSlug] = count + 1;
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    return { level, text, slug };
  };

  lines.forEach((line, index) => {
    const trimmed = line.trimEnd();
    const headingMatch = !inFence && trimmed.match(/^(#{1,6})\s+(.+)$/);

    const fenceMatch = line.match(/^(```+|~~~+)(.*)$/);
    if (!inFence && fenceMatch) {
      inFence = true;
      fenceMarker = fenceMatch[1];
    } else if (inFence && fenceMarker && line.startsWith(fenceMarker)) {
      inFence = false;
      fenceMarker = null;
    }

    const isBlankLine = !inFence && trimmed === '';

    if (headingMatch) {
      pushBlock(index - 1);
      const [, hashes, headingText] = headingMatch;
      const headingInfo = getHeadingInfo(hashes.length, headingText.trim());
      currentLines = [line];
      blockStartLine = index;
      pushBlock(index, headingInfo);
      currentLines = [];
      blockStartLine = index + 1;
      return;
    }

    if (isBlankLine) {
      pushBlock(index);
      blockStartLine = index + 1;
      return;
    }

    if (currentLines.length === 0) {
      blockStartLine = index;
    }

    currentLines.push(line);
  });

  pushBlock(lines.length - 1);
  return blocks;
};

export const buildMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  return buildBlocks(markdown);
};

import matter from 'gray-matter';

export interface ParsedNote {
  content: string;
  frontmatter: Record<string, any>;
  hints: string[];
  clozes: ClozeItem[];
  raw: string;
}

export interface ClozeItem {
  id: number;
  original: string; // {{c1::Answer}}
  answer: string;   // Answer
  hint?: string;    // Hint if {{c1::Answer::Hint}}
}

export const parseNote = (rawMarkdown: string): ParsedNote => {
  const { content, data: frontmatter } = matter(rawMarkdown);

  // Extract hints from frontmatter if they exist (e.g. 'hints' list or single 'hint')
  let hints: string[] = [];
  if (frontmatter.hints && Array.isArray(frontmatter.hints)) {
    hints = frontmatter.hints;
  } else if (frontmatter.hint && typeof frontmatter.hint === 'string') {
    hints = [frontmatter.hint];
  }

  // Parse Clozes
  // Regex to match {{cNUMBER::ANSWER(::HINT)?}}
  // Also support ==Answer== style as c1

  const clozes: ClozeItem[] = [];
  let clozeCount = 0;

  // Standard Anki-style clozes
  const ankiRegex = /\{\{c(\d+)::(.*?)(::(.*?))?\}\}/g;
  let match;

  // We don't replace the content here, we just identify them.
  // The renderer will handle replacement/wrapping.
  while ((match = ankiRegex.exec(content)) !== null) {
    clozes.push({
      id: parseInt(match[1], 10),
      original: match[0],
      answer: match[2],
      hint: match[4]
    });
  }

  // ==Highlight== style -> Treat as c1 (or incremental if we want)
  // Let's treat them as c1 for now, or auto-increment?
  // Requirement says: Parse {{c1::...}} and ==...== into interactive "Bubbles".
  const highlightRegex = /==(.*?)==/g;
  while ((match = highlightRegex.exec(content)) !== null) {
    clozeCount++;
    // Assign a virtual ID starting from max existing or just 1?
    // If user mixes them, it might be confusing. Let's assign 1 for highlights for simplicity,
    // or max+1.
    // Let's just say highlights are always "Active" clozes.
    clozes.push({
      id: 1, // Defaulting highlights to group 1
      original: match[0],
      answer: match[1],
      hint: undefined
    });
  }

  return {
    content, // Content WITHOUT frontmatter
    frontmatter,
    hints,
    clozes,
    raw: rawMarkdown
  };
};

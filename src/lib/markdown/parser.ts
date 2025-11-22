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
  // Only support ==Answer== style
  const clozes: ClozeItem[] = [];
  let clozeIdCounter = 1;

  const highlightRegex = /==(.*?)==/g;
  let match;
  while ((match = highlightRegex.exec(content)) !== null) {
    clozes.push({
      id: clozeIdCounter++,
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

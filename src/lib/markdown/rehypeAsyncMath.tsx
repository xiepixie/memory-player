/**
 * rehypeAsyncMath - Custom rehype plugin for async KaTeX rendering
 * 
 * Replaces rehype-katex with a plugin that outputs custom elements,
 * which are then rendered by React components using Web Worker.
 * 
 * Flow:
 * 1. remark-math parses $...$ and $$...$$ into math nodes
 * 2. remarkRehype converts MDAST to HAST (math nodes become elements)
 * 3. This plugin converts math elements to <math-inline> and <math-block>
 * 4. React components (MathInline, MathBlock) render them async
 */

import { visit } from 'unist-util-visit';
import type { Root, Element, Text } from 'hast';

/**
 * Extract text content from HAST node children
 */
function extractText(node: Element): string {
  let text = '';
  
  const extractFromChildren = (children: (Element | Text | any)[]): void => {
    for (const child of children) {
      if (child.type === 'text') {
        text += child.value;
      } else if (child.type === 'element' && child.children) {
        extractFromChildren(child.children);
      }
    }
  };
  
  if (node.children) {
    extractFromChildren(node.children);
  }
  
  return text;
}

/**
 * Check if element is a math element from remark-math
 */
function isMathElement(node: Element): boolean {
  const className = node.properties?.className;
  if (!className) return false;
  
  if (Array.isArray(className)) {
    return className.includes('math') || 
           className.includes('math-inline') || 
           className.includes('math-display');
  }
  
  if (typeof className === 'string') {
    return className.includes('math');
  }
  
  return false;
}

/**
 * Determine if math is display mode (block) or inline
 * 
 * Detection methods:
 * 1. className contains 'math-display' (remark-math standard)
 * 2. Element is wrapped in a 'div' (some versions of remark-math)
 * 3. Parent is a 'p' but this node is the only child (block math in paragraph)
 */
function isDisplayMath(node: Element): boolean {
  // Method 1: Check tagName - display math often uses 'div', inline uses 'span'
  if (node.tagName === 'div') return true;
  
  // Method 2: Check className
  const className = node.properties?.className;
  if (className) {
    if (Array.isArray(className)) {
      if (className.includes('math-display')) return true;
    } else if (typeof className === 'string') {
      if (className.includes('math-display')) return true;
    }
  }
  
  // Method 3: Check data attribute (some remark-math versions use this)
  const dataMeta = node.properties?.dataMeta;
  if (dataMeta === 'display' || dataMeta === 'math display') return true;
  
  return false;
}

/**
 * rehype plugin that converts math elements to custom elements
 * 
 * Usage:
 * ```tsx
 * import { rehypeAsyncMath } from './rehypeAsyncMath';
 * 
 * <ReactMarkdown
 *   remarkPlugins={[remarkMath]}
 *   rehypePlugins={[rehypeAsyncMath, rehypeRaw]}
 *   components={{
 *     'math-inline': MathInline,
 *     'math-block': MathBlock,
 *   }}
 * >
 *   {content}
 * </ReactMarkdown>
 * ```
 */
export function rehypeAsyncMath() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (!isMathElement(node)) return;
      
      const latex = extractText(node);
      const isDisplay = isDisplayMath(node);
      
      // DEBUG: Log node info to help diagnose display math detection issues
      // console.log('[rehypeAsyncMath]', { 
      //   tagName: node.tagName, 
      //   className: node.properties?.className, 
      //   isDisplay, 
      //   latex: latex.slice(0, 30) 
      // });
      
      // Replace with custom element
      const customElement: Element = {
        type: 'element',
        tagName: isDisplay ? 'math-block' : 'math-inline',
        properties: {
          latex: latex,
        },
        children: [],
      };
      
      // Replace in parent
      if (parent && typeof index === 'number') {
        (parent as Element).children[index] = customElement;
      }
    });
  };
}

/**
 * React component props for math elements
 */
export interface MathComponentProps {
  latex: string;
}

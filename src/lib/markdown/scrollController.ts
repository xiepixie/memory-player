/**
 * Scroll Controller
 * 
 * Abstraction layer for scroll operations that works with both
 * virtualized and non-virtualized rendering modes.
 * 
 * In virtualized mode, uses TanStack Virtual's scrollToIndex.
 * In full render mode, uses native DOM scrollIntoView.
 */

import type { Block } from './astCache';

export interface ScrollOptions {
  behavior?: 'auto' | 'smooth';
  block?: 'start' | 'center' | 'end' | 'nearest';
}

/**
 * Scroll Controller class
 * 
 * Manages scroll operations for markdown content, supporting both
 * virtualized and full render modes.
 */
class ScrollController {
  private blocks: Block[] = [];
  private scrollToIndex: ((index: number, options?: { align?: 'start' | 'center' | 'end' }) => void) | null = null;
  private mode: 'virtualized' | 'full' = 'full';
  
  /**
   * Configure for virtualized mode
   */
  setVirtualized(
    blocks: Block[],
    scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void
  ): void {
    this.blocks = blocks;
    this.scrollToIndex = scrollToIndex;
    this.mode = 'virtualized';
  }
  
  /**
   * Configure for full render mode
   */
  setFullRender(blocks: Block[]): void {
    this.blocks = blocks;
    this.scrollToIndex = null;
    this.mode = 'full';
  }
  
  /**
   * Clear configuration
   */
  clear(): void {
    this.blocks = [];
    this.scrollToIndex = null;
    this.mode = 'full';
  }
  
  /**
   * Find block index by heading ID
   */
  private findBlockByHeadingId(id: string): number {
    return this.blocks.findIndex(b => b.headingId === id);
  }
  
  /**
   * Find block index containing an element ID
   */
  private findBlockByElementId(id: string): number {
    // For headings, the element ID is the headingId
    const headingBlock = this.findBlockByHeadingId(id);
    if (headingBlock !== -1) return headingBlock;
    
    // For other elements, we need to search DOM
    // This only works in full render mode
    if (this.mode === 'full') {
      const element = document.getElementById(id);
      if (element) {
        const blockElement = element.closest('[data-block-index]');
        if (blockElement) {
          const index = parseInt(blockElement.getAttribute('data-block-index') || '-1', 10);
          return index;
        }
      }
    }
    
    return -1;
  }
  
  /**
   * Scroll to heading by ID
   */
  scrollToHeading(id: string, options: ScrollOptions = {}): void {
    this.scrollToElement(id, options);
  }
  
  /**
   * Scroll to element by ID
   */
  scrollToElement(id: string, options: ScrollOptions = {}): void {
    const blockIndex = this.findBlockByElementId(id);
    
    // Full render mode: direct scroll
    if (this.mode === 'full' || blockIndex === -1) {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({
          behavior: options.behavior ?? 'smooth',
          block: options.block ?? 'center',
        });
      }
      return;
    }
    
    // Virtualized mode: scroll to block first
    if (this.scrollToIndex) {
      const align = options.block === 'start' ? 'start' : 
                    options.block === 'end' ? 'end' : 'center';
      this.scrollToIndex(blockIndex, { align });
    }
    
    // After virtualizer scrolls, fine-tune to exact element
    // Use polling with RAF instead of hardcoded timeout
    const waitForElement = (attempts = 0) => {
      requestAnimationFrame(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: options.block ?? 'center',
          });
        } else if (attempts < 10) {
          // Retry up to 10 times (~160ms max at 60fps)
          waitForElement(attempts + 1);
        }
      });
    };
    waitForElement();
  }
  
  /**
   * Scroll to block by index
   */
  scrollToBlock(blockIndex: number, options: ScrollOptions = {}): void {
    if (this.scrollToIndex) {
      const align = options.block === 'start' ? 'start' : 
                    options.block === 'end' ? 'end' : 'center';
      this.scrollToIndex(blockIndex, { align });
    }
  }
  
  /**
   * Get element position (with virtualization awareness)
   */
  async getElementPosition(id: string): Promise<DOMRect | null> {
    const blockIndex = this.findBlockByElementId(id);
    
    if (blockIndex !== -1 && this.scrollToIndex) {
      // Scroll to make element visible
      this.scrollToIndex(blockIndex, { align: 'center' });
      
      // Wait for element to appear using RAF polling
      const waitForRender = (): Promise<void> => new Promise(resolve => {
        const check = (attempts = 0) => {
          requestAnimationFrame(() => {
            if (document.getElementById(id) || attempts >= 10) {
              resolve();
            } else {
              check(attempts + 1);
            }
          });
        };
        check();
      });
      await waitForRender();
    }
    
    const element = document.getElementById(id);
    return element ? element.getBoundingClientRect() : null;
  }
  
  /**
   * Check if element is visible
   */
  isElementVisible(id: string): boolean {
    const element = document.getElementById(id);
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }
  
  /**
   * Get current mode
   */
  getMode(): 'virtualized' | 'full' {
    return this.mode;
  }
}

// Singleton instance for virtualized scroll operations
export const virtualScrollController = new ScrollController();

// Export class for custom instances if needed
export { ScrollController };

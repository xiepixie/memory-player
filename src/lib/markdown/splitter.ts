export interface CardData {
    blockId: string; // Using UUID for stable block identification
    contentRaw: string; // The segment text
    sectionPath: string[]; // Header path e.g. ["Chapter 1", "Intro"]
    tags: string[];
    clozeIds: number[]; // Which clozes are in this block
}

export class MarkdownSplitter {
    /**
     * Splits a markdown document into logical blocks (paragraphs/sections).
     * Only blocks containing clozes are extracted as cards.
     */
    static split(content: string, globalTags: string[] = []): CardData[] {
        const lines = content.split('\n');
        const cards: CardData[] = [];
        let currentBlockLines: string[] = [];
        
        // Header path stack: { level: number, title: string }
        const headerStack: { level: number, title: string }[] = [];

        // Helper to process a completed block
        const processBlock = () => {
            if (currentBlockLines.length === 0) return;
            
            const blockText = currentBlockLines.join('\n').trim();
            // Check if block has clozes
            const clozes = MarkdownSplitter.extractClozeIds(blockText);
            
            if (clozes.length > 0 && blockText.length > 0) {
                // Construct path string array from stack
                const currentPath = headerStack.map(h => h.title);

                // Generate stable Block ID using content + index (to avoid collisions for identical paragraphs)
                const blockId = MarkdownSplitter.generateStableId(blockText, cards.length);

                cards.push({
                    blockId,
                    contentRaw: blockText,
                    sectionPath: currentPath,
                    tags: [...globalTags],
                    clozeIds: clozes
                });
            }
            
            currentBlockLines = [];
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Header detection
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                processBlock(); // Flush previous block content belonging to previous section
                
                const level = headerMatch[1].length;
                const title = headerMatch[2].trim();
                
                // Update stack
                // Pop headers that are deeper or same level as current
                while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
                    headerStack.pop();
                }
                headerStack.push({ level, title });
            } 
            else if (line.trim() === '' || line.trim() === '---') {
                // Paragraph break or HR
                processBlock();
            } else {
                currentBlockLines.push(line);
            }
        }
        
        processBlock(); // Flush last block
        
        return cards;
    }

    private static extractClozeIds(text: string): number[] {
        const ids = new Set<number>();
        const matches = text.matchAll(/{{c(\d+)::/g);
        for (const m of matches) {
            ids.add(parseInt(m[1], 10));
        }
        
        return Array.from(ids).sort((a, b) => a - b);
    }

    /**
     * Flattens block-based data into card-based rows for the database.
     * Solves the granularity mismatch: 1 Block (N clozes) -> N DB Rows.
     */
    static flattenToCards(noteId: string, blocks: CardData[]): any[] {
        return blocks.flatMap(block => {
            return block.clozeIds.map(clozeIndex => ({
                note_id: noteId,
                cloze_index: clozeIndex,
                block_id: block.blockId,
                content_raw: block.contentRaw,
                section_path: block.sectionPath,
                tags: block.tags
            }));
        });
    }

    /**
     * Generates a deterministic short ID based on content and salt (index).
     * Uses FNV-1a hash algorithm implementation for performance and simplicity.
     */
    private static generateStableId(content: string, salt: number): string {
        const str = `${content}-${salt}`;
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        // Convert to positive hex string
        return (hash >>> 0).toString(16).padStart(8, '0');
    }
}

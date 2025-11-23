export class ClozeUtils {
    // Regex to match Anki-style clozes.
    // Crucially, we disallow nested '{{' inside the content to prevent greedy matching
    // from swallowing subsequent clozes when a closing brace is missing.
    // e.g. "{{c1::A {{c2::B}}" should NOT match as one cloze.
    static readonly CLOZE_REGEX = /{{c(\d+)::((?:(?!{{)[\s\S])*?)(?:::(.*?))?}}/g;

    /**
     * Scans the text to find the highest cloze number used so far.
     * Returns 0 if no clozes found.
     */
    static getMaxClozeNumber(text: string): number {
        let max = 0;
        const regex = /{{c(\d+)::/g;
        for (const match of text.matchAll(regex)) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > max) {
                max = num;
            }
        }
        return max;
    }

    /**
     * Wraps the selected text in Anki-style cloze syntax.
     */
    static createCloze(text: string, number: number, hint?: string): string {
        if (hint) {
            return `{{c${number}::${text}::${hint}}}`;
        }
        return `{{c${number}::${text}}}`;
    }

    /**
     * Finds the cloze ID closest to the cursor position (searching backwards).
     * Returns null if no preceding cloze is found.
     */
    static findPrecedingClozeId(text: string, cursorIndex: number): number | null {
        const head = text.substring(0, cursorIndex);
        const regex = /{{c(\d+)::/g;
        let lastId: number | null = null;
        
        for (const match of head.matchAll(regex)) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num)) {
                lastId = num;
            }
        }
        return lastId;
    }

    /**
     * Removes cloze formatting for the cloze at the cursor position.
     * Returns the modified text and the range of the unearthed content.
     */
    static unclozeAt(text: string, cursorIndex: number): { text: string; changed: boolean; range?: { start: number; end: number } } {
        const matches = Array.from(text.matchAll(ClozeUtils.CLOZE_REGEX));
        
        for (const match of matches) {
            const start = match.index!;
            const end = start + match[0].length;
            
            // If cursor is inside this cloze match
            if (cursorIndex >= start && cursorIndex <= end) {
                const answer = match[2]; // Group 2 is the answer text
                const newText = text.substring(0, start) + answer + text.substring(end);
                return {
                    text: newText,
                    changed: true,
                    range: { start, end: start + answer.length }
                };
            }
        }

        return { text, changed: false };
    }

    /**
     * Removes all clozes that overlap with the given range.
     * Keeps the answer text, removes formatting.
     */
    static removeClozesInRange(text: string, start: number, end: number): { text: string; removedCount: number } {
        // Normalize range
        const rangeStart = Math.min(start, end);
        const rangeEnd = Math.max(start, end);

        let currentText = text;
        let removedCount = 0;
        
        // We iterate backwards to avoid offsetting indices of earlier matches
        const matches = Array.from(currentText.matchAll(ClozeUtils.CLOZE_REGEX)).reverse();

        for (const match of matches) {
            const mStart = match.index!;
            const mEnd = mStart + match[0].length;

            // Check for overlap
            // Overlap exists if (RangeStart < MatchEnd) and (RangeEnd > MatchStart)
            if (rangeStart < mEnd && rangeEnd > mStart) {
                const answer = match[2];
                currentText = currentText.substring(0, mStart) + answer + currentText.substring(mEnd);
                removedCount++;
            }
        }

        return { text: currentText, removedCount };
    }

    /**
     * Renumbers all clozes sequentially starting from c1.
     * Preserves the order of appearance.
     * e.g. c5, c5, c2 -> c1, c1, c2
     */
    static normalizeClozeIds(text: string): { text: string; mapping: Map<number, number>; changed: boolean } {
        const mapping = new Map<number, number>();
        let nextId = 1;
        let changed = false;

        const newText = text.replace(/{{c(\d+)::/g, (_match, idStr) => {
            const oldId = parseInt(idStr, 10);
            let newId = mapping.get(oldId);
            
            if (newId === undefined) {
                newId = nextId++;
                mapping.set(oldId, newId);
            }

            if (newId !== oldId) {
                changed = true;
            }

            return `{{c${newId}::`;
        });

        return { text: newText, mapping, changed };
    }

    /**
     * Detects clozes that are missing a closing brace '}}' before the next opening brace '{{'.
     * Returns an array of start indices for unclosed clozes.
     */
    static findUnclosedClozes(text: string): { index: number; id: number }[] {
        const unclosed: { index: number; id: number }[] = [];
        const regex = /{{c(\d+)::/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const start = match.index;
            const id = parseInt(match[1], 10);
            
            // Look ahead from the end of the opening tag
            const searchStart = start + match[0].length;
            
            const nextClose = text.indexOf('}}', searchStart);
            const nextOpen = text.indexOf('{{', searchStart);

            // Logic:
            // 1. If no closing brace at all -> Unclosed
            // 2. If closing brace exists but a new opening brace appears BEFORE it -> Unclosed (nested/broken)
            // 3. Otherwise -> Closed
            
            if (nextClose === -1) {
                unclosed.push({ index: start, id });
            } else if (nextOpen !== -1 && nextOpen < nextClose) {
                unclosed.push({ index: start, id });
            }
        }

        return unclosed;
    }

    /**
     * Detects malformed clozes that superficially look like {{c...}} but
     * do not match the strict CLOZE_REGEX used for valid clozes.
     *
     * This mirrors the malformed pattern used in parser.ts so that the
     * toolbar stats and preview rendering stay in sync.
     */
    static findMalformedClozes(text: string): { index: number; raw: string }[] {
        const malformed: { index: number; raw: string }[] = [];
        const regex = /{{c(\d+)(?![::])([^}]*)}}/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            malformed.push({ index: match.index!, raw: match[0] });
        }

        return malformed;
    }

    /**
     * Detects dangling closing braces `}}` that are not part of any
     * recognized cloze pattern (valid or malformed). This lets the UI
     * highlight stray `}}` that often appear after editing or pasting.
     */
    static findDanglingClosers(text: string): { index: number }[] {
        const usedCloserIndices = new Set<number>();

        // 1) Mark the closing braces that belong to valid clozes
        for (const match of text.matchAll(ClozeUtils.CLOZE_REGEX)) {
            const start = match.index!;
            const full = match[0];
            const closeIndex = start + full.length - 2; // position of the '}}'
            usedCloserIndices.add(closeIndex);
        }

        // 2) Mark the closing braces that belong to malformed clozes
        const malformedRegex = /{{c(\d+)(?![::])([^}]*)}}/g;
        let malformedMatch: RegExpExecArray | null;
        while ((malformedMatch = malformedRegex.exec(text)) !== null) {
            const start = malformedMatch.index!;
            const full = malformedMatch[0];
            const closeIndex = start + full.length - 2;
            usedCloserIndices.add(closeIndex);
        }

        // 3) Any remaining `}}` is considered dangling
        const dangling: { index: number }[] = [];
        let idx = text.indexOf('}}');
        while (idx !== -1) {
            if (!usedCloserIndices.has(idx)) {
                dangling.push({ index: idx });
            }
            idx = text.indexOf('}}', idx + 2);
        }

        return dangling;
    }

    /**
     * Attempts to clean invalid cloze syntax like {{c1 Answer}} (missing colons) or {{c::Answer}} (missing id).
     * This is a conservative clean: it only fixes patterns it is sure about, otherwise leaves them alone.
     */
    static cleanInvalidClozes(text: string): { text: string; cleanedCount: number } {
        let cleanedCount = 0;
        
        // Pattern 1: {{c::Answer...}} -> Missing ID, default to c1 or just fix syntax? 
        // Decision: We can't guess ID easily, so let's maybe just remove the cloze wrapper if it's broken?
        // Actually, the user request was "Cleaning invalid / broken clozes".
        // Let's focus on removing the wrapper for clearly broken ones that MATCH the outer {{ }} but fail internal parsing.
        
        // We'll scan for {{c...}} blocks
        const newText = text.replace(/{{c[\s\S]*?}}/g, (match) => {
            // If it matches the strict CLOZE_REGEX, it's valid.
            if (/^{{c\d+::[\s\S]*?}}$/.test(match)) {
                return match;
            }

            // Otherwise it's invalid. Try to extract content.
            // Remove outer {{ and }}
            let inner = match.slice(2, -2);
            
            // If it starts with c + digits + maybe colons
            // e.g. c1 Answer -> Answer
            // e.g. c::Answer -> Answer
            
            const prefixMatch = inner.match(/^c\d*:?:?\s*/);
            if (prefixMatch) {
                cleanedCount++;
                return inner.substring(prefixMatch[0].length);
            }

            return match; // Fallback
        });

        return { text: newText, cleanedCount };
    }

    /**
     * Helper to find all start indices of a specific cloze ID in the text.
     * Used for mapping preview clicks to editor positions.
     */
    static findClozeIndices(text: string, clozeId: number): number[] {
        const indices: number[] = [];
        const regex = new RegExp(`{{c${clozeId}::`, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            indices.push(match.index);
        }
        return indices;
    }

    static findClozeByIdAndOccurrence(
        text: string,
        clozeId: number,
        occurrenceIndex: number
    ): { matchStart: number; matchEnd: number; answerStart: number; answerEnd: number; answerText: string } | null {
        const regex = new RegExp(ClozeUtils.CLOZE_REGEX.source, 'g');
        let match: RegExpExecArray | null;
        let seen = 0;

        while ((match = regex.exec(text)) !== null) {
            const id = parseInt(match[1], 10);
            if (id !== clozeId) continue;

            if (seen === occurrenceIndex) {
                const matchStart = match.index!;
                const matchEnd = matchStart + match[0].length;
                const answerText = match[2] ?? '';
                const prefix = `{{c${clozeId}::`;
                const answerStart = matchStart + prefix.length;
                const answerEnd = answerStart + answerText.length;

                return { matchStart, matchEnd, answerStart, answerEnd, answerText };
            }

            seen++;
        }

        return null;
    }
}

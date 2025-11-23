export class ClozeUtils {
    static readonly CLOZE_REGEX = /{{c(\d+)::([\s\S]*?)(?:::(.*?))?}}/g;

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
}

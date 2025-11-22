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
}

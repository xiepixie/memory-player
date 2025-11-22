export class ClozeUtils {
    static readonly CLOZE_REGEX = /{{c(\d+)::([\s\S]*?)(?:::(.*?))?}}/g;

    /**
     * Scans the text to find the highest cloze number used so far.
     * Returns 0 if no clozes found.
     */
    static getMaxClozeNumber(text: string): number {
        let max = 0;
        let match;
        // Reset lastIndex to ensure global search starts from beginning
        const regex = new RegExp(ClozeUtils.CLOZE_REGEX);
        
        while ((match = regex.exec(text)) !== null) {
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


export function cleanMarkdown(text: string): string {
    if (!text) return '';
    
    // Decode HTML entities
    const decoded = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    return decoded
        // Remove headers
        .replace(/^#+\s+/, '')
        // Remove images: ![alt](url) -> empty (or alt?) 
        // MarkdownContent extractText on image component returns empty string usually.
        .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
        // Remove links: [text](url) -> text. 
        // We handle simple balanced brackets for links to be more robust than [^\]]+
        .replace(/\[((?:[^\[\]]|\[[^\]]*\])*)\]\([^\)]+\)/g, '$1')
        // Remove bold/italic
        .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
        // Remove code blocks (inline)
        .replace(/`([^`]+)`/g, '$1')
        // Remove clozes {{c1::text::hint}} -> text
        .replace(/{{c\d+::(.*?)(?:::(.*?))?}}/g, '$1')
        // Remove highlights ==text== -> text
        .replace(/==(.*?)==/g, '$1')
        // Remove HTML tags
        .replace(/<[^>]+>/g, '')
        .trim();
}

export function generateSlug(text: string): string {
    if (!text) return '';
    
    const cleaned = cleanMarkdown(text);
    return cleaned.toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Extracts a display-friendly note title.
 * If the rawTitle looks like a filepath (contains path separators), extracts just the filename.
 * Also strips .md extension for cleaner display.
 * 
 * @param rawTitle - The raw title string (may be a filepath or actual title)
 * @param fallback - Fallback string if title is empty (default: 'Untitled Note')
 * @returns A clean display title
 */
export function getNoteDisplayTitle(rawTitle: unknown, fallback = 'Untitled Note'): string {
    if (!rawTitle || typeof rawTitle !== 'string') return fallback;
    
    // If title looks like a filepath (contains path separators), extract filename
    if (/[\\/]/.test(rawTitle)) {
        const filename = rawTitle.split(/[\\/]/).pop()?.replace(/\.md$/i, '');
        return filename || fallback;
    }
    
    return rawTitle;
}

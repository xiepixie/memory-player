/**
 * Helper to extract current theme colors for use in canvas/JS contexts
 * PERFORMANCE: Uses CSS variables with caching to avoid layout thrashing
 * DaisyUI 5 uses --color-* CSS variables in oklch format
 */

// Cache for resolved colors - avoids repeated getComputedStyle calls
let colorCache: { theme: string | null; colors: string[] } = { theme: null, colors: [] };

// Default festive colors if CSS variables unavailable
const DEFAULT_COLORS = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

// CSS variable names for DaisyUI 5 theme colors
const COLOR_VARS = [
    '--color-primary',
    '--color-secondary', 
    '--color-accent',
    '--color-info',
    '--color-success',
    '--color-warning',
    '--color-error'
];

/**
 * Convert oklch color to hex (simplified conversion for confetti)
 */
const oklchToHex = (oklch: string): string => {
    // oklch format: oklch(L% C H) or oklch(L C H)
    const match = oklch.match(/oklch\(([^)]+)\)/i);
    if (!match) return '';
    
    // For confetti, we just need approximate colors
    // Use a canvas to do the conversion (browser handles oklch)
    try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        
        ctx.fillStyle = oklch;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch {
        return '';
    }
};

export const getThemeColors = (): string[] => {
    if (typeof window === 'undefined') return DEFAULT_COLORS;

    // Check cache first
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (colorCache.theme === currentTheme && colorCache.colors.length > 0) {
        return colorCache.colors;
    }

    // Read CSS variables from computed style (single getComputedStyle call)
    const style = getComputedStyle(document.documentElement);
    const colors: string[] = [];

    for (const varName of COLOR_VARS) {
        const value = style.getPropertyValue(varName).trim();
        if (value) {
            // Convert oklch to hex if needed
            const hex = value.startsWith('oklch') ? oklchToHex(value) : value;
            if (hex && hex.startsWith('#')) {
                colors.push(hex);
            }
        }
    }

    // Update cache
    if (colors.length > 0) {
        colorCache = { theme: currentTheme, colors };
        return colors;
    }

    return DEFAULT_COLORS;
};

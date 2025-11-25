/**
 * Helper to extract current theme colors for use in canvas/JS contexts
 * Optimized for DaisyUI 5 with OKLCH color format
 */
let cachedTheme: string | null = null;
let cachedThemeColors: string[] | null = null;

const DEFAULT_CONFETTI_COLORS = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

export const getThemeColors = (forceRefresh: boolean = false): string[] => {
    if (typeof window === 'undefined') return DEFAULT_CONFETTI_COLORS;

    const themeAttr = document.documentElement?.getAttribute('data-theme') || 'night';

    // ✅ Use cache to avoid repeated computation
    if (!forceRefresh && cachedTheme === themeAttr && cachedThemeColors && cachedThemeColors.length > 0) {
        return cachedThemeColors;
    }

    const colorVars = ['primary', 'secondary', 'accent', 'info', 'success', 'warning'];
    const colors: string[] = [];

    // ✅ Read CSS variables directly from root element - only ONE getComputedStyle call
    const rootStyles = getComputedStyle(document.documentElement);

    colorVars.forEach(varName => {
        // DaisyUI 5 uses --color-{name} format
        const cssValue = rootStyles.getPropertyValue(`--color-${varName}`).trim();
        if (cssValue) {
            // Convert OKLCH to HEX
            const hexColor = oklchToHex(cssValue);
            if (hexColor) colors.push(hexColor);
        }
    });

    const filtered = colors.filter(c => c !== '');
    cachedTheme = themeAttr;
    cachedThemeColors = filtered.length > 0 ? filtered : DEFAULT_CONFETTI_COLORS;
    return cachedThemeColors;
};

/**
 * Convert OKLCH color to HEX
 * DaisyUI format: "oklch(62.9% 0.233 270.6)"
 * Uses browser native API for conversion without external dependencies
 */
const oklchToHex = (oklchString: string): string | null => {
    if (typeof window === 'undefined') return null;

    try {
        // Use canvas 2D context to get RGB values (most reliable method)
        // This avoids DOM insertion and forced reflows
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = oklchString;
        const computedColor = ctx.fillStyle; // Returns #RRGGBB format

        // Validate if it's a valid hex color
        if (/^#[0-9A-Fa-f]{6}$/.test(computedColor)) {
            return computedColor;
        }

        return null;
    } catch (e) {
        console.warn('Failed to convert OKLCH to HEX:', oklchString, e);
        return null;
    }
};

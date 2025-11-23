/**
 * Helper to extract current theme colors for use in canvas/JS contexts
 * Optimized to prevent layout thrashing and cached for performance
 */

let colorCache: { theme: string | null; colors: string[] } = {
    theme: null,
    colors: []
};

export const getThemeColors = (): string[] => {
    if (typeof window === 'undefined') return [];

    // Check cache first
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (colorCache.theme === currentTheme && colorCache.colors.length > 0) {
        return colorCache.colors;
    }

    const vars = ['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'];
    
    // Create a container that holds all test elements at once
    // This allows us to read all styles in one pass, triggering only ONE reflow
    const container = document.createElement('div');
    
    // Use absolute positioning and hidden visibility to take it out of flow
    // but keep it renderable so getComputedStyle works
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    container.style.top = '-9999px';
    container.style.left = '-9999px';

    // Batch create children
    vars.forEach(v => {
        const span = document.createElement('span');
        span.className = `text-${v}`;
        container.appendChild(span);
    });

    // Single write to DOM
    document.body.appendChild(container);

    const colors: string[] = [];
    
    // Batch read styles
    // Since we haven't modified the DOM between these reads, 
    // the browser can serve them all from the same layout snapshot.
    const children = Array.from(container.children);
    children.forEach(child => {
        const style = getComputedStyle(child);
        colors.push(rgbToHex(style.color));
    });

    // Single remove from DOM
    document.body.removeChild(container);

    const validColors = colors.filter(c => c !== '');
    
    // Update cache
    colorCache = {
        theme: currentTheme,
        colors: validColors
    };

    return validColors;
};

const rgbToHex = (rgb: string): string => {
    if (!rgb) return '';
    
    // Handle rgb(r, g, b)
    const rgbMatch = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgbMatch) {
        return "#" + 
            ("0" + parseInt(rgbMatch[1], 10).toString(16)).slice(-2) +
            ("0" + parseInt(rgbMatch[2], 10).toString(16)).slice(-2) +
            ("0" + parseInt(rgbMatch[3], 10).toString(16)).slice(-2);
    }

    // Handle rgba(r, g, b, a) - ignore alpha for confetti
    const rgbaMatch = rgb.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    if (rgbaMatch) {
         return "#" + 
            ("0" + parseInt(rgbaMatch[1], 10).toString(16)).slice(-2) +
            ("0" + parseInt(rgbaMatch[2], 10).toString(16)).slice(-2) +
            ("0" + parseInt(rgbaMatch[3], 10).toString(16)).slice(-2);
    }

    return rgb.startsWith('#') ? rgb : '';
};

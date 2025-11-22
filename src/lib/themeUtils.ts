/**
 * Helper to extract current theme colors for use in canvas/JS contexts
 */
export const getThemeColors = (): string[] => {
    if (typeof window === 'undefined') return [];

    const vars = ['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'];
    const colors: string[] = [];
    
    const temp = document.createElement('div');
    temp.style.display = 'none';
    document.body.appendChild(temp);

    vars.forEach(v => {
        temp.className = `text-${v}`;
        const style = getComputedStyle(temp);
        const rgb = style.color; // Returns "rgb(r, g, b)" or "rgba(r, g, b, a)"
        colors.push(rgbToHex(rgb));
    });

    document.body.removeChild(temp);
    return colors.filter(c => c !== '');
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

    // If it's already hex or some other format we can't parse easily, return as is (confetti might fail or default)
    // But getComputedStyle usually returns rgb/rgba
    return rgb.startsWith('#') ? rgb : '';
};

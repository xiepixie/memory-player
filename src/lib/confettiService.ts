/**
 * Confetti Service - Pre-initialized confetti for instant celebration effects
 * 
 * PERFORMANCE: This service pre-initializes confetti canvas and caches theme colors
 * during app startup, ensuring zero lag when user reveals cloze answers.
 * 
 * User Flow:
 * 1. App starts → confetti canvas created (invisible)
 * 2. Theme loads → colors cached
 * 3. User clicks cloze → instant confetti (no initialization delay)
 */

import confetti, { CreateTypes, Options } from 'canvas-confetti';

// Singleton confetti instance with pre-created canvas
let confettiInstance: CreateTypes | null = null;
let confettiCanvas: HTMLCanvasElement | null = null;

// Pre-cached theme colors (populated on init and theme change)
let cachedColors: string[] = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

// Throttle state
let lastFireTime = 0;
const THROTTLE_MS = 800; // Minimum interval between confetti bursts

/**
 * Initialize the confetti service - call this once at app startup
 * Creates a dedicated canvas for confetti rendering
 */
export function initConfetti(): void {
    if (confettiInstance) return;

    // Create dedicated canvas for confetti (avoids canvas creation on first fire)
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99999;
    `;
    document.body.appendChild(confettiCanvas);

    // Create confetti instance bound to this canvas
    confettiInstance = confetti.create(confettiCanvas, {
        resize: true,
        useWorker: true, // Use Web Worker for calculations when available
    });

    // Pre-cache theme colors
    updateThemeColors();

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                updateThemeColors();
                break;
            }
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Warm up the confetti engine with a minimal burst (invisible)
    // This pre-compiles shaders and initializes rendering pipeline
    confettiInstance({
        particleCount: 1,
        startVelocity: 0,
        gravity: 10,
        origin: { y: -1 }, // Off-screen
    });
}

/**
 * Update cached theme colors from CSS variables
 * Called on init and theme change
 */
function updateThemeColors(): void {
    const style = getComputedStyle(document.documentElement);
    const colorVars = [
        '--color-primary',
        '--color-secondary',
        '--color-accent',
        '--color-info',
        '--color-success',
        '--color-warning',
        '--color-error'
    ];

    const colors: string[] = [];
    
    // Create a single canvas context for color conversion
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (ctx) {
        for (const varName of colorVars) {
            const value = style.getPropertyValue(varName).trim();
            if (value) {
                try {
                    ctx.fillStyle = value;
                    ctx.fillRect(0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    colors.push(hex);
                } catch {
                    // Skip invalid colors
                }
            }
        }
    }

    if (colors.length > 0) {
        cachedColors = colors;
    }
}

/**
 * Fire confetti celebration - optimized for instant response
 * 
 * @param options - Optional confetti configuration overrides
 * @returns boolean - true if confetti fired, false if throttled
 */
export function fireConfetti(options?: Partial<Options>): boolean {
    // Throttle check
    const now = Date.now();
    if (now - lastFireTime < THROTTLE_MS) {
        return false;
    }
    lastFireTime = now;

    // Ensure initialized
    if (!confettiInstance) {
        initConfetti();
    }

    // Fire with optimized defaults
    confettiInstance!({
        particleCount: 35,
        spread: 55,
        startVelocity: 30,
        gravity: 1.2,
        ticks: 150, // Shorter animation duration
        origin: { y: 0.6 },
        colors: cachedColors,
        disableForReducedMotion: true,
        ...options,
    });

    return true;
}

/**
 * Fire a quick burst - even lighter than standard confetti
 * Use for rapid successive reveals
 */
export function fireQuickBurst(): boolean {
    const now = Date.now();
    if (now - lastFireTime < 400) { // Tighter throttle for quick bursts
        return false;
    }
    lastFireTime = now;

    if (!confettiInstance) {
        initConfetti();
    }

    confettiInstance!({
        particleCount: 20,
        spread: 40,
        startVelocity: 25,
        gravity: 1.5,
        ticks: 100,
        origin: { y: 0.65 },
        colors: cachedColors.slice(0, 4), // Use fewer colors
        disableForReducedMotion: true,
    });

    return true;
}

/**
 * Cleanup - remove canvas and instance
 * Call this on app unmount if needed
 */
export function destroyConfetti(): void {
    if (confettiCanvas && confettiCanvas.parentNode) {
        confettiCanvas.parentNode.removeChild(confettiCanvas);
    }
    confettiCanvas = null;
    confettiInstance = null;
}

/**
 * Get current cached colors (for debugging or external use)
 */
export function getCachedColors(): string[] {
    return [...cachedColors];
}

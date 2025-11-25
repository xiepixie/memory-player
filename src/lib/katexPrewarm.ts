import katex from 'katex';

let hasPrewarmed = false;
let prewarmInFlight = false;

const renderSample = () => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    try {
        katex.render('a^2 + b^2 = c^2', container, {
            displayMode: true,
            throwOnError: false,
        });
    } catch (error) {
        console.warn('[KaTeX] prewarm failed', error);
    } finally {
        // Give the browser a moment to cache fonts before detaching
        window.setTimeout(() => {
            container.remove();
        }, 1000);
        hasPrewarmed = true;
        prewarmInFlight = false;
    }
};

/**
 * Pre-renders a tiny KaTeX snippet offscreen so that fonts/CSS are cached
 * before the user scrolls to the first math block. Safe to call multiple times.
 */
export const prewarmKatex = () => {
    if (hasPrewarmed || prewarmInFlight) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    prewarmInFlight = true;

    const schedule = () => {
        const maybeIdle = window as Window & typeof globalThis & {
            requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
        };

        if (typeof maybeIdle.requestIdleCallback === 'function') {
            maybeIdle.requestIdleCallback(renderSample, { timeout: 2000 });
        } else {
            window.setTimeout(renderSample, 0);
        }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        schedule();
    } else {
        window.addEventListener('DOMContentLoaded', schedule, { once: true });
    }
};

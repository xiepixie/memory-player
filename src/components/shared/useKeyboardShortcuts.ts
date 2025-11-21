import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

export const useKeyboardShortcuts = () => {
    const { saveReview, viewMode, currentMetadata } = useAppStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input is focused
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Grading Shortcuts (1-4)
            if (['1', '2', '3', '4'].includes(e.key)) {
                // Only allow grading if a note is open and we have metadata (i.e., ready to grade)
                if (currentMetadata) {
                    const rating = parseInt(e.key);
                    saveReview(rating);
                }
            }

            // Spacebar Actions
            if (e.code === 'Space') {
                e.preventDefault();
                // In Cloze mode: Reveal All (or trigger click on next hidden?)
                if (viewMode === 'test') {
                    // Trigger a custom event or use a global signal?
                    // Direct store manipulation for UI state like "reveal all" is tricky without extra state.
                    // For now, let's just log or implement if we move "revealed" state to store.
                    // Ideally, the component listens to this.

                    // Option: Dispatch a window event that components listen to.
                    window.dispatchEvent(new CustomEvent('shortcut-reveal'));
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saveReview, viewMode, currentMetadata]);
};

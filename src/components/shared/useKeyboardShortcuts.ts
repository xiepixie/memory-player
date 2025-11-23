import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

export const useKeyboardShortcuts = () => {
    const viewMode = useAppStore((state) => state.viewMode);
    const saveReview = useAppStore((state) => state.saveReview);
    const isGrading = useAppStore((state) => state.isGrading);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (viewMode === 'library') {
                    window.dispatchEvent(new CustomEvent('library-focus-search'));
                }
                return;
            }

            if (e.code === 'Space') {
                if (e.repeat) return;
                e.preventDefault();
                // Dispatch custom event for ClozeMode
                window.dispatchEvent(new CustomEvent('shortcut-reveal'));
            }

            if (['review', 'test', 'master'].includes(viewMode)) {
                // Check for grading lock
                if (isGrading) return;
                if (e.repeat) return;

                switch (e.key) {
                    case '1':
                        saveReview(1);
                        break;
                    case '2':
                        saveReview(2);
                        break;
                    case '3':
                        saveReview(3);
                        break;
                    case '4':
                        saveReview(4);
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewMode, saveReview, isGrading]);
};

import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

export const useKeyboardShortcuts = () => {
    const { viewMode, saveReview } = useAppStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                // Dispatch custom event for ClozeMode
                window.dispatchEvent(new CustomEvent('shortcut-reveal'));
            }

            if (['review', 'test', 'master'].includes(viewMode)) {
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
    }, [viewMode, saveReview]);
};

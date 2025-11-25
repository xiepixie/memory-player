import { createStore, useStore } from 'zustand';
import { createContext, useContext } from 'react';

export interface ClozeState {
    revealed: Record<string, boolean>;
    currentClozeIndex: number | null;
    themeColors: string[];
}

export interface ClozeActions {
    setRevealed: (key: string, value: boolean) => void;
    toggleReveal: (key: string) => void;
    setAllRevealed: (revealed: Record<string, boolean>) => void;
    toggleAll: (allClozeKeys: string[]) => void;
    setCurrentClozeIndex: (index: number | null) => void;
    setThemeColors: (colors: string[]) => void;
    reset: () => void;
}

export type ClozeStore = ReturnType<typeof createClozeStore>;

export const createClozeStore = (
    initialProps?: Partial<ClozeState>
) => {
    return createStore<ClozeState & ClozeActions>()((set) => ({
        revealed: {},
        currentClozeIndex: null,
        themeColors: [],
        ...initialProps,

        setRevealed: (key, value) =>
            set((state) => {
                const prevValue = !!state.revealed[key];
                if (prevValue === value) {
                    // No-op: avoid emitting a new state object when nothing changes
                    return state;
                }

                const next: Record<string, boolean> = { ...state.revealed };
                next[key] = value;
                return { revealed: next };
            }),

        toggleReveal: (key) =>
            set((state) => {
                const next: Record<string, boolean> = { ...state.revealed };
                next[key] = !state.revealed[key];
                return { revealed: next };
            }),

        setAllRevealed: (revealed) => set({ revealed }),

        toggleAll: (allClozeKeys: string[]) => set((state) => {
            if (allClozeKeys.length === 0) return state;

            // Free / preview mode: operate on all occurrences
            if (state.currentClozeIndex === null) {
                const allRevealedNow = allClozeKeys.every((key) => state.revealed[key]);
                if (allRevealedNow) {
                    return { revealed: {} };
                }
                const next: Record<string, boolean> = { ...state.revealed };
                allClozeKeys.forEach((key) => {
                    next[key] = true;
                });
                return { revealed: next };
            }

            // Queue mode: only operate on occurrences of the current cloze id
            const targetKeys = allClozeKeys.filter((key) => {
                const [idStr] = key.split('-');
                const id = parseInt(idStr, 10);
                return !Number.isNaN(id) && id === state.currentClozeIndex;
            });

            if (targetKeys.length === 0) return state;

            const allTargetRevealed = targetKeys.every((key) => state.revealed[key]);
            const next: Record<string, boolean> = { ...state.revealed };

            if (allTargetRevealed) {
                // Clear only the current cloze id occurrences; keep other ids as-is
                targetKeys.forEach((key) => {
                    delete next[key];
                });
            } else {
                // Reveal all occurrences of the current cloze id
                targetKeys.forEach((key) => {
                    next[key] = true;
                });
            }

            return { revealed: next };
        }),

        setCurrentClozeIndex: (index) => set({ currentClozeIndex: index }),

        setThemeColors: (colors) => set({ themeColors: colors }),

        reset: () => set({ revealed: {}, currentClozeIndex: null, themeColors: [] }),
    }));
};

export const ClozeStoreContext = createContext<ClozeStore | null>(null);

export function useClozeStore<T>(
    selector: (state: ClozeState & ClozeActions) => T
): T {
    const store = useContext(ClozeStoreContext);
    if (!store) throw new Error('Missing ClozeStoreContext.Provider in the tree');
    return useStore(store, selector);
}

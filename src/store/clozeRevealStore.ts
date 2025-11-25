import { create } from 'zustand';

/**
 * Cloze Reveal Store
 * 
 * 专门管理 ClozeMode 的 reveal 状态，使用 Zustand 的细粒度订阅
 * 避免整个 MarkdownContent 或所有 cloze 组件在单个 cloze 状态变化时重新渲染
 * 
 * 性能特点：
 * - 每个 ClozeWithContext 使用 selector 只订阅自己的 key
 * - 当 revealed["1-0"] 变化时，只有 key="1-0" 的组件重新渲染
 */

interface ClozeRevealState {
    // 当前正在复习的 cloze ID（null = 复习全部）
    currentClozeIndex: number | null;
    // 每个 cloze 的 reveal 状态，key 格式: "id-occurrence"
    revealed: Record<string, boolean>;
}

interface ClozeRevealActions {
    // 设置当前复习的 cloze index
    setCurrentClozeIndex: (index: number | null) => void;
    // 切换单个 cloze 的 reveal 状态
    toggleReveal: (key: string) => void;
    // 批量设置 reveal 状态（用于 "Show All" / "Hide All"）
    setRevealed: (revealed: Record<string, boolean>) => void;
    // 重置所有状态（切换笔记时调用）
    reset: () => void;
}

type ClozeRevealStore = ClozeRevealState & ClozeRevealActions;

export const useClozeRevealStore = create<ClozeRevealStore>()((set, get) => ({
    currentClozeIndex: null,
    revealed: {},

    setCurrentClozeIndex: (index) => set({ currentClozeIndex: index }),

    toggleReveal: (key) => {
        const { revealed } = get();
        // 只有未 reveal 的才能 toggle（单向操作）
        if (revealed[key]) return;
        
        set({
            revealed: { ...revealed, [key]: true }
        });
    },

    setRevealed: (revealed) => set({ revealed }),

    reset: () => set({ revealed: {}, currentClozeIndex: null }),
}));

/**
 * 细粒度 selector：只订阅特定 key 的 reveal 状态
 * 
 * 使用方式：
 * const isRevealed = useIsRevealed("1-0");
 * 
 * 当 revealed["1-0"] 变化时，只有使用这个 hook 的组件重新渲染
 */
export const useIsRevealed = (key: string): boolean => {
    return useClozeRevealStore((state) => !!state.revealed[key]);
};

/**
 * 获取当前 cloze index（细粒度订阅）
 */
export const useCurrentClozeIndex = (): number | null => {
    return useClozeRevealStore((state) => state.currentClozeIndex);
};

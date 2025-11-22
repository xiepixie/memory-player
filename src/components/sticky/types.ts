export interface StickyNoteData {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'gray';
    isMinimized: boolean;
    zIndex: number;
}

export const NOTE_COLORS = {
    yellow: { bg: 'bg-[#fff7d1] dark:bg-yellow-900/80', border: 'border-yellow-200/50 dark:border-yellow-700/30', text: 'text-gray-800 dark:text-yellow-50' },
    blue: { bg: 'bg-[#e0f2fe] dark:bg-blue-900/80', border: 'border-blue-200/50 dark:border-blue-700/30', text: 'text-blue-900 dark:text-blue-50' },
    green: { bg: 'bg-[#dcfce7] dark:bg-green-900/80', border: 'border-green-200/50 dark:border-green-700/30', text: 'text-green-900 dark:text-green-50' },
    pink: { bg: 'bg-[#fce7f3] dark:bg-pink-900/80', border: 'border-pink-200/50 dark:border-pink-700/30', text: 'text-pink-900 dark:text-pink-50' },
    purple: { bg: 'bg-[#f3e8ff] dark:bg-purple-900/80', border: 'border-purple-200/50 dark:border-purple-700/30', text: 'text-purple-900 dark:text-purple-50' },
    gray: { bg: 'bg-base-200/90 dark:bg-base-300/80', border: 'border-base-300/50 dark:border-base-content/10', text: 'text-base-content' },
};

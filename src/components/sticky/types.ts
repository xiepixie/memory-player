export interface StickyNoteData {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: 'primary' | 'yellow' | 'blue' | 'green' | 'plum' | 'graphite';
    isMinimized: boolean;
    zIndex: number;
}

export const NOTE_COLORS = {
    primary: {
        bg: 'bg-primary/10 dark:bg-primary/25',
        border: 'border-primary/30 dark:border-primary/40',
        text: 'text-base-content',
    },
    yellow: {
        bg: 'bg-[#fff7d1] dark:bg-amber-900/80',
        border: 'border-amber-200/70 dark:border-amber-700/40',
        text: 'text-[#4a3b16] dark:text-amber-50',
    },
    blue: {
        bg: 'bg-sky-50 dark:bg-sky-900/70',
        border: 'border-sky-200/70 dark:border-sky-700/40',
        text: 'text-sky-900 dark:text-sky-50',
    },
    green: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/70',
        border: 'border-emerald-200/70 dark:border-emerald-700/40',
        text: 'text-emerald-900 dark:text-emerald-50',
    },
    plum: {
        bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/70',
        border: 'border-fuchsia-200/70 dark:border-fuchsia-700/40',
        text: 'text-fuchsia-900 dark:text-fuchsia-50',
    },
    graphite: {
        bg: 'bg-neutral-100 dark:bg-neutral-800/90',
        border: 'border-neutral-300/70 dark:border-neutral-600/50',
        text: 'text-neutral-800 dark:text-neutral-100',
    },
} as const;

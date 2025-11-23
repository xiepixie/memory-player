import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  info: 2500,
  success: 2500,
  warning: 4000,
  error: 6000,
};

const MAX_TOASTS = 3;
const DEDUPE_WINDOW_MS = 2000;
const lastShown: Record<string, number> = {};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration) => {
    const key = `${type}:${message}`;
    const now = Date.now();
    const last = lastShown[key];
    if (last && now - last < DEDUPE_WINDOW_MS) {
      return;
    }
    lastShown[key] = now;

    const finalDuration = duration ?? DEFAULT_DURATIONS[type];
    const id = Math.random().toString(36).substring(2, 9);

    set((state) => {
      const next = [...state.toasts, { id, message, type, duration: finalDuration }];
      if (next.length > MAX_TOASTS) {
        next.shift();
      }
      return { toasts: next };
    });

    if (finalDuration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, finalDuration);
    }
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

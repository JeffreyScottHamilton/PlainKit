import { createStore } from '@/lib/store';

// Polite live-region text for job completion and important errors only (never per-percent progress).
export const announcer = createStore({ text: '', n: 0 });
export function announce(text: string) {
  announcer.set((s) => ({ text, n: s.n + 1 }));
}

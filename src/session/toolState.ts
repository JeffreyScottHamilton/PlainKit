import { useCallback } from 'react';
import { createStore } from '@/lib/store';

// Per-tool UI state that survives route changes within the tab (memory only, cleared with the session).
const store = createStore<Record<string, unknown>>({});

export function useToolState<T extends object>(key: string, initial: T): [T, (patch: Partial<T> | ((s: T) => T)) => void] {
  const value = (store.use((s) => s[key]) as T | undefined) ?? initial;
  const set = useCallback(
    (patch: Partial<T> | ((s: T) => T)) =>
      store.set((s) => {
        const cur = (s[key] as T | undefined) ?? initial;
        return { ...s, [key]: typeof patch === 'function' ? patch(cur) : { ...cur, ...patch } };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}
export function resetToolStates() {
  store.set({});
}

/** Bounded undo stack. Entries are stored by reference: unchanged rows are never copied. */
export type History<T> = { stack: T[]; index: number };

export const startHistory = <T>(value: T): History<T> => ({ stack: [value], index: 0 });

/** Adds a new state after the current one, dropping redo states. Keeps at most `max` undo steps. */
export function pushHistory<T>(h: History<T>, value: T, max: number): History<T> {
  const next = [...h.stack.slice(0, h.index + 1), value];
  const stack = next.length > max + 1 ? next.slice(next.length - (max + 1)) : next;
  return { stack, index: stack.length - 1 };
}

export const canUndo = <T>(h: History<T>) => h.index > 0;
export const canRedo = <T>(h: History<T>) => h.index < h.stack.length - 1;
export const current = <T>(h: History<T>): T => h.stack[h.index] as T;
export const undo = <T>(h: History<T>): History<T> => (canUndo(h) ? { ...h, index: h.index - 1 } : h);
export const redo = <T>(h: History<T>): History<T> => (canRedo(h) ? { ...h, index: h.index + 1 } : h);

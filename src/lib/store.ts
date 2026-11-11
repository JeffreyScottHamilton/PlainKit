import { useSyncExternalStore } from 'react';

/** Tiny external store. Selectors must return a stable slice of state (derive with useMemo). */
export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  const get = () => state;
  const set = (next: T | ((s: T) => T)) => {
    state = typeof next === 'function' ? (next as (s: T) => T)(state) : next;
    subs.forEach((f) => f());
  };
  const subscribe = (f: () => void) => {
    subs.add(f);
    return () => void subs.delete(f);
  };
  const use = <S,>(sel: (s: T) => S): S => useSyncExternalStore(subscribe, () => sel(state));
  return { get, set, subscribe, use };
}

// Pure frame-list edits. The list is the single source of truth for order, durations and removals.
import { GIF_LIMITS, type Entry } from './types';

export const clampMs = (ms: number) => Math.min(GIF_LIMITS.maxDelayMs, Math.max(GIF_LIMITS.minDelayMs, Math.round(ms)));

/** Keeps the user's order and durations for frames that still exist, and appends new frames at the end. */
export function reconcileEntries(prev: readonly Entry[], probed: readonly Entry[]): Entry[] {
  const known = new Set(probed.map((p) => p.id));
  const kept = prev.filter((e) => known.has(e.id));
  const seen = new Set(kept.map((e) => e.id));
  return [...kept, ...probed.filter((p) => !seen.has(p.id)).map((p) => ({ ...p }))];
}

/** Moves the frame at `from` to `to`. Out-of-range or same index returns the list unchanged. */
export function moveEntry(list: readonly Entry[], from: number, to: number): Entry[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [e] = next.splice(from, 1);
  next.splice(to, 0, e!);
  return next;
}

export const removeEntry = (list: readonly Entry[], i: number): Entry[] => list.filter((_, k) => k !== i);
export const reverseEntries = (list: readonly Entry[]): Entry[] => [...list].reverse();
export const setEntryMs = (list: readonly Entry[], i: number, ms: number): Entry[] => list.map((e, k) => (k === i ? { ...e, ms: clampMs(ms) } : e));
export const setAllMs = (list: readonly Entry[], ms: number): Entry[] => list.map((e) => ({ ...e, ms: clampMs(ms) }));

/**
 * The frames that will be exported. Frame skip keeps every Nth frame and gives it N times the delay, so the
 * animation keeps its length. Speed divides every delay. Delays are clamped to the shortest one browsers play.
 */
export function buildPlan(list: readonly Entry[], opts: { speed: number; skip: number }): Entry[] {
  return list
    .filter((_, i) => i % opts.skip === 0)
    .map((e) => ({ id: e.id, ms: clampMs((e.ms * opts.skip) / opts.speed) }));
}

export const totalMs = (list: readonly Entry[]): number => list.reduce((t, e) => t + e.ms, 0);

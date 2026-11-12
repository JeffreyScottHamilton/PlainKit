import { createStore } from '@/lib/store';
import { MatteHistory, editSize, resizeBilinear } from '@/engines/cutout/matte';
import type { SegmentResult } from '@/engines/cutout/types';

/**
 * Per-input matte being edited. The edit matte is the model matte scaled up to at most 1024 px on the
 * long side (1 MB max); brush and rectangle edits change it in place, and undo keeps rectangle diffs.
 * Memory only, for this tab.
 */
export type MatteEdit = {
  width: number;
  height: number;
  ew: number;
  eh: number;
  matte: Uint8Array;
  history: MatteHistory;
  /** Bumped on every matte change, so React re-renders and exports can tell they are stale. */
  rev: number;
  processMs: number;
};

export const edits = createStore<Record<string, MatteEdit>>({});

export function storeSegment(inputId: string, seg: SegmentResult, processMs: number): MatteEdit {
  const { w: ew, h: eh } = editSize(seg.width, seg.height);
  const e: MatteEdit = {
    width: seg.width,
    height: seg.height,
    ew,
    eh,
    matte: resizeBilinear(seg.matte, seg.mw, seg.mh, ew, eh),
    history: new MatteHistory(20),
    rev: 0,
    processMs,
  };
  edits.set((s) => ({ ...s, [inputId]: e }));
  return e;
}

export function touch(inputId: string) {
  edits.set((s) => (s[inputId] ? { ...s, [inputId]: { ...s[inputId], rev: s[inputId].rev + 1 } } : s));
}

/** Update fields that do not change the matte (no rev bump). */
export function patchEdit(inputId: string, patch: Partial<MatteEdit>) {
  edits.set((s) => (s[inputId] ? { ...s, [inputId]: { ...s[inputId], ...patch } } : s));
}

/** Keep only the matte of the image currently in the tool (frees memory of replaced images). */
export function keepOnly(inputId: string | undefined) {
  edits.set((s) => (Object.keys(s).some((k) => k !== inputId) ? Object.fromEntries(Object.entries(s).filter(([k]) => k === inputId)) : s));
}

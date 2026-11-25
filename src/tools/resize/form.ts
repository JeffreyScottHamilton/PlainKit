import { ASPECTS, INPUT_MIMES, MAX_OUTPUT_SIDE, MAX_PERCENT } from '@/engines/resize/geometry';
import type { NormRect, OutputMime, RenderSettings, Target, Turns } from '@/engines/resize/types';
import type { ImageMime } from '@/engines/image/sniff';

export type Mode = 'exact' | 'percent' | 'fit';
export type FormatChoice = 'keep' | OutputMime;

/** Tool UI state. Numbers stay as typed strings until they are validated. */
export type ResizeForm = {
  mode: Mode;
  lock: boolean;
  width: string;
  height: string;
  percent: string;
  maxEdge: string;
  turns: Turns;
  flipH: boolean;
  flipV: boolean;
  crop: NormRect;
  aspect: number | null;
  format: FormatChoice;
  /** 1..100, shown to the user. Converted to 0..1 for the engine. */
  quality: number;
  selectedId: string | null;
  jobByInput: Record<string, string>;
};

export const FULL: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export const INITIAL: ResizeForm = {
  mode: 'exact',
  lock: false,
  width: '800',
  height: '600',
  percent: '50',
  maxEdge: '1024',
  turns: 0,
  flipH: false,
  flipV: false,
  crop: FULL,
  aspect: null,
  format: 'keep',
  quality: 85,
  selectedId: null,
  jobByInput: {},
};

export const FORMAT_LABEL: Record<OutputMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

export const isInputMime = (m: ImageMime | null | undefined): boolean => INPUT_MIMES.some((x) => x === m);

/** Whole pixels from 1 to MAX_OUTPUT_SIDE, or null. */
export function parseWhole(v: string): number | null {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_OUTPUT_SIDE ? n : null;
}

export function targetFrom(st: ResizeForm): { ok: true; target: Target } | { ok: false; error: string } {
  const px = 'Enter whole pixels from 1 to 8192.';
  if (st.mode === 'exact') {
    const w = parseWhole(st.width);
    if (w === null) return { ok: false, error: px };
    if (st.lock) return { ok: true, target: { kind: 'width', width: w } };
    const h = parseWhole(st.height);
    if (h === null) return { ok: false, error: px };
    return { ok: true, target: { kind: 'exact', width: w, height: h } };
  }
  if (st.mode === 'percent') {
    const p = Number(st.percent.trim());
    if (st.percent.trim() === '' || !Number.isFinite(p) || p <= 0 || p > MAX_PERCENT) return { ok: false, error: `Enter a percentage from 1 to ${MAX_PERCENT}.` };
    return { ok: true, target: { kind: 'percent', percent: p } };
  }
  const m = parseWhole(st.maxEdge);
  return m === null ? { ok: false, error: px } : { ok: true, target: { kind: 'fit', maxEdge: m } };
}

export function renderSettings(st: ResizeForm, target: Target): RenderSettings {
  return {
    turns: st.turns,
    flipH: st.flipH,
    flipV: st.flipV,
    crop: st.crop,
    aspect: st.aspect,
    target,
    format: st.format,
    quality: st.quality / 100,
  };
}

export const aspectIdOf = (aspect: number | null): string => ASPECTS.find((a) => a.ratio === aspect)?.id ?? (aspect === null ? 'free' : 'custom');
export const ratioOf = (id: string): number | null => ASPECTS.find((a) => a.id === id)?.ratio ?? null;

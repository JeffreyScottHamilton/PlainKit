import { ToolError } from '@/lib/errors';
import { trimRange } from '@/engines/audio/wav';

/** Pure audio math on planar Float32 channels (-1..1). Inputs are never mutated. */

export type EditOptions = {
  fadeInSec: number;
  fadeOutSec: number;
  gainDb: number;
  normalize: boolean;
  removeSilence: boolean;
  silenceDb: number;
  mono: boolean;
};

export type EditResult = { channels: Float32Array[]; warnings: string[] };

export const NORMALIZE_TARGET_DBFS = -1;
export const DEFAULT_SILENCE_DB = -50;

export const dbToGain = (db: number): number => 10 ** (db / 20);

export function peakOf(channels: Float32Array[]): number {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]!));
  return p;
}

/** Selects [start, end) seconds as copies. Validates the range with the shared WAV helper. */
export function selectRange(channels: Float32Array[], sampleRate: number, startSec?: number, endSec?: number): Float32Array[] {
  const frames = channels[0]?.length ?? 0;
  const { start, end } = trimRange(frames, sampleRate, startSec, endSec);
  return channels.map((c) => c.slice(start, end));
}

/** First and last (exclusive) frame where any channel exceeds the threshold. Null when all frames are quieter. */
export function silenceEdges(channels: Float32Array[], thresholdDb: number): { start: number; end: number } | null {
  const thr = dbToGain(thresholdDb);
  const frames = channels[0]?.length ?? 0;
  const loud = (f: number) => channels.some((c) => Math.abs(c[f]!) > thr);
  let first = 0;
  while (first < frames && !loud(first)) first++;
  if (first >= frames) return null;
  let last = frames - 1;
  while (last > first && !loud(last)) last--;
  return { start: first, end: last + 1 };
}

export function applyGain(channels: Float32Array[], gain: number): void {
  if (gain === 1) return;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i]! *= gain;
}

/** Linear fades in place. If the fades overlap, both are shortened proportionally. */
export function applyFades(channels: Float32Array[], sampleRate: number, fadeInSec: number, fadeOutSec: number): void {
  const len = channels[0]?.length ?? 0;
  let fin = Math.max(0, Math.round(fadeInSec * sampleRate));
  let fout = Math.max(0, Math.round(fadeOutSec * sampleRate));
  if (fin + fout > len && fin + fout > 0) {
    const k = len / (fin + fout);
    fin = Math.floor(fin * k);
    fout = Math.floor(fout * k);
  }
  for (const c of channels) {
    for (let i = 0; i < fin; i++) c[i]! *= i / fin;
    for (let i = 0; i < fout; i++) c[len - 1 - i]! *= i / fout;
  }
}

/** Mono: average of all channels. Stereo: odd channels fold into left/right; mono is duplicated. */
export function toLayout(channels: Float32Array[], mono: boolean): Float32Array[] {
  const n = channels[0]?.length ?? 0;
  if (mono) {
    if (channels.length === 1) return [channels[0]!.slice()];
    const out = new Float32Array(n);
    for (const c of channels) for (let i = 0; i < n; i++) out[i]! += c[i]! / channels.length;
    return [out];
  }
  if (channels.length === 1) return [channels[0]!.slice(), channels[0]!.slice()];
  if (channels.length === 2) return channels.map((c) => c.slice());
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let nl = 0;
  let nr = 0;
  channels.forEach((c, i) => {
    const dst = i % 2 === 0 ? L : R;
    if (i % 2 === 0) nl++;
    else nr++;
    for (let f = 0; f < n; f++) dst[f]! += c[f]!;
  });
  for (let f = 0; f < n; f++) {
    L[f]! /= nl;
    R[f]! /= nr;
  }
  return [L, R];
}

/**
 * Applies the edits in this order: silence removal, layout, normalize, gain, fades, clamp.
 * Gain after normalize can push samples past full scale; those are clamped and reported.
 */
export function editClip(input: Float32Array[], sampleRate: number, o: EditOptions): EditResult {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || input.length === 0) throw new ToolError('wav-empty', 'There is no audio to edit.', 'Choose a file that has an audio track.');
  const warnings: string[] = [];
  let ch = input;
  if (o.removeSilence) {
    const e = silenceEdges(ch, o.silenceDb);
    if (!e) throw new ToolError('all-silent', `Everything in the selection is quieter than ${o.silenceDb} dB.`, 'Lower the silence threshold or choose a different selection.');
    ch = ch.map((c) => c.slice(e.start, e.end));
  }
  ch = toLayout(ch, o.mono);
  if (o.normalize) {
    const p = peakOf(ch);
    if (p > 0) applyGain(ch, dbToGain(NORMALIZE_TARGET_DBFS) / p);
    else warnings.push('Normalize skipped: the selection is silent.');
  }
  applyGain(ch, dbToGain(o.gainDb));
  applyFades(ch, sampleRate, o.fadeInSec, o.fadeOutSec);
  let clipped = 0;
  for (const c of ch)
    for (let i = 0; i < c.length; i++) {
      const x = c[i]!;
      if (x > 1 || x < -1) {
        clipped++;
        c[i] = x > 1 ? 1 : -1;
      }
    }
  if (clipped > 0) warnings.push(`${clipped} samples were clipped to full scale. Lower the volume or turn off normalize.`);
  return { channels: ch, warnings };
}

/** "mm:ss.s", "m:ss", or plain seconds such as "2.5". Returns null when invalid. */
export function parseTime(text: string): number | null {
  const m = /^\s*(?:(\d{1,3}):)?(\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const mins = m[1] === undefined ? 0 : Number(m[1]);
  const secs = Number(m[2]);
  if (m[1] !== undefined && secs >= 60) return null;
  return mins * 60 + secs;
}

/** Seconds to "mm:ss.s" (tenths). */
export function formatTime(sec: number): string {
  const tenths = Math.max(0, Math.round(sec * 10));
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}

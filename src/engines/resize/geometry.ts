import type { Plan, PlanResult, NormRect, Rect, RenderSettings, Size, Target, Turns, OutputMime, InputMime } from './types';

/** Largest side the tool will write. Keeps canvases within what browsers reliably allocate. */
export const MAX_OUTPUT_SIDE = 8192;
export const MAX_PERCENT = 800;
/** Smallest crop side, as a fraction of the image. */
export const MIN_CROP = 0.02;
/** Keyboard step for crop moves and resizes, as a fraction of the image. */
export const KEY_STEP = 0.01;

export const INPUT_MIMES: readonly InputMime[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const LOSSY: readonly OutputMime[] = ['image/jpeg', 'image/webp'];
export const EXT: Record<OutputMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const ASPECTS: readonly { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1 square', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '9:16', label: '9:16 vertical', ratio: 9 / 16 },
  { id: '4:5', label: '4:5 portrait', ratio: 4 / 5 },
];

/** Presets crop to the preset's shape first, so the output is exactly the preset size with no stretching. */
export const PRESETS: readonly { id: string; label: string; width: number; height: number }[] = [
  { id: 'square-post', label: 'Square post, 1080 × 1080', width: 1080, height: 1080 },
  { id: 'landscape-video', label: 'Landscape video, 1920 × 1080', width: 1920, height: 1080 },
  { id: 'portrait-story', label: 'Portrait story, 1080 × 1920', width: 1080, height: 1920 },
  { id: 'link-preview', label: 'Link preview, 1200 × 630', width: 1200, height: 630 },
  { id: 'icon-512', label: 'Icon, 512 × 512', width: 512, height: 512 },
  { id: 'icon-256', label: 'Icon, 256 × 256', width: 256, height: 256 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function orientedSize(w: number, h: number, turns: Turns): Size {
  return turns % 2 === 1 ? { width: h, height: w } : { width: w, height: h };
}

/** Largest rectangle of `aspect` inside the normalized box, centred on it, in whole pixels. */
export function fitCrop(W: number, H: number, n: NormRect, aspect: number | null): Rect {
  const bx = n.x * W;
  const by = n.y * H;
  const bw = n.w * W;
  const bh = n.h * H;
  let w = bw;
  let h = bh;
  if (aspect !== null) {
    w = Math.min(bw, bh * aspect);
    h = w / aspect;
  }
  const cw = clamp(Math.round(w), 1, W);
  const ch = clamp(Math.round(h), 1, H);
  const x = clamp(Math.round(bx + (bw - cw) / 2), 0, W - cw);
  const y = clamp(Math.round(by + (bh - ch) / 2), 0, H - ch);
  return { x, y, w: cw, h: ch };
}

/** The crop as it will be applied at this size, as fractions (what the preview shows). */
export function cropNorm(W: number, H: number, n: NormRect, aspect: number | null): NormRect {
  const r = fitCrop(W, H, n, aspect);
  return { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H };
}

export function moveNorm(n: NormRect, dx: number, dy: number): NormRect {
  return { ...n, x: clamp(n.x + dx, 0, 1 - n.w), y: clamp(n.y + dy, 0, 1 - n.h) };
}

/**
 * Resizes from the bottom-right corner. With an aspect ratio, dx drives the size and height follows
 * (the image's pixel size is needed to convert between fractions and pixels).
 */
export function resizeNorm(n: NormRect, dw: number, dh: number, W: number, H: number, aspect: number | null): NormRect {
  let w = clamp(n.w + dw, MIN_CROP, 1 - n.x);
  if (aspect === null) {
    return { ...n, w, h: clamp(n.h + dh, MIN_CROP, 1 - n.y) };
  }
  let h = (w * W) / (H * aspect);
  if (n.y + h > 1) {
    h = 1 - n.y;
    w = (h * H * aspect) / W;
  }
  return { ...n, w, h: Math.max(h, MIN_CROP) };
}

/** Quarter turn of the crop box, matching drawOriented. dir 1 = clockwise, 3 = counter-clockwise. */
export function rotateNorm(n: NormRect, dir: 1 | 3): NormRect {
  return dir === 1
    ? { x: 1 - (n.y + n.h), y: n.x, w: n.h, h: n.w }
    : { x: n.y, y: 1 - (n.x + n.w), w: n.h, h: n.w };
}

export function flipNorm(n: NormRect, axis: 'h' | 'v'): NormRect {
  return axis === 'h' ? { ...n, x: 1 - (n.x + n.w) } : { ...n, y: 1 - (n.y + n.h) };
}

export function resolveTarget(cw: number, ch: number, t: Target): Size {
  const px = (v: number) => Math.max(1, Math.round(v));
  switch (t.kind) {
    case 'exact':
      return { width: t.width, height: t.height };
    case 'width':
      return { width: t.width, height: px((t.width * ch) / cw) };
    case 'percent':
      return { width: px((cw * t.percent) / 100), height: px((ch * t.percent) / 100) };
    case 'fit': {
      const s = Math.min(1, t.maxEdge / Math.max(cw, ch));
      return { width: px(cw * s), height: px(ch * s) };
    }
  }
}

export function planResize(W: number, H: number, s: RenderSettings): PlanResult {
  const o = orientedSize(W, H, s.turns);
  const crop = fitCrop(o.width, o.height, s.crop, s.aspect);
  const size = resolveTarget(crop.w, crop.h, s.target);
  if (size.width > MAX_OUTPUT_SIDE || size.height > MAX_OUTPUT_SIDE) {
    return {
      ok: false,
      message: `The output would be ${size.width} × ${size.height} px. The limit is ${MAX_OUTPUT_SIDE} px per side.`,
      nextAction: 'Choose a smaller size or percentage.',
    };
  }
  const plan: Plan = { crop, width: size.width, height: size.height, upscaled: size.width > crop.w || size.height > crop.h };
  return { ok: true, plan };
}

/**
 * Intermediate sizes for high-quality downscaling: halve while the source is more than twice the target,
 * so each step is at most a 2x reduction. Empty when no step is needed (or when upscaling).
 */
export function planDownscale(from: Size, to: Size): Size[] {
  const steps: Size[] = [];
  let cur = from;
  while ((cur.width > 2 * to.width || cur.height > 2 * to.height) && steps.length < 32) {
    cur = { width: Math.max(to.width, Math.ceil(cur.width / 2)), height: Math.max(to.height, Math.ceil(cur.height / 2)) };
    steps.push(cur);
  }
  return steps;
}

/** The format a 'keep' request resolves to. GIF, BMP and AVIF inputs have no kept format, so PNG is used. */
export function outputMimeFor(format: OutputMime | 'keep', input: InputMime): OutputMime {
  if (format !== 'keep') return format;
  return input === 'image/jpeg' || input === 'image/png' || input === 'image/webp' ? input : 'image/png';
}

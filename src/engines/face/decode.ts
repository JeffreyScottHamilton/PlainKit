// Pure YuNet post-processing. Mirrors OpenCV's FaceDetectorYN (opencv/modules/objdetect/src/face_detect.cpp):
// per stride s the model has cls_s [1,N,1], obj_s [1,N,1], bbox_s [1,N,4] with N = (size/s)^2 cells in
// row-major order. score = sqrt(clamp01(cls) * clamp01(obj)); centre = (col + dx) * s, size = exp(dw) * s.
// Input is BGR 0..255 NCHW, the image placed top-left and zero-padded to the square model size.

export type Box = { x: number; y: number; w: number; h: number };
export type Face = Box & { score: number };
export type Bounds = { width: number; height: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Top-left letterbox: scale so the long side equals `size`; the rest is zero padding at right/bottom. */
export function letterbox(width: number, height: number, size: number): { scale: number; w: number; h: number } {
  const scale = size / Math.max(width, height);
  return { scale, w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Candidate boxes for one stride, in model-input pixels. */
export function decodeLevel(cls: ArrayLike<number>, obj: ArrayLike<number>, bbox: ArrayLike<number>, stride: number, size: number, minScore: number): Face[] {
  const cols = size / stride;
  const n = cols * cols;
  const out: Face[] = [];
  for (let i = 0; i < n; i++) {
    const score = Math.sqrt(clamp01(cls[i]!) * clamp01(obj[i]!));
    if (score < minScore) continue;
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cx = (c + bbox[i * 4]!) * stride;
    const cy = (r + bbox[i * 4 + 1]!) * stride;
    const w = Math.exp(bbox[i * 4 + 2]!) * stride;
    const h = Math.exp(bbox[i * 4 + 3]!) * stride;
    out.push({ x: cx - w / 2, y: cy - h / 2, w, h, score });
  }
  return out;
}

export function iou(a: Box, b: Box): number {
  const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** Greedy non-maximum suppression: highest score first, drop boxes whose IoU with a kept box exceeds `threshold`. */
export function nms<T extends Face>(faces: T[], threshold: number): T[] {
  const kept: T[] = [];
  for (const f of [...faces].sort((a, b) => b.score - a.score)) if (kept.every((k) => iou(k, f) <= threshold)) kept.push(f);
  return kept;
}

/** Model-input pixels back to ORIGINAL image pixels (after EXIF orientation), clipped to the image. */
export function toImageBox(f: Face, scale: number, b: Bounds): Face {
  const x1 = Math.max(0, f.x / scale);
  const y1 = Math.max(0, f.y / scale);
  const x2 = Math.min(b.width, (f.x + f.w) / scale);
  const y2 = Math.min(b.height, (f.y + f.h) / scale);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1), score: f.score };
}

/** Grow each side by `fraction` of the box size, clamp to the image, return integers (rounded outward). */
export function padBox(f: Box, fraction: number, b: Bounds): Box {
  const x1 = Math.max(0, Math.floor(f.x - f.w * fraction));
  const y1 = Math.max(0, Math.floor(f.y - f.h * fraction));
  const x2 = Math.min(b.width, Math.ceil(f.x + f.w * (1 + fraction)));
  const y2 = Math.min(b.height, Math.ceil(f.y + f.h * (1 + fraction)));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

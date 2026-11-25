import { applyFilter } from './filters';
import { detectPage } from './corners';
import { decodeRaster, encodeRaster } from './codec';
import { rotate, warpQuad } from './warp';
import type { DetectResult, PageResult, Quad, ScanRequest } from './types';

/** Worker-side pipeline: decode, warp the quad to a rectangle, rotate, clean up, encode. */
export async function runScan(req: ScanRequest): Promise<DetectResult | PageResult> {
  const src = await decodeRaster(req.blob);
  if (req.type === 'detect') {
    const { quad, detected } = detectPage(src);
    return { kind: 'detect', quad, detected };
  }
  const q = toPixels(req.quad, src.width, src.height);
  const flat = rotate(applyFilter(warpQuad(src, q, req.maxSide), req.filter), req.turns);
  const bytes = await encodeRaster(flat, req.format);
  return { kind: 'page', bytes, mime: req.format, width: flat.width, height: flat.height };
}

function toPixels(q: Quad, w: number, h: number) {
  return q.map((p) => ({ x: p.x * w, y: p.y * h }));
}

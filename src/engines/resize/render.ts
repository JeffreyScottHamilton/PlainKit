import { ToolError } from '@/lib/errors';
import { assertDecodable } from '@/engines/image/dimensions';
import { sniffBlob, type ImageMime } from '@/engines/image/sniff';
import { INPUT_MIMES, orientedSize, outputMimeFor, planDownscale, planResize } from './geometry';
import type { RenderResult, RenderSettings } from './types';

/** Subset shared by the DOM and OffscreenCanvas 2D contexts. */
export type Draw2D = Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'translate' | 'scale' | 'rotate' | 'drawImage' | 'fillRect' | 'fillStyle' | 'imageSmoothingQuality'>;

// Draw helpers shared by the worker (full size) and the preview (scaled down on the main thread).

export type Orientation = Pick<RenderSettings, 'turns' | 'flipH' | 'flipV'>;

/** Draws `src` (srcW × srcH as decoded) rotated and flipped. Flips act in the rotated frame. */
export function drawOriented(ctx: Draw2D, src: CanvasImageSource, srcW: number, srcH: number, o: Orientation, scale = 1) {
  const oriented = orientedSize(srcW, srcH, o.turns);
  ctx.save();
  ctx.translate((oriented.width * scale) / 2, (oriented.height * scale) / 2);
  ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  ctx.rotate((o.turns * Math.PI) / 2);
  ctx.drawImage(src, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);
  ctx.restore();
}

const LABEL: Record<RenderSettings['format'], string> = { keep: 'this format', 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

function ctx2d(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new ToolError('no-canvas', 'This browser could not create a drawing canvas.', 'Try a different browser.');
  return ctx;
}

/**
 * Decodes, orients, crops and resizes one image. Runs in the worker; the input blob is only read.
 * Downscales in halves for large reductions, then one final high-quality step.
 */
export async function renderResize(blob: Blob, s: RenderSettings): Promise<RenderResult> {
  const sniffed: ImageMime | null = await sniffBlob(blob);
  const input = INPUT_MIMES.find((m) => m === sniffed);
  if (!input) {
    throw new ToolError('unsupported-input', 'This file type cannot be resized here. Only JPEG, PNG, WebP, GIF, BMP and AVIF are supported.', 'Convert it to PNG or JPEG first.');
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => {
    throw new ToolError('decode-failed', 'This image could not be decoded. It may be damaged.', 'Try exporting it again.');
  });
  try {
    assertDecodable(bitmap.width, bitmap.height);
    const planned = planResize(bitmap.width, bitmap.height, s);
    if (!planned.ok) throw new ToolError('too-large', planned.message, planned.nextAction);
    const { plan } = planned;
    const mime = outputMimeFor(s.format, input);
    const warnings: string[] = [];
    if (s.format === 'keep' && mime === 'image/png' && input !== 'image/png') warnings.push('This format has no kept form here, so the result is PNG.');
    if (plan.upscaled) warnings.push(`The target is larger than the crop (${plan.crop.w} × ${plan.crop.h} px). The picture is enlarged and gains no detail.`);

    // Oriented source: the bitmap itself when no rotation or flip is needed.
    const turned = s.turns !== 0 || s.flipH || s.flipV;
    let src: CanvasImageSource = bitmap;
    if (turned) {
      const o = orientedSize(bitmap.width, bitmap.height, s.turns);
      const c = new OffscreenCanvas(o.width, o.height);
      drawOriented(ctx2d(c), bitmap, bitmap.width, bitmap.height, s);
      src = c;
    }

    let rect = plan.crop;
    for (const step of planDownscale({ width: plan.crop.w, height: plan.crop.h }, { width: plan.width, height: plan.height })) {
      const c = new OffscreenCanvas(step.width, step.height);
      const cx = ctx2d(c);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, step.width, step.height);
      src = c;
      rect = { x: 0, y: 0, w: step.width, h: step.height };
    }

    const out = new OffscreenCanvas(plan.width, plan.height);
    const ox = ctx2d(out);
    ox.imageSmoothingQuality = 'high';
    if (mime === 'image/jpeg') {
      // JPEG has no alpha: transparent areas become white.
      ox.fillStyle = '#ffffff';
      ox.fillRect(0, 0, plan.width, plan.height);
    }
    ox.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, plan.width, plan.height);

    const quality = mime === 'image/png' ? null : s.quality;
    const encoded = await out.convertToBlob(quality === null ? { type: mime } : { type: mime, quality });
    // Browsers silently fall back to PNG for encoders they lack: check the real type and bytes.
    const actual = encoded.type === mime ? await sniffBlob(encoded) : null;
    if (actual !== mime) {
      throw new ToolError('encode-failed', `This browser could not write ${LABEL[mime]}. Choose another output format.`, 'Choose JPEG or PNG.');
    }
    return {
      blob: encoded,
      mime,
      width: plan.width,
      height: plan.height,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      crop: plan.crop,
      upscaled: plan.upscaled,
      quality,
      warnings,
    };
  } finally {
    bitmap.close();
  }
}

import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { isAnimated, sniffImageMime, type ImageMime } from './sniff';
import { searchQualityForTarget } from './search';
import { assertDecodable, fitWithin, parseHexColor } from './dimensions';
import type { EncodeOptions, EncodeResult, InspectResult, OutputMime } from './types';

type Progress = (p: JobProgress) => void;

const HEAD_BYTES = 256 * 1024;
const ALPHA_SAMPLE_MAX = 256;
const DEFAULT_LOSSY_QUALITY = 0.92;
const DEFAULT_BACKGROUND = '#ffffff';
/** Target mode: the original size, then at most 4 steps of 0.8x. */
const SCALE_STEPS = [1, 0.8, 0.64, 0.512, 0.4096] as const;
const MAY_HAVE_ALPHA: ReadonlySet<ImageMime> = new Set<ImageMime>(['image/png', 'image/webp', 'image/gif', 'image/avif']);

export const OUTPUT_LABEL: Record<OutputMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const INPUT_LABEL: Record<ImageMime, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/avif': 'AVIF',
};

export function unsupportedEncoder(mime: OutputMime): ToolError {
  return new ToolError('encoder-unsupported', `This browser cannot write ${OUTPUT_LABEL[mime]}.`, 'Choose another format.');
}

type Decoded = {
  bitmap: ImageBitmap;
  mime: ImageMime;
  width: number;
  height: number;
  hadAlpha: boolean;
  animated: boolean;
};

/** Decodes with EXIF orientation applied. Validates magic bytes and size limits. Caller closes bitmap. */
async function decodeBlob(blob: Blob): Promise<Decoded> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  const mime = sniffImageMime(head);
  if (!mime) {
    throw new ToolError('unsupported-input', 'This file is not a JPEG, PNG, WebP, GIF, BMP or AVIF image.', 'Choose an image in one of those formats.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('decode-failed', `This ${INPUT_LABEL[mime]} could not be decoded. It may be damaged, or this browser cannot read it.`, 'Try another file.');
  }
  try {
    assertDecodable(bitmap.width, bitmap.height);
  } catch (e) {
    bitmap.close();
    throw e;
  }
  const animated = mime === 'image/gif' || isAnimated(head, mime);
  return { bitmap, mime, width: bitmap.width, height: bitmap.height, hadAlpha: MAY_HAVE_ALPHA.has(mime) && sampleAlpha(bitmap), animated };
}

/** Samples up to 256 px. A very small transparent area can be missed. */
function sampleAlpha(bitmap: ImageBitmap): boolean {
  const s = Math.min(1, ALPHA_SAMPLE_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ToolError('unsupported', 'This browser cannot read image pixels.', 'Try another browser.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < px.length; i += 4) if (px[i]! < 255) return true;
  return false;
}

function drawCanvas(bitmap: ImageBitmap, w: number, h: number, fill?: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ToolError('unsupported', 'This browser cannot draw images to a canvas.', 'Try another browser.');
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function release(canvas: OffscreenCanvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/** Encodes, then proves the real output type by its magic bytes. Browsers silently fall back to PNG. */
async function toBlobChecked(canvas: OffscreenCanvas, mime: OutputMime, quality: number | undefined): Promise<Blob> {
  let blob: Blob;
  try {
    blob = await canvas.convertToBlob(quality === undefined ? { type: mime } : { type: mime, quality });
  } catch {
    throw unsupportedEncoder(mime);
  }
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  if (blob.type !== mime || sniffImageMime(head) !== mime) throw unsupportedEncoder(mime);
  return blob;
}

function validate(o: EncodeOptions): string | undefined {
  if (o.mode.kind === 'quality' && o.mode.quality !== undefined && !(o.mode.quality >= 0 && o.mode.quality <= 1)) return 'quality must be between 0 and 1';
  if (o.mode.kind === 'target' && !(o.mode.targetBytes > 0 && Number.isFinite(o.mode.targetBytes))) return 'target size must be positive';
  if (o.maxDimension !== undefined && !(Number.isInteger(o.maxDimension) && o.maxDimension >= 1)) return 'max dimension must be a whole number of pixels';
  return undefined;
}

type Attempt = { blob: Blob; width: number; height: number; quality: number | null; size: number };

/** Re-encodes a file. Heavy: runs inside the image worker only. */
export async function encodeBlob(blob: Blob, o: EncodeOptions, onProgress: Progress): Promise<EncodeResult> {
  const bad = validate(o);
  if (bad) throw new ToolError('invalid-options', `Invalid settings: ${bad}.`, 'Adjust the settings and try again.');
  const bg = o.mime === 'image/jpeg' ? parseHexColor(o.background ?? DEFAULT_BACKGROUND) : null;
  if (o.mime === 'image/jpeg' && !bg) throw new ToolError('invalid-options', 'Background must be a #rrggbb color.', 'Pick a color and try again.');

  onProgress({ stage: 'inspecting', message: 'Reading image' });
  const d = await decodeBlob(blob);
  try {
    const fit = fitWithin(d.width, d.height, o.maxDimension);
    const isPng = o.mime === 'image/png';
    const warnings: string[] = ['Re-encoding removes metadata such as EXIF data.'];
    if (d.mime === 'image/gif') warnings.push('GIF input: only the first frame is kept. Animation is not preserved.');
    else if (d.animated) warnings.push('This image is animated. Only the first frame is kept.');
    if (d.hadAlpha && o.mime === 'image/jpeg') warnings.push(`Transparent areas were filled with ${bg} because JPEG has no transparency.`);
    if (fit.scaled) warnings.push(`Resized from ${d.width}×${d.height} to ${fit.width}×${fit.height}.`);

    const finish = (a: Attempt, targetMet: boolean | null): EncodeResult => ({
      blob: a.blob,
      mime: o.mime,
      width: a.width,
      height: a.height,
      quality: a.quality,
      targetMet,
      hadAlpha: d.hadAlpha,
      warnings,
      inputMime: d.mime,
      inputWidth: d.width,
      inputHeight: d.height,
    });

    if (o.mode.kind === 'quality') {
      if (isPng && o.mode.quality !== undefined) warnings.push('PNG is lossless: quality does not apply. Only metadata is removed.');
      const quality = isPng ? undefined : (o.mode.quality ?? DEFAULT_LOSSY_QUALITY);
      onProgress({ stage: 'processing', message: `Encoding ${OUTPUT_LABEL[o.mime]}` });
      const canvas = drawCanvas(d.bitmap, fit.width, fit.height, bg ?? undefined);
      const out = await toBlobChecked(canvas, o.mime, quality);
      release(canvas);
      return finish({ blob: out, width: fit.width, height: fit.height, quality: quality ?? null, size: out.size }, null);
    }

    const target = o.mode.targetBytes;
    if (isPng) warnings.push('PNG is lossless: target size can only be reached by reducing dimensions.');
    let smallest: Attempt | null = null;
    for (let step = 0; step < SCALE_STEPS.length; step++) {
      const scale = SCALE_STEPS[step]!;
      const w = Math.max(1, Math.round(fit.width * scale));
      const h = Math.max(1, Math.round(fit.height * scale));
      const canvas = drawCanvas(d.bitmap, w, h, bg ?? undefined);
      let attempt: Attempt;
      if (isPng) {
        onProgress({ stage: 'processing', message: `Encoding ${w}×${h}` });
        const out = await toBlobChecked(canvas, o.mime, undefined);
        attempt = { blob: out, width: w, height: h, quality: null, size: out.size };
      } else {
        const outcome = await searchQualityForTarget({
          targetBytes: target,
          encode: async (q) => {
            const out = await toBlobChecked(canvas, o.mime, q);
            return { size: out.size, value: out };
          },
          onProgress: (fraction) => onProgress({ stage: 'processing', fraction, message: step === 0 ? 'Finding quality for the target' : `Smaller dimensions ${w}×${h}` }),
        });
        attempt = { blob: outcome.best.value, width: w, height: h, quality: outcome.best.quality, size: outcome.best.size };
      }
      release(canvas);
      if (attempt.size <= target) {
        if (step > 0) warnings.push(`Reduced dimensions to ${w}×${h} to reach the target.`);
        return finish(attempt, true);
      }
      if (!smallest || attempt.size < smallest.size) smallest = attempt;
    }
    if (!smallest) throw new ToolError('unexpected', 'No output was produced.', 'Try again.');
    return finish(smallest, false);
  } finally {
    d.bitmap.close();
  }
}

/** Decodes only; used to show alpha/animation warnings before any conversion. */
export async function inspectBlob(blob: Blob): Promise<InspectResult> {
  const d = await decodeBlob(blob);
  try {
    return { mime: d.mime, width: d.width, height: d.height, hadAlpha: d.hadAlpha, animated: d.animated };
  } finally {
    d.bitmap.close();
  }
}

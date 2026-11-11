import { sniffImageMime } from './sniff';
import type { OutputMime } from './types';
import { OUTPUT_MIMES } from './types';

export type EncoderSupport = {
  readonly encodable: Readonly<Record<OutputMime, boolean>>;
  /** True when this browser can encode AVIF and decode what it produced. */
  readonly avifDecodable: boolean;
};

async function tinyBlob(mime: string, quality?: number): Promise<Blob | null> {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(1, 1);
      return await c.convertToBlob(quality === undefined ? { type: mime } : { type: mime, quality });
    }
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return await new Promise<Blob | null>((resolve) => c.toBlob(resolve, mime, quality));
  } catch {
    return null;
  }
}

/** A format counts only if the blob is labelled with it and its bytes really are that format. */
async function canEncode(mime: OutputMime): Promise<boolean> {
  const blob = await tinyBlob(mime, 0.9);
  if (!blob || blob.type !== mime) return false;
  return sniffImageMime(new Uint8Array(await blob.slice(0, 64).arrayBuffer())) === mime;
}

async function avifRoundTrips(): Promise<boolean> {
  const blob = await tinyBlob('image/avif');
  if (!blob || blob.type !== 'image/avif') return false;
  try {
    const bmp = await createImageBitmap(blob);
    bmp.close();
    return true;
  } catch {
    return false;
  }
}

async function runProbe(): Promise<EncoderSupport> {
  const results = await Promise.all(OUTPUT_MIMES.map((m) => canEncode(m)));
  const encodable = Object.fromEntries(OUTPUT_MIMES.map((m, i) => [m, results[i]])) as Record<OutputMime, boolean>;
  return { encodable, avifDecodable: await avifRoundTrips() };
}

let cached: Promise<EncoderSupport> | undefined;
/** Runs once per tab. Never rejects. */
export function probeEncoders(): Promise<EncoderSupport> {
  cached ??= runProbe();
  return cached;
}

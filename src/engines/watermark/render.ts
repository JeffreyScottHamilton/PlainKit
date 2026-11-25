import { ToolError } from '@/lib/errors';
import { assertDecodable } from '@/engines/image/dimensions';
import { sniffBlob } from '@/engines/image/sniff';
import { drawWatermark, prepareLogo, type Overlay } from './draw';
import { fontCss, loadInter } from './fonts';
import { outputMimeFor, WM_INPUT_MIMES, type WmInput } from './layout';
import type { FontId, OutputMime, RenderResult, WatermarkSettings } from './types';

const LABEL: Record<OutputMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

async function decode(blob: Blob, failed: string): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => {
    throw new ToolError('decode-failed', failed, 'Try exporting it again.');
  });
}

/**
 * Adds a text or logo watermark to one image. Runs in the worker; both input blobs are only read.
 * The output keeps the input's pixel size.
 */
export async function renderWatermark(blob: Blob, logoBlob: Blob | null, s: WatermarkSettings): Promise<RenderResult> {
  if (s.content.kind === 'text' && s.content.text.trim() === '') {
    throw new ToolError('no-text', 'Type the text to add.', 'Enter the text, for example your name.');
  }
  if (s.content.kind === 'logo' && !logoBlob) throw new ToolError('no-logo', 'Choose a logo image first.', 'Pick an image from this session or drop one.');

  const sniffed = await sniffBlob(blob);
  const input = WM_INPUT_MIMES.find((m) => m === sniffed);
  if (!input) {
    throw new ToolError('unsupported-input', 'This file type cannot be watermarked here. Only JPEG, PNG, WebP, GIF, BMP and AVIF are supported.', 'Convert it to PNG or JPEG first.');
  }
  const warnings: string[] = [];
  const bitmap = await decode(blob, 'This image could not be decoded. It may be damaged.');
  let logoBitmap: ImageBitmap | null = null;
  try {
    assertDecodable(bitmap.width, bitmap.height);
    const mime = outputMimeFor(s.format, input as WmInput);
    if (s.format === 'keep' && mime === 'image/png' && input !== 'image/png') warnings.push('This format has no kept form here, so the result is PNG.');

    let logo: Overlay['logo'] = null;
    if (s.content.kind === 'logo' && logoBlob) {
      if (!(await sniffBlob(logoBlob))) throw new ToolError('logo-unsupported', 'The logo is not a recognized image.', 'Choose a PNG or JPEG logo.');
      logoBitmap = await decode(logoBlob, 'The logo could not be decoded. It may be damaged.');
      assertDecodable(logoBitmap.width, logoBitmap.height);
      const src = prepareLogo(logoBitmap, logoBitmap.width, logoBitmap.height, s.content.whiteTransparent);
      logo = { src, w: logoBitmap.width, h: logoBitmap.height };
    }

    let font: FontId = 'sans';
    let interReady = true;
    if (s.content.kind === 'text') {
      font = s.content.font;
      if (font === 'inter') {
        interReady = await loadInter();
        if (!interReady) warnings.push('Inter could not load here, so the system sans-serif font was used.');
      }
    }
    const overlay: Overlay = { settings: s, logo, fontCss: fontCss(font, interReady) };

    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const cx = c.getContext('2d');
    if (!cx) throw new ToolError('no-canvas', 'This browser could not create a drawing canvas.', 'Try a different browser.');
    if (mime === 'image/jpeg') {
      // JPEG has no alpha: fill first so transparent parts of a logo do not come out black.
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    cx.drawImage(bitmap, 0, 0);
    const copies = drawWatermark(cx, bitmap.width, bitmap.height, overlay);

    const quality = mime === 'image/png' ? null : s.quality;
    const encoded = await c.convertToBlob(quality === null ? { type: mime } : { type: mime, quality });
    // Browsers silently fall back to PNG for encoders they lack: check the real type and bytes.
    const actual = encoded.type === mime ? await sniffBlob(encoded) : null;
    if (actual !== mime) {
      throw new ToolError('encode-failed', `This browser could not write ${LABEL[mime]}. Choose another output format.`, 'Choose JPEG or PNG.');
    }
    return {
      blob: encoded,
      mime,
      width: bitmap.width,
      height: bitmap.height,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      copies,
      quality,
      warnings,
    };
  } finally {
    bitmap.close();
    logoBitmap?.close();
  }
}

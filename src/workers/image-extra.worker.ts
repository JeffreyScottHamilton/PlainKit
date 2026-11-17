import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { encodeBmp, encodeGif, encodeTiff, sniffExtra, wrapIco, type ExtraMime, type Rgba } from '@/engines/image/extra';

export type ExtraRequest = { png: Blob; target: ExtraMime; quality?: number; icoSize?: number; /** "#rrggbb": fill behind the picture, for formats without transparency. */ background?: string };
export type ExtraResponse = { blob: Blob; width: number; height: number; warnings: string[] };

// Takes a lossless PNG (already resized, and flattened where the target has no transparency) and writes the target format.
serve<ExtraRequest, ExtraResponse>(async (req, onProgress) => {
  onProgress({ stage: 'exporting' });
  let bmp = await createImageBitmap(req.png);
  const warnings: string[] = [];
  let { width, height } = bmp;

  if (req.target === 'image/x-icon') {
    const size = req.icoSize ?? 256;
    // Icons are square: the picture is fitted inside the square on a transparent background, never stretched.
    const s = Math.min(size / width, size / height, 1);
    const w = Math.max(1, Math.round(width * s));
    const h = Math.max(1, Math.round(height * s));
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    bmp.close();
    const png = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    if (width !== height) warnings.push(`The picture is not square, so it was centred in a ${size}×${size} icon with transparent margins.`);
    if (width < size && height < size) warnings.push('The picture is smaller than the icon size and was not enlarged.');
    return { result: { blob: new Blob([wrapIco(png, size, size) as BlobPart], { type: 'image/x-icon' }), width: size, height: size, warnings } };
  }

  const c = new OffscreenCanvas(width, height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (req.background && /^#[0-9a-f]{6}$/i.test(req.background)) {
    g.fillStyle = req.background;
    g.fillRect(0, 0, width, height);
  }
  g.drawImage(bmp, 0, 0);
  bmp.close();
  bmp = undefined as never;

  if (req.target === 'image/avif') {
    let blob: Blob;
    try {
      blob = await c.convertToBlob({ type: 'image/avif', quality: req.quality ?? 0.8 });
    } catch {
      blob = new Blob();
    }
    if (blob.type !== 'image/avif' || sniffExtra(new Uint8Array(await blob.slice(0, 32).arrayBuffer())) !== 'image/avif')
      throw new ToolError('encoder-unsupported', 'This browser cannot write AVIF.', 'Choose another format.');
    return { result: { blob, width, height, warnings } };
  }

  const img: Rgba = g.getImageData(0, 0, width, height);
  let bytes: Uint8Array;
  if (req.target === 'image/gif') {
    bytes = encodeGif(img);
    warnings.push('GIF holds at most 256 colours, so photos lose colour detail. Transparency is on or off only.');
  } else if (req.target === 'image/bmp') bytes = encodeBmp(img);
  else {
    bytes = encodeTiff(img);
    warnings.push('The TIFF is uncompressed, so the file is large.');
  }
  if (sniffExtra(bytes) !== req.target) throw new ToolError('encode', 'The converted file did not come out in the expected format.', 'Try another format.');
  return { result: { blob: new Blob([bytes as BlobPart], { type: req.target }), width, height, warnings } };
});

import { ToolError } from '@/lib/errors';

// HEIC/HEIF decoding for browsers that cannot do it themselves (Chrome, Firefox). Safari decodes natively and never gets here.
// The decoder is libheif (LGPL-3.0), kept as a separate same-origin file and loaded only when needed.
export const HEIF = { url: '/engines/libheif/libheif-bundle.mjs', bytes: 2_043_959, name: 'libheif', licence: 'LGPL-3.0', licenceUrl: '/engines/libheif/LICENSE' } as const;

type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void;
  free?(): void;
};
type LibHeif = { HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] } };

let lib: Promise<LibHeif> | undefined;
function load(): Promise<LibHeif> {
  lib ??= (async () => {
    try {
      // Absolute URL: Vite's dev server appends ?import to root-relative dynamic imports, which /public files reject.
      const mod = (await import(/* @vite-ignore */ new URL(HEIF.url, self.location.origin).href)) as { default: (o?: object) => LibHeif | Promise<LibHeif> };
      return await mod.default();
    } catch {
      lib = undefined;
      throw new ToolError('heic-engine', 'The HEIC decoder could not be loaded.', 'Check the connection and try again.');
    }
  })();
  return lib;
}

const MAX_PIXELS = 100_000_000;

/** Decodes the primary image of a HEIC/HEIF file to RGBA. Other images in the file (bursts, depth, Live Photo video) are ignored. */
export async function decodeHeic(blob: Blob): Promise<{ data: ImageData; imagesInFile: number }> {
  const libheif = await load();
  let images: HeifImage[];
  try {
    images = new libheif.HeifDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    images = [];
  }
  const image = images[0];
  if (!image) throw new ToolError('decode-failed', 'This HEIC file could not be decoded. It may be damaged or use a feature the decoder does not support.', 'Try exporting it again from the phone, or as "Most Compatible".');
  const width = image.get_width();
  const height = image.get_height();
  if (!(width > 0 && height > 0) || width * height > MAX_PIXELS) throw new ToolError('too-large', 'This HEIC image is too large to decode in the browser.', 'Reduce its size first.');
  const data = new ImageData(width, height);
  await new Promise<void>((resolve, reject) =>
    image.display(data, (result) => (result ? resolve() : reject(new ToolError('decode-failed', 'This HEIC file could not be decoded.', 'Try another file.')))),
  );
  images.forEach((i) => i.free?.());
  return { data, imagesInFile: images.length };
}

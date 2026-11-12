import type * as Ort from 'onnxruntime-web';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { isPng, matteToRgba, toMatte, toNchw } from '@/engines/cutout/matte';
import { ENGINE, MAX_PIXELS, MODEL } from '@/engines/cutout/model';
import type { CutoutRequest, CutoutResponse } from '@/engines/cutout/types';

// Cutout inference worker. It stays alive for the session so the loaded model is reused;
// cancel terminates it (see engines/cutout/client.ts) and the next run starts a fresh one.
// ONNX Runtime is loaded at runtime from the same origin (public/engines/ort), never bundled or fetched from a CDN.
let session: Ort.InferenceSession | null = null;
let ort: typeof Ort | null = null;

const initFailed = (detail: string) =>
  new ToolError(
    'engine-init',
    `The background-removal engine could not start in this browser (${detail}).`,
    'Use a current Chrome, Edge, Firefox or Safari with WebAssembly enabled, then try again.',
  );

async function ensureSession(engine: { model: ArrayBuffer; wasm: ArrayBuffer } | undefined): Promise<Ort.InferenceSession> {
  if (session) return session;
  if (!engine) throw new ToolError('engine-missing', 'The model is not loaded.', 'Try again.');
  if (typeof WebAssembly !== 'object') throw initFailed('no WebAssembly');
  try {
    ort ??= (await import(/* @vite-ignore */ ENGINE.moduleUrl)) as typeof Ort;
    ort.env.wasm.numThreads = 1; // no cross-origin isolation: single thread
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = '/engines/ort/';
    ort.env.wasm.wasmBinary = engine.wasm;
    session = await ort.InferenceSession.create(new Uint8Array(engine.model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return session;
  } catch (e) {
    throw initFailed(e instanceof Error ? e.message.slice(0, 160) : 'unknown error');
  }
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('decode', 'This image could not be read by the browser.', 'Try a PNG, JPEG or WebP file.');
  }
  if (bmp.width * bmp.height > MAX_PIXELS) {
    const mp = ((bmp.width * bmp.height) / 1e6).toFixed(1);
    bmp.close();
    throw new ToolError('too-large', `The image is ${mp} megapixels; Cutout accepts up to 40.`, 'Reduce its dimensions (for example with Compress), then try again.');
  }
  return bmp;
}

function ctx2d(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new ToolError('canvas', 'This browser cannot draw images in a worker.', 'Use a current browser version.');
  return ctx;
}

serve<CutoutRequest, CutoutResponse>(async (req, onProgress) => {
  if (req.type === 'segment') {
    const s = await ensureSession(req.engine);
    onProgress({ stage: 'processing', message: 'Removing background' }); // single inference: no knowable fraction
    const bmp = await decode(req.blob);
    const { width, height } = bmp;
    const n = MODEL.size;
    const c = new OffscreenCanvas(n, n);
    const ctx = ctx2d(c);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, n, n);
    bmp.close();
    const input = new ort!.Tensor('float32', toNchw(ctx.getImageData(0, 0, n, n).data, n, n, MODEL.mean, MODEL.std), [1, 3, n, n]);
    const t0 = performance.now();
    const out = await s.run({ [MODEL.inputName]: input });
    const inferenceMs = performance.now() - t0;
    const first = out[s.outputNames[0]!]!;
    const matte = toMatte(first.data as Float32Array);
    input.dispose();
    Object.values(out).forEach((t) => t.dispose());
    return { result: { kind: 'segment', matte, mw: n, mh: n, width, height, inferenceMs }, transfer: [matte.buffer] };
  }

  // Compose at full original resolution: the matte is scaled up by the canvas (bilinear or better).
  onProgress({ stage: 'exporting', message: 'Writing PNG' });
  const bmp = await decode(req.blob);
  const { width, height } = bmp;
  const c = new OffscreenCanvas(width, height);
  const ctx = ctx2d(c);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const mbmp = await createImageBitmap(new ImageData(matteToRgba(req.matte), req.mw, req.mh));
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mbmp, 0, 0, width, height);
  mbmp.close();
  const blob = await c.convertToBlob({ type: 'image/png' });
  if (blob.type !== 'image/png' || !isPng(new Uint8Array(await blob.slice(0, 8).arrayBuffer())))
    throw new ToolError('encode', 'This browser did not produce a valid PNG.', 'Try again in a current browser version.');
  return { result: { kind: 'compose', blob, width, height } };
});

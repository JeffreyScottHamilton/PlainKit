import type * as Ort from 'onnxruntime-web';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { ENGINE } from '@/engines/cutout/model';
import { FACE_MODEL as M, MAX_PIXELS } from '@/engines/face/model';
import { decodeLevel, letterbox, nms, padBox, toImageBox } from '@/engines/face/decode';
import type { FaceRequest, FaceResponse } from '@/engines/face/types';

// Face-detection worker, one per job (callWorker): cancel terminates it. ONNX Runtime is loaded
// from the same origin exactly as in the Cutout worker (absolute URL, one thread, wasm bytes passed in).
const initFailed = (detail: string) =>
  new ToolError(
    'engine-init',
    `The face-detection engine could not start in this browser (${detail}).`,
    'Use a current Chrome, Edge, Firefox or Safari with WebAssembly enabled, then try again.',
  );

async function load(engine: FaceRequest['engine']): Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> {
  if (typeof WebAssembly !== 'object') throw initFailed('no WebAssembly');
  try {
    const ort = (await import(/* @vite-ignore */ new URL(ENGINE.moduleUrl, self.location.origin).href)) as typeof Ort;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL('/engines/ort/', self.location.origin).href;
    ort.env.wasm.wasmBinary = engine.wasm;
    const session = await ort.InferenceSession.create(new Uint8Array(engine.model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
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
    throw new ToolError('too-large', `The image is ${mp} megapixels; face detection accepts up to 40.`, 'Reduce its dimensions (for example with Compress), then try again.');
  }
  return bmp;
}

serve<FaceRequest, FaceResponse>(async (req, onProgress) => {
  onProgress({ stage: 'processing', message: 'Starting the face detector' });
  const { ort, session } = await load(req.engine);
  const bmp = await decode(req.blob);
  const { width, height } = bmp;
  const n = M.size;
  const lb = letterbox(width, height, n);
  const c = new OffscreenCanvas(n, n);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ToolError('canvas', 'This browser cannot draw images in a worker.', 'Use a current browser version.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, lb.w, lb.h); // top-left; the rest stays transparent and is read as 0 (black), like OpenCV's zero padding
  bmp.close();
  // BGR, 0..255, NCHW (no mean/std): what OpenCV's blobFromImage feeds this model.
  const px = ctx.getImageData(0, 0, n, n).data;
  const plane = n * n;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const a = px[i * 4 + 3]!;
    data[i] = a ? px[i * 4 + 2]! : 0;
    data[plane + i] = a ? px[i * 4 + 1]! : 0;
    data[2 * plane + i] = a ? px[i * 4]! : 0;
  }
  const input = new ort.Tensor('float32', data, [1, 3, n, n]);
  onProgress({ stage: 'processing', message: 'Looking for faces' }); // single inference: no knowable fraction
  const t0 = performance.now();
  const out = await session.run({ [M.inputName]: input });
  const inferenceMs = performance.now() - t0;
  const found = M.strides.flatMap((s) => decodeLevel(out[`cls_${s}`]!.data as Float32Array, out[`obj_${s}`]!.data as Float32Array, out[`bbox_${s}`]!.data as Float32Array, s, n, M.scoreThreshold));
  input.dispose();
  Object.values(out).forEach((t) => t.dispose());
  const bounds = { width, height };
  const boxes = nms(found, M.nmsThreshold)
    .map((f) => ({ ...padBox(toImageBox(f, lb.scale, bounds), M.padding, bounds), score: f.score }))
    .filter((b) => b.w >= 2 && b.h >= 2);
  return { result: { kind: 'detect', boxes, width, height, inferenceMs } };
});

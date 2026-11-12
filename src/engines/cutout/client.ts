import { ToolError } from '@/lib/errors';
import type { EngineContext, JobProgress } from '@/jobs/types';
import { ENGINE, MODEL } from './model';
import { readCached, writeCached } from './cache';
import type { ComposeResult, CutoutRequest, CutoutResponse, SegmentResult } from './types';

// Model and engine bytes are held in memory for the tab session once downloaded (never re-downloaded
// in the same tab). They are written to Cache Storage only when the user opted in.
let loaded: { model: ArrayBuffer; wasm: ArrayBuffer } | null = null;
export const isModelLoaded = () => loaded !== null;

const ENGINE_KEY = `${ENGINE.wasmUrl}?v=1.31.1`;

async function hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Streamed same-origin download; reports bytes so the caller can compute a real fraction. */
async function download(url: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal, credentials: 'same-origin' });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ToolError('download', 'The model could not be downloaded from this site.', 'Check your connection, then try again.');
  }
  if (!res.ok || !res.body) throw new ToolError('download', `The model download failed (HTTP ${res.status}).`, 'Try again later.');
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.byteLength;
    onBytes(got);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out.buffer;
}

/** Ensure model + engine bytes are in memory: from the opt-in cache, else downloaded with progress. */
export async function ensureModel(keep: boolean, ctx: EngineContext): Promise<string[]> {
  if (loaded) return [];
  const warnings: string[] = [];
  const total = MODEL.bytes + ENGINE.bytes;
  const report = (done: number, msg: string) =>
    ctx.onProgress({ stage: 'loading-engine', fraction: Math.min(1, done / total), message: msg } satisfies JobProgress);

  let model = keep ? await readCached(MODEL.url) : null;
  let wasm = keep ? await readCached(ENGINE_KEY) : null;
  if (model && wasm) report(total, 'Loading model from this device');

  if (!model) model = await download(MODEL.url, ctx.signal, (n) => report(n, 'Downloading model'));
  if ((await hex(model)) !== MODEL.sha256)
    throw new ToolError('model-integrity', 'The downloaded model file is incomplete or does not match the expected version.', 'Reload the page and try again.');
  if (!wasm) wasm = await download(ENGINE.wasmUrl, ctx.signal, (n) => report(MODEL.bytes + n, 'Downloading model'));

  if (keep) {
    for (const [key, bytes] of [[MODEL.url, model], [ENGINE_KEY, wasm]] as const) {
      const w = await writeCached(key, bytes);
      if (w) {
        warnings.push(w);
        break;
      }
    }
  }
  loaded = { model, wasm };
  return warnings;
}

// One long-lived worker holds the loaded model between runs. Cancel = terminate it; the next run
// creates a new one and re-initialises from the in-memory bytes (no new download).
let warm: Worker | null = null;
let warmHasModel = false;
const create = () => new Worker(new URL('../../workers/cutout.worker.ts', import.meta.url), { type: 'module' });

export function disposeEngine() {
  warm?.terminate();
  warm = null;
  warmHasModel = false;
}

type Out = { type: 'progress'; progress: JobProgress } | { type: 'done'; result: CutoutResponse } | { type: 'error'; code: string; message: string; nextAction?: string };

function call(req: CutoutRequest, ctx: EngineContext): Promise<CutoutResponse> {
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(new DOMException('Canceled', 'AbortError'));
    const w = (warm ??= create());
    const cleanup = () => {
      ctx.signal.removeEventListener('abort', onAbort);
      w.onmessage = null;
      w.onerror = null;
    };
    const onAbort = () => {
      cleanup();
      disposeEngine();
      reject(new DOMException('Canceled', 'AbortError'));
    };
    ctx.signal.addEventListener('abort', onAbort);
    w.onmessage = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === 'progress') ctx.onProgress(m.progress);
      else if (m.type === 'done') {
        cleanup();
        resolve(m.result);
      } else {
        cleanup();
        if (m.code === 'engine-init') disposeEngine();
        reject(new ToolError(m.code, m.message, m.nextAction));
      }
    };
    w.onerror = (e) => {
      cleanup();
      disposeEngine();
      reject(new ToolError('worker-crash', e.message || 'The background-removal worker stopped unexpectedly (possibly out of memory).', 'Try a smaller image.'));
    };
    w.postMessage(req);
  });
}

/** Run the model on the image. Requires ensureModel() first. The original blob is cloned, never transferred. */
export async function segment(blob: Blob, ctx: EngineContext): Promise<SegmentResult> {
  if (!loaded) throw new ToolError('engine-missing', 'The model is not loaded.', 'Try again.');
  // Copies, so the in-memory originals survive a worker termination.
  const engine = warmHasModel ? undefined : { model: loaded.model.slice(0), wasm: loaded.wasm.slice(0) };
  const res = await call({ type: 'segment', blob, engine }, ctx);
  warmHasModel = true;
  if (res.kind !== 'segment') throw new ToolError('unexpected', 'The worker returned an unexpected answer.', 'Try again.');
  return res;
}

/** Apply a (refined) matte to the full-resolution original and encode PNG. */
export async function compose(blob: Blob, matte: Uint8Array, mw: number, mh: number, ctx: EngineContext): Promise<ComposeResult> {
  const res = await call({ type: 'compose', blob, matte, mw, mh }, ctx);
  if (res.kind !== 'compose') throw new ToolError('unexpected', 'The worker returned an unexpected answer.', 'Try again.');
  return res;
}

/** Exact size of a same-origin file from a HEAD request; falls back to the recorded constant. */
export async function headSize(url: string, fallback: number): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const n = Number(res.headers.get('Content-Length'));
    return res.ok && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** WebAssembly SIMD support, by validating a minimal SIMD module. ORT's CPU build needs it. */
export function hasWasmSimd(): boolean {
  try {
    return (
      typeof WebAssembly === 'object' &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
    );
  } catch {
    return false;
  }
}

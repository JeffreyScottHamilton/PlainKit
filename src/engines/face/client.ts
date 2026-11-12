import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext, JobProgress } from '@/jobs/types';
import { ENGINE } from '@/engines/cutout/model';
import { FACE_MODEL } from './model';
import type { FaceRequest, FaceResponse, FaceResult } from './types';

// Model and engine bytes stay in memory for the tab session once downloaded (no re-download).
// Not written to Cache Storage: the model is 0.2 MB and the engine is shared with Cutout's opt-in cache setting.
// The streamed download is a minimal copy of engines/cutout/client.ts (it is not exported there).
let loaded: { model: ArrayBuffer; wasm: ArrayBuffer } | null = null;
export const isFaceModelLoaded = () => loaded !== null;

async function hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function download(url: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal, credentials: 'same-origin' });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ToolError('download', 'The face-detection files could not be downloaded from this site.', 'Check your connection, then try again.');
  }
  if (!res.ok || !res.body) throw new ToolError('download', `The download failed (HTTP ${res.status}).`, 'Try again later.');
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

async function ensureLoaded(ctx: EngineContext): Promise<void> {
  if (loaded) return;
  const total = FACE_MODEL.bytes + ENGINE.bytes;
  const report = (done: number) => ctx.onProgress({ stage: 'loading-engine', fraction: Math.min(1, done / total), message: 'Downloading from this site' } satisfies JobProgress);
  const model = await download(FACE_MODEL.url, ctx.signal, report);
  if ((await hex(model)) !== FACE_MODEL.sha256)
    throw new ToolError('model-integrity', 'The downloaded model file is incomplete or does not match the expected version.', 'Reload the page and try again.');
  const wasm = await download(ENGINE.wasmUrl, ctx.signal, (n) => report(FACE_MODEL.bytes + n));
  loaded = { model, wasm };
}

function createWorker(): Worker {
  return new Worker(new URL('../../workers/face.worker.ts', import.meta.url), { type: 'module' });
}

/** Download (first use only), then detect in a worker. Boxes are padded and in original image pixels. Cancel terminates the worker. */
export async function detectFaces(blob: Blob, ctx: EngineContext): Promise<FaceResult> {
  await ensureLoaded(ctx);
  const engine = { model: loaded!.model.slice(0), wasm: loaded!.wasm.slice(0) }; // copies survive worker termination
  const res = await callWorker<FaceRequest, FaceResponse>(createWorker, { type: 'detect', blob, engine }, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (res.kind !== 'detect') throw new ToolError('unexpected', 'The worker returned an unexpected answer.', 'Try again.');
  return res;
}

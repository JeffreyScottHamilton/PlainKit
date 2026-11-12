import { ToolError } from '@/lib/errors';
import { callWorker } from '@/workers/rpc';
import type { EngineContext, EngineResult, JobProgress } from '@/jobs/types';
import { decodeAudio, estimateDecodedBytes, probeDuration } from '@/engines/audio/extract';
import { outputName } from '@/lib/format';
import { CACHE_NAME, CACHE_PREFIX, ENGINE, MAX_SECONDS, MODEL, REFERENCE_RTF, type StemName } from './model';
import type { SeparateRequest, SeparateResponse } from './types';

export type StemsResult = EngineResult & { info: { durationSec: number; channels: number; sampleRate: number; processingSec: number } };

// Model and engine bytes stay in memory for the tab session once downloaded. They go to Cache
// Storage only when the user opted in. Only caches named plainkit-model-* are touched here.
let loaded: { models: Record<StemName, ArrayBuffer>; wasm: ArrayBuffer } | null = null;
export const isModelLoaded = () => loaded !== null;
const ENGINE_KEY = `${ENGINE.wasmUrl}?v=1.31.1`;

/** Measured speed (processing s per audio s) of the last run in this tab; replaces the reference figure. */
let lastRtf: number | null = null;
export const estimateRtf = () => lastRtf ?? REFERENCE_RTF;
/** Rough processing time for the estimate shown before starting. Always an estimate. */
export const estimateSeconds = (durationSec: number) => durationSec * estimateRtf();
export const estimateIsMeasured = () => lastRtf !== null;

const hasCaches = () => typeof caches !== 'undefined';

async function readCached(key: string): Promise<ArrayBuffer | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(CACHE_NAME)).match(key);
    return res ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function writeCached(key: string, bytes: ArrayBuffer): Promise<string | null> {
  if (!hasCaches()) return 'This browser has no Cache Storage, so the model will be downloaded again next time.';
  try {
    const res = new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) } });
    await (await caches.open(CACHE_NAME)).put(key, res);
    return null;
  } catch (e) {
    return e instanceof DOMException && e.name === 'QuotaExceededError'
      ? 'Not enough storage to keep the model on this device. It stays in memory for this session only.'
      : 'Could not keep the model on this device. It stays in memory for this session only.';
  }
}

/** Bytes this tool keeps in Cache Storage (0 when nothing). Never throws. */
export async function cachedBytes(): Promise<number> {
  if (!hasCaches()) return 0;
  try {
    if (!(await caches.keys()).includes(CACHE_NAME)) return 0;
    const cache = await caches.open(CACHE_NAME);
    let bytes = 0;
    for (const req of await cache.keys()) bytes += Number((await cache.match(req))?.headers.get('Content-Length')) || 0;
    return bytes;
  } catch {
    return 0;
  }
}

/** Deletes this tool's model cache and the in-memory copy. */
export async function deleteStemCache(): Promise<void> {
  loaded = null;
  if (!hasCaches()) return;
  const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX) && n === CACHE_NAME);
  await Promise.all(names.map((n) => caches.delete(n)));
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

/** Model + engine bytes into memory: from the opt-in cache, else downloaded with real byte progress. */
export async function ensureModel(keep: boolean, ctx: EngineContext): Promise<string[]> {
  if (loaded) return [];
  const warnings: string[] = [];
  const total = MODEL.bytes + ENGINE.bytes;
  let base = 0;
  const report = (done: number, msg: string) => ctx.onProgress({ stage: 'loading-engine', fraction: Math.min(1, done / total), message: msg } satisfies JobProgress);
  const models = {} as Record<StemName, ArrayBuffer>;
  const toCache: [string, ArrayBuffer][] = [];
  for (const f of MODEL.files) {
    let bytes = keep ? await readCached(f.url) : null;
    if (bytes) report(base + f.bytes, 'Loading model from this device');
    else {
      bytes = await download(f.url, ctx.signal, (n) => report(base + n, 'Downloading model'));
      toCache.push([f.url, bytes]);
    }
    if ((await sha256(bytes)) !== f.sha256)
      throw new ToolError('model-integrity', 'A downloaded model file is incomplete or does not match the expected version.', 'Reload the page and try again.');
    models[f.stem] = bytes;
    base += f.bytes;
  }
  let wasm = keep ? await readCached(ENGINE_KEY) : null;
  if (!wasm) {
    wasm = await download(ENGINE.wasmUrl, ctx.signal, (n) => report(base + n, 'Downloading engine'));
    toCache.push([ENGINE_KEY, wasm]);
  }
  if (keep) {
    for (const [key, bytes] of toCache) {
      const w = await writeCached(key, bytes);
      if (w) {
        warnings.push(w);
        break;
      }
    }
  }
  loaded = { models, wasm };
  return warnings;
}

/** Decodes to 44.1 kHz on the main thread, then separates in a worker (cancel = terminate). */
export async function separateStems(blob: Blob, sourceName: string, keep: boolean, ctx: EngineContext): Promise<StemsResult> {
  ctx.onProgress({ stage: 'inspecting', message: 'Reading the file' });
  const tooLong = (sec: number) =>
    new ToolError('too-long', `This audio is ${(sec / 60).toFixed(1)} minutes long. Stem separation accepts up to ${MAX_SECONDS / 60} minutes.`, 'Trim it first with Extraction (start and end times), then try again.');
  const probed = await probeDuration(blob);
  ctx.signal.throwIfAborted();
  if (probed !== null && probed > MAX_SECONDS + 1) throw tooLong(probed);
  if (probed !== null && estimateDecodedBytes(probed, MODEL.sampleRate) > 400 * 1024 * 1024) throw tooLong(probed);

  const warnings = await ensureModel(keep, ctx);
  ctx.signal.throwIfAborted();

  ctx.onProgress({ stage: 'inspecting', message: `Decoding. The browser resamples audio to ${MODEL.sampleRate} Hz.` });
  const buf = await decodeAudio(await blob.arrayBuffer(), MODEL.sampleRate);
  ctx.signal.throwIfAborted();
  if (buf.duration > MAX_SECONDS + 1) throw tooLong(buf.duration);
  const nch = buf.numberOfChannels >= 2 ? 2 : 1;
  if (buf.numberOfChannels > 2) warnings.push(`This file has ${buf.numberOfChannels} channels; the first two are used.`);
  // Copies: the decoder's buffers are not ours, and the worker takes ownership of these.
  const channels = Array.from({ length: nch }, (_, c) => buf.getChannelData(c).slice());
  const engine = { models: {} as Record<StemName, ArrayBuffer>, wasm: loaded!.wasm.slice(0) };
  for (const f of MODEL.files) engine.models[f.stem] = loaded!.models[f.stem].slice(0);
  const transfer = [...channels.map((c) => c.buffer as ArrayBuffer), ...Object.values(engine.models), engine.wasm];

  const res = await callWorker<SeparateRequest, SeparateResponse>(
    () => new Worker(new URL('../../workers/stems.worker.ts', import.meta.url), { type: 'module' }),
    { type: 'separate', channels, engine },
    { signal: ctx.signal, onProgress: ctx.onProgress, transfer },
  );
  const durationSec = buf.length / MODEL.sampleRate;
  lastRtf = res.processingMs / 1000 / durationSec;
  return {
    outputs: res.stems.map((s) => ({ name: outputName(sourceName, s.stem, 'wav'), mime: 'audio/wav', blob: new Blob([s.wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }) })),
    warnings,
    info: { durationSec, channels: nch, sampleRate: MODEL.sampleRate, processingSec: res.processingMs / 1000 },
  };
}

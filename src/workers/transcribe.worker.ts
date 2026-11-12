import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { CACHE_NAME, ENGINE, MODEL_BYTES, WHISPER } from '@/engines/transcribe/model';
import type { Segment } from '@/engines/transcribe/cues';
import type { TranscribeRequest, TranscribeResponse } from '@/engines/transcribe/types';

// Speech recognition worker. One job per worker: cancel terminates it (see workers/rpc.ts).
// Everything is loaded from this site. The library's default would fetch its ONNX Runtime from a CDN,
// so wasmPaths is set here to same-origin files copied by scripts/copy-transcribe.mjs.
const origin = self.location.origin;

serve<TranscribeRequest, TranscribeResponse>(async (req, onProgress) => {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  // Must stay a path, not an absolute URL: the library only checks for local metadata files when it is not an http(s) URL.
  env.localModelPath = WHISPER.localModelPath;
  env.useWasmCache = false; // ORT fetches its own wasm from wasmPaths; no hidden cache outside plainkit-model-*
  env.useBrowserCache = false;
  env.useCustomCache = false;
  let cacheWarning: string | null = null;
  if (req.keep && typeof caches !== 'undefined') {
    try {
      env.customCache = await caches.open(CACHE_NAME);
      env.useCustomCache = true;
    } catch {
      cacheWarning = 'Could not keep the model on this device. It stays in memory for this session only.';
    }
  } else if (req.keep) cacheWarning = 'This browser has no Cache Storage, so the model will be downloaded again next time.';

  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw new ToolError('engine-init', 'The speech engine could not start in this browser.', 'Use a current Chrome, Edge, Firefox or Safari with WebAssembly enabled.');
  wasm.numThreads = 1; // no cross-origin isolation: single thread
  wasm.proxy = false;
  wasm.wasmPaths = { mjs: new URL(ENGINE.moduleUrl, origin).href, wasm: new URL(ENGINE.wasmUrl, origin).href };

  // Real byte progress: sum of what each model file has loaded so far, over the known total.
  const loaded = new Map<string, number>();
  const onFile = (p: ProgressInfo) => {
    if (p.status === 'progress') {
      loaded.set(p.file, p.loaded);
      let sum = 0;
      for (const v of loaded.values()) sum += v;
      onProgress({ stage: 'loading-engine', fraction: Math.min(1, sum / MODEL_BYTES), message: 'Loading the speech model' });
    }
  };

  onProgress({ stage: 'loading-engine', message: 'Loading the speech model' });
  const t0 = performance.now();
  let asr: AutomaticSpeechRecognitionPipeline;
  try {
    asr = await pipeline('automatic-speech-recognition', WHISPER.id, { device: 'wasm', dtype: WHISPER.dtype, progress_callback: onFile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ToolError('engine-init', `The speech model could not be loaded (${msg.slice(0, 160)}).`, 'Reload the page and try again. If it keeps failing, this browser may not support WebAssembly.');
  }
  const loadMs = performance.now() - t0;

  // The library reports no per-chunk progress, so the fraction stays unknown.
  onProgress({ stage: 'processing', message: 'Recognising speech' });
  const t1 = performance.now();
  const out = await asr(req.pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  const inferMs = performance.now() - t1;
  const res = Array.isArray(out) ? out[0] : out;
  const segments: Segment[] = ((res?.chunks ?? []) as { text: string; timestamp: [number | null, number | null] }[]).map((c) => ({
    startMs: (c.timestamp[0] ?? Number.NaN) * 1000,
    endMs: c.timestamp[1] == null ? null : c.timestamp[1] * 1000,
    text: c.text,
  }));
  if (segments.length === 0 && res?.text) segments.push({ startMs: 0, endMs: null, text: res.text });
  await asr.dispose();
  return { result: { segments, loadMs, inferMs, cacheWarning } };
});

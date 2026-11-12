import type * as Ort from 'onnxruntime-web';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { applyMask, F, Fft, istft, magnitudes, mixSegment, N_FFT, periodicHann, planSegments, ratioMasks, stft, T } from '@/engines/stems/dsp';
import { allocWav, writeFrames } from '@/engines/stems/wavstream';
import { ENGINE, MODEL, OVERLAP, SEGMENT, STEM_NAMES, type StemName } from '@/engines/stems/model';
import type { SeparateRequest, SeparateResponse } from '@/engines/stems/types';

// One worker per job: cancel = terminate (callWorker). ONNX Runtime is loaded at runtime from the
// same origin (public/engines/ort), never bundled or fetched from a CDN.
const initFailed = (detail: string) =>
  new ToolError('engine-init', `The stem separation engine could not start in this browser (${detail}).`, 'Use a current Chrome, Edge, Firefox or Safari with WebAssembly enabled, then try again.');

async function createSessions(engine: SeparateRequest['engine']): Promise<{ ort: typeof Ort; sessions: Record<StemName, Ort.InferenceSession> }> {
  if (typeof WebAssembly !== 'object') throw initFailed('no WebAssembly');
  try {
    // Absolute URL: Vite's dev server appends ?import to root-relative dynamic imports, which /public files reject.
    const ort = (await import(/* @vite-ignore */ new URL(ENGINE.moduleUrl, self.location.origin).href)) as typeof Ort;
    ort.env.wasm.numThreads = 1; // no cross-origin isolation: single thread
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL('/engines/ort/', self.location.origin).href;
    ort.env.wasm.wasmBinary = engine.wasm;
    const sessions = {} as Record<StemName, Ort.InferenceSession>;
    for (const f of MODEL.files)
      sessions[f.stem] = await ort.InferenceSession.create(new Uint8Array(engine.models[f.stem]), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, sessions };
  } catch (e) {
    throw initFailed(e instanceof Error ? e.message.slice(0, 160) : 'unknown error');
  }
}

const fmtMin = (sec: number) => (sec < 90 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`);

serve<SeparateRequest, SeparateResponse>(async (req, onProgress) => {
  const chs = req.channels;
  const nch = chs.length;
  const n = chs[0]?.length ?? 0;
  if ((nch !== 1 && nch !== 2) || n === 0 || chs.some((c) => c.length !== n)) throw new ToolError('bad-input', 'There is no audio to separate.', 'Choose a file that has an audio track.');
  onProgress({ stage: 'processing', message: 'Starting the model' });
  const { ort, sessions } = await createSessions(req.engine);

  const fft = new Fft(N_FFT);
  const win = periodicHann(N_FFT);
  const plan = planSegments(n, SEGMENT, OVERLAP);
  const wavs = STEM_NAMES.map(() => allocWav(n, nch, MODEL.sampleRate));
  const carries: (Float32Array | null)[][] = STEM_NAMES.map(() => chs.map(() => null));
  let written = 0;
  const t0 = performance.now();

  for (let si = 0; si < plan.length; si++) {
    const { start, end } = plan[si]!;
    const first = si === 0;
    const last = si === plan.length - 1;
    const specs = chs.map((c) => stft(c.subarray(start, end), fft, win));
    const specFor = (c: number) => specs[c]!;
    const input = new Float32Array(2 * T * F);
    magnitudes(specFor(0), input, 0);
    if (nch === 2) magnitudes(specFor(1), input, T * F);
    else input.copyWithin(T * F, 0, T * F); // mono: the network is stereo, feed the same channel twice

    const est: Float32Array[][] = [];
    for (const stem of STEM_NAMES) {
      const out = await sessions[stem].run({ x: new ort.Tensor('float32', input, [2, 1, T, F]) });
      const y = out['y']!.data as Float32Array;
      est.push([y.slice(0, T * F), y.slice(T * F)]);
      out['y']!.dispose();
    }
    const finals: Float32Array[][] = STEM_NAMES.map(() => []);
    for (let c = 0; c < nch; c++) {
      const e = est.map((x) => x[c]!);
      ratioMasks(e, specFor(c).frames);
      STEM_NAMES.forEach((_, k) => {
        const y = istft(applyMask(specFor(c), e[k]!, 0), end - start, fft, win);
        const m = mixSegment(y, carries[k]![c]!, OVERLAP, first, last);
        carries[k]![c] = m.carry;
        finals[k]!.push(m.final);
      });
    }
    STEM_NAMES.forEach((_, k) => writeFrames(wavs[k]!, written, finals[k]!));
    written += finals[0]![0]!.length;

    const done = si + 1;
    const elapsed = (performance.now() - t0) / 1000;
    onProgress({
      stage: 'processing',
      fraction: done / plan.length,
      message: done < plan.length ? `Separating, segment ${done} of ${plan.length}. About ${fmtMin((elapsed / done) * (plan.length - done))} left (estimate from the speed so far).` : 'Writing WAV files',
    });
  }
  const processingMs = performance.now() - t0;
  return { result: { stems: STEM_NAMES.map((stem, k) => ({ stem, wav: wavs[k]! })), processingMs, segments: plan.length }, transfer: wavs.map((w) => w.buffer as ArrayBuffer) };
});

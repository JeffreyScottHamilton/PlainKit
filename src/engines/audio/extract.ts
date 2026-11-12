import { ToolError } from '@/lib/errors';
import { callWorker } from '@/workers/rpc';
import type { EngineContext, EngineResult } from '@/jobs/types';
import { computePeaks, type Peaks } from './peaks';
import type { EncodeRequest, EncodeResponse } from './messages';
import { trimRange } from './wav';

export const SAMPLE_RATES = [44100, 48000] as const;
export type SampleRate = (typeof SAMPLE_RATES)[number];
export type ExtractOptions = { sampleRate: SampleRate; mono: boolean; startSec?: number; endSec?: number };
export type AudioInfo = { durationSec: number; channels: number; sampleRate: number; frames: number };
export type ExtractResult = EngineResult & { info: AudioInfo; peaks: Peaks };

export const WARN_DECODED_BYTES = 300 * 1024 * 1024;
export const MAX_DECODED_BYTES = 1.5 * 1024 * 1024 * 1024;
const PEAK_COLUMNS = 800;
const PROBE_MS = 8000;

/** Worst case stereo float32 estimate, used before decoding. */
export const estimateDecodedBytes = (durationSec: number, sampleRate: number, channels = 2): number => durationSec * sampleRate * channels * 4;
const mb = (n: number) => Math.round(n / (1024 * 1024));

/** Duration from the browser's media metadata. Null when the browser cannot read it. */
export async function probeDuration(blob: Blob): Promise<number | null> {
  if (typeof document === 'undefined') return null;
  const el = document.createElement(blob.type.startsWith('video/') ? 'video' : 'audio');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<number | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), PROBE_MS);
      const done = (d: number | null) => {
        window.clearTimeout(timer);
        resolve(d);
      };
      el.preload = 'metadata';
      el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
      el.onerror = () => done(null);
      el.src = url;
    });
  } finally {
    el.removeAttribute('src');
    el.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes with the browser. Runs on the main thread on purpose: AudioContext is not available in workers.
 * The browser resamples to the context rate, so the decoded rate is the rate requested here.
 */
export async function decodeAudio(bytes: ArrayBuffer, sampleRate: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate });
  try {
    return await ctx.decodeAudioData(bytes);
  } catch {
    throw new ToolError('decode-unsupported', 'This browser could not decode the audio in this file.', 'Try a different file, or convert it to MP4/WebM/MP3/WAV first.');
  }
}

function downmix(chs: Float32Array[]): Float32Array {
  const out = new Float32Array(chs[0]!.length);
  for (const c of chs) for (let i = 0; i < out.length; i++) out[i]! += c[i]! / chs.length;
  return out;
}

const createEncodeWorker = () => new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });

/** Source file -> trimmed WAV (16-bit PCM) at the chosen sample rate. Stages: inspecting, processing, exporting. */
export async function extractAudio(blob: Blob, outName: string, opts: ExtractOptions, ctx: EngineContext): Promise<ExtractResult> {
  const warnings: string[] = [];
  ctx.onProgress({ stage: 'inspecting', message: 'Reading the file' });
  const duration = await probeDuration(blob);
  ctx.signal.throwIfAborted();
  if (duration !== null) {
    const est = estimateDecodedBytes(duration, opts.sampleRate);
    if (est > MAX_DECODED_BYTES)
      throw new ToolError('too-large-decoded', `Decoding this audio would need about ${mb(est)} MB of memory.`, 'Use a shorter file, or trim it with start and end times.');
    if (est > WARN_DECODED_BYTES) warnings.push(`Long audio: decoding needs about ${mb(est)} MB of memory. The tab may slow down.`);
  }

  const bytes = await blob.arrayBuffer();
  ctx.onProgress({ stage: 'processing', message: `Decoding. The browser resamples audio to ${opts.sampleRate} Hz.` });
  const buf = await decodeAudio(bytes, opts.sampleRate);
  ctx.signal.throwIfAborted();
  const decodedBytes = buf.length * buf.numberOfChannels * 4;
  if (decodedBytes > MAX_DECODED_BYTES)
    throw new ToolError('too-large-decoded', `Decoding this audio needs about ${mb(decodedBytes)} MB of memory.`, 'Use a shorter file, or trim it with start and end times.');
  if (decodedBytes > WARN_DECODED_BYTES) warnings.push(`Long audio: about ${mb(decodedBytes)} MB decoded in memory.`);

  const { start, end } = trimRange(buf.length, opts.sampleRate, opts.startSec, opts.endSec);
  // Copies, so the decoder's own buffers are never handed to the worker.
  const copies = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice(start, end));
  const channels = opts.mono && copies.length > 1 ? [downmix(copies)] : copies;
  const peaks = computePeaks(channels, PEAK_COLUMNS);

  ctx.onProgress({ stage: 'exporting', message: 'Writing WAV' });
  const res = await callWorker<EncodeRequest, EncodeResponse>(
    createEncodeWorker,
    { type: 'encode', channels, sampleRate: opts.sampleRate },
    { signal: ctx.signal, transfer: channels.map((c) => c.buffer as ArrayBuffer) },
  );
  const frames = end - start;
  return {
    outputs: [{ name: outName, mime: 'audio/wav', blob: new Blob([res.bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }) }],
    warnings,
    info: { durationSec: frames / opts.sampleRate, channels: channels.length, sampleRate: opts.sampleRate, frames },
    peaks,
  };
}

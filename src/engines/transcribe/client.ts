import { ToolError } from '@/lib/errors';
import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import { decodeAudio, probeDuration } from '@/engines/audio/extract';
import { segmentsToCues } from './cues';
import { ENGINE, MAX_SECONDS, SAMPLE_RATE } from './model';
import type { TranscribeRequest, TranscribeResponse } from './types';
import type { Cue } from '@/engines/subtitles/model';

const MAX_FILE_BYTES = 600 * 1024 * 1024; // the whole file is decoded in memory

export type TranscribeResult = { cues: Cue[]; audioSec: number; tookSec: number; warnings: string[] };

const create = () => new Worker(new URL('../../workers/transcribe.worker.ts', import.meta.url), { type: 'module' });

const tooLong = (sec: number) =>
  new ToolError('too-long', `This recording is ${Math.round(sec / 60)} minutes long. Transcription accepts up to ${MAX_SECONDS / 60} minutes.`, 'Trim it to a shorter part (for example with Convert or Video), then try again.');

/** Decode any audio or video file the browser can read to mono 16 kHz float PCM (what the model expects). */
export async function toMono16k(blob: Blob): Promise<Float32Array> {
  if (blob.size > MAX_FILE_BYTES)
    throw new ToolError('too-large', 'This file is too large to decode in the browser for transcription.', 'Extract just the audio first (Audio extraction), then try again.');
  const buf = await decodeAudio(await blob.arrayBuffer(), SAMPLE_RATE);
  if (buf.duration > MAX_SECONDS) throw tooLong(buf.duration);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / buf.numberOfChannels;
  }
  return out;
}

/** Transcribe on this device. Runs in a fresh worker; cancelling terminates it. */
export async function transcribe(blob: Blob, keep: boolean, ctx: EngineContext): Promise<TranscribeResult> {
  ctx.onProgress({ stage: 'inspecting', message: 'Reading the audio' });
  const probed = await probeDuration(blob);
  if (probed !== null && probed > MAX_SECONDS) throw tooLong(probed);
  ctx.signal.throwIfAborted();
  const pcm = await toMono16k(blob);
  ctx.signal.throwIfAborted();
  const audioSec = pcm.length / SAMPLE_RATE;
  const t0 = performance.now();
  const res = await callWorker<TranscribeRequest, TranscribeResponse>(
    create,
    { type: 'transcribe', pcm, keep },
    { signal: ctx.signal, onProgress: ctx.onProgress, transfer: [pcm.buffer] },
  );
  const tookSec = (performance.now() - t0) / 1000;
  const cues = segmentsToCues(res.segments, audioSec * 1000);
  const warnings = res.cacheWarning ? [res.cacheWarning] : [];
  if (cues.length === 0) warnings.push('No speech was recognised. The recording may be silent, too quiet, or not English.');
  return { cues, audioSec, tookSec, warnings };
}

/** True when the engine files are present on this site (they are copied at build time, not committed). */
export async function engineAvailable(): Promise<boolean> {
  try {
    const res = await fetch(ENGINE.wasmUrl, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

import { ToolError } from '@/lib/errors';
import { callWorker } from '@/workers/rpc';
import type { EngineContext } from '@/jobs/types';
import { decodeAudio, estimateDecodedBytes, MAX_DECODED_BYTES } from '@/engines/audio/extract';
import type { EditOptions } from './dsp';
import type { EditRequest, EditResponse, ExportFormat } from './messages';

/** The browser resamples every source to this rate. Output WAV and M4A/WebM use it. */
export const DECODE_RATE = 48000;

export type Source = { channels: Float32Array[]; sampleRate: number; durationSec: number };
export type FormatSupport = Record<ExportFormat, { available: boolean; reason?: string }>;

const createWorker = () => new Worker(new URL('../../workers/audio-edit.worker.ts', import.meta.url), { type: 'module' });

/**
 * Audio or video file -> planar Float32 channels at DECODE_RATE. Uses AudioContext.decodeAudioData through
 * the shared decoder, so video files work when the browser can decode their audio track.
 */
export async function decodeSource(blob: Blob): Promise<Source> {
  const buf = await decodeAudio(await blob.arrayBuffer(), DECODE_RATE);
  const bytes = estimateDecodedBytes(buf.duration, DECODE_RATE, buf.numberOfChannels);
  if (bytes > MAX_DECODED_BYTES)
    throw new ToolError('too-large-decoded', 'This audio is too long to edit in this browser.', 'Use a shorter file.');
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  return { channels, sampleRate: DECODE_RATE, durationSec: buf.duration };
}

/** Which export formats this browser can write. Unavailable formats carry the reason shown to the user. */
export async function probeExportFormats(): Promise<FormatSupport> {
  const { probeAudioCodecs } = await import('./encode');
  const codecs = await probeAudioCodecs().catch(() => ({ aac: false, opus: false }));
  return {
    wav: { available: true },
    m4a: codecs.aac ? { available: true } : { available: false, reason: 'This browser cannot encode AAC audio.' },
    webm: codecs.opus ? { available: true } : { available: false, reason: 'This browser cannot encode Opus audio.' },
  };
}

/** Edits and encodes already-selected channels in a worker. The channels are transferred, so pass copies. */
export function exportEdit(channels: Float32Array[], sampleRate: number, options: EditOptions, format: ExportFormat, ctx: EngineContext): Promise<EditResponse> {
  ctx.onProgress({ stage: 'processing', message: 'Editing and encoding' });
  return callWorker<EditRequest, EditResponse>(createWorker, { type: 'export', channels, sampleRate, options, format }, {
    signal: ctx.signal,
    transfer: channels.map((c) => c.buffer as ArrayBuffer),
  });
}

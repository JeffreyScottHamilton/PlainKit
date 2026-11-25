import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, Mp4OutputFormat, Output, WebMOutputFormat, type AudioCodec } from 'mediabunny';
import { ToolError } from '@/lib/errors';
import { encodeWav16 } from '@/engines/audio/wav';
import type { ExportFormat } from './messages';

/** Compressed formats. WAV uses the shared 16-bit writer and never goes through mediabunny. */
const COMPRESSED: Record<Exclude<ExportFormat, 'wav'>, { codec: AudioCodec; bitrate: number; mime: string }> = {
  m4a: { codec: 'aac', bitrate: 128_000, mime: 'audio/mp4' },
  webm: { codec: 'opus', bitrate: 96_000, mime: 'audio/webm' },
};

// Mediabunny has no built-in AAC encoder; this package supplies one. Idempotent.
async function registerAac(): Promise<void> {
  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();
}

/** Which compressed codecs mediabunny can encode here. Checked on the main thread before the UI offers them. */
export async function probeAudioCodecs(): Promise<{ aac: boolean; opus: boolean }> {
  await registerAac();
  const ok = async (codec: AudioCodec) => {
    try {
      return await canEncodeAudio(codec, { numberOfChannels: 2, sampleRate: 48000 });
    } catch {
      return false;
    }
  };
  const [aac, opus] = await Promise.all([ok('aac'), ok('opus')]);
  return { aac, opus };
}

/** One second per block keeps encoder calls bounded for long clips. */
const BLOCK_SECONDS = 1;

/** Channels (-1..1, planar) -> encoded bytes. Throws ToolError if the browser cannot encode the format. */
export async function encodeEdit(channels: Float32Array[], sampleRate: number, format: ExportFormat): Promise<{ bytes: Uint8Array; mime: string }> {
  if (format === 'wav') return { bytes: encodeWav16(channels, sampleRate), mime: 'audio/wav' };
  const spec = COMPRESSED[format];
  if (format === 'm4a') await registerAac();
  const ch = channels.length;
  const frames = channels[0]?.length ?? 0;
  const output = new Output({ format: format === 'm4a' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const source = new AudioSampleSource({ codec: spec.codec, bitrate: spec.bitrate });
  output.addAudioTrack(source);
  await output.start();
  const block = Math.round(sampleRate * BLOCK_SECONDS);
  for (let start = 0; start < frames; start += block) {
    const n = Math.min(block, frames - start);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) {
      const src = channels[c]!;
      for (let i = 0; i < n; i++) data[i * ch + c] = src[start + i]!;
    }
    const sample = new AudioSample({ data, format: 'f32', numberOfChannels: ch, sampleRate, timestamp: start / sampleRate });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
  }
  source.close();
  await output.finalize();
  const buf = output.target.buffer;
  if (!buf) throw new ToolError('encode-failed', `The browser did not return the ${format.toUpperCase()} file.`, 'Export as WAV, or try again.');
  return { bytes: new Uint8Array(buf), mime: spec.mime };
}

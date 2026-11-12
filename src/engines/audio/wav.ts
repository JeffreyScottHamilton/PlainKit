import { ToolError } from '@/lib/errors';

/** Pure WAV code (no DOM, no Web Audio). Output is 16-bit PCM, interleaved. */
export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataBytes: number;
  frames: number;
  durationSec: number;
};

const HEADER = 44;
const MAX_DATA_BYTES = 0xffffffff - 36;

function ascii(v: DataView, at: number, text: string): void {
  for (let i = 0; i < text.length; i++) v.setUint8(at + i, text.charCodeAt(i));
}

const readAscii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/**
 * Encodes equal-length channel arrays (-1..1) as 16-bit PCM WAV.
 * Values are clamped. dither adds TPDF noise of one LSB (off by default); random is injectable for tests.
 */
export function encodeWav16(channels: Float32Array[], sampleRate: number, opts: { dither?: boolean; random?: () => number } = {}): Uint8Array {
  const ch = channels.length;
  if (ch < 1) throw new ToolError('wav-empty', 'There is no audio to write.', 'Choose a file that has an audio track.');
  const frames = channels[0]!.length;
  if (channels.some((c) => c.length !== frames)) throw new Error('channel lengths differ');
  const dataBytes = frames * ch * 2;
  if (dataBytes > MAX_DATA_BYTES) throw new ToolError('wav-too-large', 'The result is too large for a WAV file.', 'Trim the audio or lower the sample rate.');
  const out = new Uint8Array(HEADER + dataBytes);
  const v = new DataView(out.buffer);
  ascii(v, 0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(v, 8, 'WAVE');
  ascii(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  ascii(v, 36, 'data');
  v.setUint32(40, dataBytes, true);

  const rnd = opts.random ?? Math.random;
  let o = HEADER;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < ch; c++) {
      const x = Math.min(1, Math.max(-1, channels[c]![f]!));
      const d = opts.dither ? rnd() + rnd() - 1 : 0;
      const scaled = (x < 0 ? x * 32768 : x * 32767) + d;
      v.setInt16(o, Math.min(32767, Math.max(-32768, Math.round(scaled))), true);
      o += 2;
    }
  }
  return out;
}

/** Parses the RIFF header of a 16-bit PCM WAV. Throws Error for anything else. Used by tests and checks. */
export function parseWav(bytes: Uint8Array): WavInfo {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt: { channels: number; sampleRate: number; bits: number; blockAlign: number } | null = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = readAscii(bytes, pos, 4);
    const size = v.getUint32(pos + 4, true);
    if (id === 'fmt ') {
      const format = v.getUint16(pos + 8, true);
      if (format !== 1) throw new Error(`unsupported WAV format ${format}`);
      fmt = { channels: v.getUint16(pos + 10, true), sampleRate: v.getUint32(pos + 12, true), blockAlign: v.getUint16(pos + 20, true), bits: v.getUint16(pos + 22, true) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('data chunk before fmt chunk');
      if (fmt.bits !== 16) throw new Error(`unsupported bit depth ${fmt.bits}`);
      const dataBytes = Math.min(size, bytes.length - pos - 8);
      const frames = Math.floor(dataBytes / fmt.blockAlign);
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: 16, blockAlign: fmt.blockAlign, dataOffset: pos + 8, dataBytes, frames, durationSec: frames / fmt.sampleRate };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

/** Frame range [start, end) for an optional trim in seconds. Validates before any work. */
export function trimRange(frames: number, sampleRate: number, startSec?: number, endSec?: number): { start: number; end: number } {
  const total = frames / sampleRate;
  const s = startSec ?? 0;
  const e = endSec ?? total;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || s >= total)
    throw new ToolError('invalid-trim', 'The trim times do not fit this audio.', `Use a start from 0 and an end after the start, up to ${total.toFixed(2)} s.`);
  const start = Math.round(s * sampleRate);
  const end = Math.min(frames, Math.round(Math.min(e, total) * sampleRate));
  if (end <= start) throw new ToolError('invalid-trim', 'The trim range is empty.', 'Make the end time later than the start time.');
  return { start, end };
}

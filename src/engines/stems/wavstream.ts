// 16-bit PCM WAV written in place: the header is filled up front and finished samples are
// converted straight into the output buffer, so a long track holds one Int16 copy per stem.
const HEADER = 44;

export function allocWav(frames: number, channels: number, sampleRate: number): Uint8Array {
  const dataBytes = frames * channels * 2;
  const out = new Uint8Array(HEADER + dataBytes);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, dataBytes, true);
  return out;
}

/** Converts equal-length channel arrays (clamped, same scaling as engines/audio/wav.ts) at `frameOffset`. */
export function writeFrames(wav: Uint8Array, frameOffset: number, chs: Float32Array[]): void {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const n = chs[0]!.length;
  let o = HEADER + frameOffset * chs.length * 2;
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < chs.length; c++) {
      const x = Math.min(1, Math.max(-1, chs[c]![f]!));
      v.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true);
      o += 2;
    }
  }
}

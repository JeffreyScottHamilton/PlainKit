/** Min and max sample per column across all channels, for a waveform. Pure. */
export type Peaks = { min: Float32Array; max: Float32Array };

export function computePeaks(channels: Float32Array[], columns: number): Peaks {
  const frames = channels[0]?.length ?? 0;
  const cols = Math.max(1, Math.min(columns, frames));
  const min = new Float32Array(cols);
  const max = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    const s = Math.floor((i * frames) / cols);
    const e = Math.max(s + 1, Math.floor(((i + 1) * frames) / cols));
    let lo = 0;
    let hi = 0;
    for (const ch of channels)
      for (let f = s; f < e; f++) {
        const x = ch[f]!;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max };
}

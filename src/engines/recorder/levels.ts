/** Peak amplitude of a time-domain buffer: 0 for silence, 1 for full scale. */
export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (const v of samples) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  return Math.min(1, peak);
}

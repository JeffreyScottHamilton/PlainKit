const pad = (n: number) => String(n).padStart(2, '0');

/** m:ss, or h:mm:ss from one hour up. Floors to whole seconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Bytes per minute so far, extrapolated from what has been captured. null until 2 s have elapsed,
 * because the first second says little about the bitrate.
 */
export function estimatePerMinute(bytes: number, elapsedMs: number): number | null {
  if (elapsedMs < 2000) return null;
  return (bytes / elapsedMs) * 60_000;
}

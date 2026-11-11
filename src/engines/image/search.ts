/**
 * Bounded search for the highest JPEG/WebP quality whose output fits a byte target.
 * Pure: the encoder is a callback, so the search is unit-testable with a fake encoder.
 *
 * Encodes used, at most `maxEncodes` (default 8):
 *   1. lowest quality. If it is still too large, stop: the target is unreachable at these dimensions.
 *   2. highest quality. If it fits, stop.
 *   3. binary search between them for the rest.
 * Progress is reported as encodes / maxEncodes, which is the real fraction of the budget.
 */
export type SearchProbe<T> = { quality: number; size: number; value: T };
export type SearchOutcome<T> = { targetMet: boolean; best: SearchProbe<T>; encodes: number };
export type SearchOptions<T> = {
  targetBytes: number;
  encode: (quality: number) => Promise<{ size: number; value: T }>;
  onProgress?: (fraction: number) => void;
  minQuality?: number;
  maxQuality?: number;
  maxEncodes?: number;
};

export const DEFAULT_MIN_QUALITY = 0.05;
export const DEFAULT_MAX_QUALITY = 0.95;
export const DEFAULT_MAX_ENCODES = 8;

export async function searchQualityForTarget<T>(o: SearchOptions<T>): Promise<SearchOutcome<T>> {
  const minQ = o.minQuality ?? DEFAULT_MIN_QUALITY;
  const maxQ = o.maxQuality ?? DEFAULT_MAX_QUALITY;
  const max = o.maxEncodes ?? DEFAULT_MAX_ENCODES;
  if (!(o.targetBytes > 0)) throw new RangeError('targetBytes must be positive');
  if (!Number.isInteger(max) || max < 2) throw new RangeError('maxEncodes must be an integer of at least 2');
  if (!(minQ > 0 && minQ < maxQ && maxQ <= 1)) throw new RangeError('quality range must satisfy 0 < min < max <= 1');

  let encodes = 0;
  const probe = async (quality: number): Promise<SearchProbe<T>> => {
    const r = await o.encode(quality);
    encodes++;
    o.onProgress?.(encodes / max);
    return { quality, size: r.size, value: r.value };
  };

  const lowest = await probe(minQ);
  if (lowest.size > o.targetBytes) return { targetMet: false, best: lowest, encodes };

  const highest = await probe(maxQ);
  if (highest.size <= o.targetBytes) return { targetMet: true, best: highest, encodes };

  let best = lowest;
  let lo = minQ;
  let hi = maxQ;
  while (encodes < max && hi - lo > 0.01) {
    const mid = Math.round(((lo + hi) / 2) * 1000) / 1000;
    const p = await probe(mid);
    if (p.size <= o.targetBytes) {
      lo = mid;
      best = p;
    } else {
      hi = mid;
    }
  }
  return { targetMet: true, best, encodes };
}

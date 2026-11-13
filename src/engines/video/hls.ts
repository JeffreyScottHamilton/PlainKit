// Pure HLS playlist parser. No network. Unsupported streams return a plain message for the UI.

export const MAX_SEGMENTS = 2000;

export type HlsVariant = { url: string; bandwidth: number; resolution?: { width: number; height: number } };
export type HlsSegment = { url: string; durationSec: number };
export type HlsParsed =
  | { ok: true; kind: 'master'; variants: HlsVariant[] }
  | { ok: true; kind: 'media'; segments: HlsSegment[]; totalSec: number }
  | { ok: false; message: string };

export const HLS_MESSAGES = {
  notHls: 'This is not an HLS playlist (it does not start with #EXTM3U).',
  live: 'Live streams are not supported',
  encrypted: 'This stream is encrypted or DRM-protected and is not supported',
  byteRange: 'Byte-range segments are not supported yet.',
  fmp4: 'Fragmented MP4 (fMP4) HLS is not supported yet. Only MPEG-TS segments can be saved.',
  tooMany: `This playlist has more than ${MAX_SEGMENTS} segments, which is over the limit.`,
  empty: 'The playlist has no media segments.',
  badUrl: 'The playlist points to a link that is not a valid https:// address.',
  httpsOnly: 'The playlist points to a link that is not https://. Only https:// links are supported.',
} as const;

/** Parses KEY=VALUE pairs of one tag. Quoted values are unquoted. */
function attributes(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  for (const m of line.matchAll(re)) out[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  return out;
}

type Resolved = { ok: true; url: string } | { ok: false; message: string };
function resolveHttps(uri: string, base: string): Resolved {
  let u: URL;
  try {
    u = new URL(uri, base);
  } catch {
    return { ok: false, message: HLS_MESSAGES.badUrl };
  }
  if (u.protocol !== 'https:') return { ok: false, message: HLS_MESSAGES.httpsOnly };
  if (u.username || u.password) return { ok: false, message: HLS_MESSAGES.badUrl };
  return { ok: true, url: u.href };
}

export function parseHls(text: string, baseUrl: string): HlsParsed {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== '#EXTM3U') return { ok: false, message: HLS_MESSAGES.notHls };

  if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
    const variants: HlsVariant[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const attrs = attributes(line.slice('#EXT-X-STREAM-INF:'.length));
      const uri = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
      if (!uri) continue;
      const resolved = resolveHttps(uri, baseUrl);
      if (!resolved.ok) return resolved;
      const res = attrs.RESOLUTION?.split('x');
      variants.push({
        url: resolved.url,
        bandwidth: Number(attrs.BANDWIDTH ?? 0),
        resolution: res && res.length === 2 ? { width: Number(res[0]), height: Number(res[1]) } : undefined,
      });
    }
    if (variants.length === 0) return { ok: false, message: HLS_MESSAGES.empty };
    return { ok: true, kind: 'master', variants };
  }

  let pendingDuration: number | null = null;
  const segments: HlsSegment[] = [];
  let ended = false;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY')) {
      const method = attributes(line.slice('#EXT-X-KEY:'.length)).METHOD ?? 'NONE';
      if (method !== 'NONE') return { ok: false, message: HLS_MESSAGES.encrypted };
    } else if (line.startsWith('#EXT-X-MAP')) {
      return { ok: false, message: HLS_MESSAGES.fmp4 };
    } else if (line.startsWith('#EXT-X-BYTERANGE') || line.startsWith('#EXT-X-PART')) {
      return { ok: false, message: HLS_MESSAGES.byteRange };
    } else if (line.startsWith('#EXTINF:')) {
      pendingDuration = Number.parseFloat(line.slice('#EXTINF:'.length));
    } else if (line === '#EXT-X-ENDLIST') {
      ended = true;
    } else if (line && !line.startsWith('#')) {
      if (pendingDuration === null || !Number.isFinite(pendingDuration)) {
        return { ok: false, message: HLS_MESSAGES.notHls };
      }
      const resolved = resolveHttps(line, baseUrl);
      if (!resolved.ok) return resolved;
      segments.push({ url: resolved.url, durationSec: pendingDuration });
      pendingDuration = null;
      if (segments.length > MAX_SEGMENTS) return { ok: false, message: HLS_MESSAGES.tooMany };
    }
  }
  if (!ended) return { ok: false, message: HLS_MESSAGES.live };
  if (segments.length === 0) return { ok: false, message: HLS_MESSAGES.empty };
  const totalSec = segments.reduce((s, x) => s + x.durationSec, 0);
  return { ok: true, kind: 'media', segments, totalSec };
}

/** Distinct hosts a list of URLs would contact, in first-seen order. Shown to the user before any download. */
export function hostsOf(urls: readonly string[]): string[] {
  return [...new Set(urls.map((u) => new URL(u).host))];
}

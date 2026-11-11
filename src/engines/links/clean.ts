// Pure URL cleaning. Never fetches, never renders. Kept parts are copied as raw text,
// so encoded values and parameter order survive byte-for-byte.

export type Segment = { raw: string; key: string; removable: boolean; reason: string };

export type LinkResult =
  | { ok: false; line: number; input: string; message: string }
  | {
      ok: true;
      line: number;
      input: string;
      scheme: string;
      /** http/https only. Other schemes are shown as text and never linked. */
      httpLike: boolean;
      signed: boolean;
      /** Removal candidates, in original order (with their index in `segments`). */
      candidates: { index: number; key: string; raw: string; reason: string }[];
      /** Cleaned URL after applying the restore and clean-anyway choices. */
      cleaned: string;
      /** True when at least one candidate was actually removed in `cleaned`. */
      applied: boolean;
    };

export type CleanOptions = {
  /** Re-add these segment indexes (restore toggles). */
  restored?: ReadonlySet<number>;
  /** Remove tracking params even on signed links. */
  cleanAnyway?: boolean;
};

/** Always-tracking names (matched case-insensitively, decoded keys). */
const TRACKER_NAMES = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'igsh', 'twclid', 'ttclid', 'yclid',
  '_hsenc', '_hsmi', 'hsctatracking', 'mkt_tok', 'oly_enc_id', 'oly_anon_id', 'vero_id', 'vero_conv', 's_cid', 'ref_src', 'ref_url',
  'srsltid', 'spm', 'scm', '_ga', '_gl', 'wt_mc',
]);
/** Prefix families: utm_*, Matomo/Piwik and Adobe campaign names. */
const TRACKER_PREFIXES = ['utm_', 'pk_campaign', 'pk_kwd', 'pk_source', 'pk_medium', 'pk_content', 'at_medium', 'at_campaign'];
/** `si` is a share id on these hosts only. */
const SI_HOSTS = ['youtube.com', 'youtu.be', 'spotify.com'];

/** Query names that mark a signed or authenticated link. Matched case-insensitively. */
const SIGNED_NAMES = new Set([
  'x-amz-signature', 'x-amz-credential', 'signature', 'sig', 'token', 'expires', 'policy', 'key-pair-id',
  'se', 'sp', 'sv', 'sr', 'hmac', 'x-goog-signature',
]);

/** Decodes a query key for comparison only. Malformed escapes compare as-is. */
export function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function onSiHost(host: string): boolean {
  return SI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Reason a parameter is a tracker, or null when it should be kept. */
export function trackerReason(key: string, host: string): string | null {
  if (TRACKER_NAMES.has(key)) return 'Known tracking parameter';
  if (TRACKER_PREFIXES.some((p) => key.startsWith(p))) return 'Campaign tracking parameter';
  if (key === 'si' && onSiHost(host)) return 'Share tracking parameter on this site';
  return null;
}

/** Splits a trimmed raw URL into base, query segments and fragment, without normalising anything. */
function splitRaw(raw: string): { base: string; segments: string[] | null; fragment: string } {
  const hash = raw.indexOf('#');
  const before = hash >= 0 ? raw.slice(0, hash) : raw;
  const fragment = hash >= 0 ? raw.slice(hash) : '';
  const q = before.indexOf('?');
  if (q < 0) return { base: before, segments: null, fragment };
  return { base: before.slice(0, q), segments: before.slice(q + 1).split('&'), fragment };
}

/** Splits a query segment into key and value at the first "=". */
function keyOf(segment: string): string {
  const eq = segment.indexOf('=');
  return decodeKey(eq >= 0 ? segment.slice(0, eq) : segment);
}

export function cleanLine(input: string, line: number, opts: CleanOptions = {}): LinkResult {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, line, input: raw, message: 'Not a valid URL. Check that it starts with https:// or another scheme.' };
  }
  const { base, segments, fragment } = splitRaw(raw);
  const host = url.hostname.toLowerCase();
  const signed = (segments ?? []).some((s) => SIGNED_NAMES.has(keyOf(s)));

  const parsed: Segment[] = (segments ?? []).map((s) => {
    const key = keyOf(s);
    const reason = trackerReason(key, host);
    return { raw: s, key, removable: reason !== null, reason: reason ?? '' };
  });
  const candidates = parsed.flatMap((s, index) => (s.removable ? [{ index, key: s.key, raw: s.raw, reason: s.reason }] : []));

  const removing = !signed || !!opts.cleanAnyway;
  const restored = opts.restored ?? new Set<number>();
  const kept = parsed.flatMap((s, i) => (!removing || !s.removable || restored.has(i) ? [s.raw] : []));
  const applied = removing && candidates.some((c) => !restored.has(c.index));
  // Kept segments keep a bare "?" alive (e.g. "a.com/?"), and drop it only when every segment is removed.
  const cleaned = `${base}${kept.length ? `?${kept.join('&')}` : ''}${fragment}`;

  return {
    ok: true,
    line,
    input: raw,
    scheme: url.protocol.replace(/:$/, '').toLowerCase(),
    httpLike: url.protocol === 'http:' || url.protocol === 'https:',
    signed,
    candidates,
    cleaned,
    applied,
  };
}

/** Parses a multi-line paste. Blank lines are skipped; line numbers are 1-based from the paste. */
export function cleanText(text: string, opts: Record<number, CleanOptions> = {}): LinkResult[] {
  const out: LinkResult[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (l.trim() === '') return;
    out.push(cleanLine(l, i + 1, opts[i + 1]));
  });
  return out;
}

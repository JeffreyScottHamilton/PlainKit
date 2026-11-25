// Classifies decoded QR text so the UI can show it safely. Pure: never fetches, never opens anything.

export type UrlWarning = 'ip-address' | 'punycode' | 'shortener' | 'username';
export type Row = { label: string; value: string };
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass' | 'unknown';

export type Classified =
  | { kind: 'url'; url: string; host: string; warnings: UrlWarning[] }
  | { kind: 'wifi'; ssid: string; password: string; security: WifiSecurity; hidden: boolean }
  | { kind: 'contact'; rows: Row[] }
  | { kind: 'address'; scheme: 'mailto' | 'tel' | 'sms'; rows: Row[] }
  | { kind: 'text'; text: string };

/** Well-known shorteners. The destination is hidden until the link is followed. */
export const SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'lnkd.in', 'v.gd',
]);

/** Splits on separator characters that are not escaped with a backslash. Escapes stay in the pieces. */
export function splitRaw(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length) {
      cur += c + s[++i];
    } else if (c === sep) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Removes one level of backslash escapes. */
export const unescapeValue = (s: string): string => s.replace(/\\([\s\S])/g, '$1');

/** Splits `KEY:value` at the first unescaped colon. The value keeps its escapes. */
function keyValue(field: string): [string, string] | null {
  const parts = splitRaw(field, ':');
  if (parts.length < 2) return null;
  return [parts[0]!.toUpperCase(), parts.slice(1).join(':')];
}

/** Parses WIFI:T:<security>;S:<ssid>;P:<password>;H:<true|false>;; or returns null. */
export function parseWifi(text: string): Extract<Classified, { kind: 'wifi' }> | null {
  if (!/^WIFI:/i.test(text)) return null;
  const map = new Map<string, string>();
  for (const f of splitRaw(text.slice(5), ';')) {
    const kv = f === '' ? null : keyValue(f);
    if (kv) map.set(kv[0], unescapeValue(kv[1]));
  }
  const ssid = map.get('S');
  if (!ssid) return null;
  const t = (map.get('T') ?? '').toUpperCase();
  const security: WifiSecurity = t === 'WPA' || t === 'WEP' ? t : t === 'NOPASS' ? 'nopass' : 'unknown';
  return { kind: 'wifi', ssid, password: map.get('P') ?? '', security, hidden: (map.get('H') ?? '').toLowerCase() === 'true' };
}

/** Unescapes one vCard value (\\n, \\, \\; \\\\). Call on a single component, after splitting on unescaped ';'. */
const unescapeVcard = (s: string): string => s.replace(/\\([nN\\;,])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

/** Unfolds vCard lines. Values stay raw (escaped) so components can still be split. */
function vcardLines(text: string): [string, string][] {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  const out: [string, string][] = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).split(';')[0]!.toUpperCase();
    out.push([key, line.slice(idx + 1)]);
  }
  return out;
}

const CONTACT_LABELS: Record<string, string> = { Name: 'Name', Phone: 'Phone', Email: 'Email', Organization: 'Organization', Website: 'Website' };

/** Parses a vCard (BEGIN:VCARD) or MECARD (MECARD:N:...;) contact. Returns null for anything else. */
export function parseContact(text: string): Extract<Classified, { kind: 'contact' }> | null {
  const t = text.trim();
  if (/^BEGIN:VCARD/i.test(t)) {
    const pairs = vcardLines(t);
    const rows: Row[] = [];
    const add = (label: string, value: string) => value && rows.push({ label: CONTACT_LABELS[label] ?? label, value });
    const fn = pairs.find(([k]) => k === 'FN')?.[1];
    const n = pairs.find(([k]) => k === 'N')?.[1];
    // N is Last;First;...: reverse the components after splitting on unescaped semicolons.
    const nName = n ? splitRaw(n, ';').map(unescapeVcard).filter(Boolean).reverse().join(' ') : '';
    add('Name', fn ? unescapeVcard(fn) : nName);
    for (const [k, raw] of pairs) {
      if (k === 'TEL') add('Phone', unescapeVcard(raw));
      if (k === 'EMAIL') add('Email', unescapeVcard(raw));
      if (k === 'ORG') add('Organization', splitRaw(raw, ';').map(unescapeVcard).filter(Boolean).join(' '));
      if (k === 'URL') add('Website', unescapeVcard(raw));
    }
    return { kind: 'contact', rows };
  }
  if (/^MECARD:/i.test(t)) {
    const rows: Row[] = [];
    for (const f of splitRaw(t.slice(7), ';')) {
      const kv = f === '' ? null : keyValue(f);
      if (!kv) continue;
      const [k, raw] = kv;
      const v = unescapeValue(raw);
      if (k === 'N') {
        // MECARD names are "Last,First".
        const name = splitRaw(raw, ',').map(unescapeValue).reverse().join(' ').trim();
        if (name) rows.push({ label: 'Name', value: name });
      } else if (k === 'TEL' && v) rows.push({ label: 'Phone', value: v });
      else if (k === 'EMAIL' && v) rows.push({ label: 'Email', value: v });
      else if (k === 'ORG' && v) rows.push({ label: 'Organization', value: v });
      else if (k === 'URL' && v) rows.push({ label: 'Website', value: v });
    }
    return { kind: 'contact', rows };
  }
  return null;
}

/** Address-like codes: mailto:, tel:, SMSTO:/sms:. Only shows the fields; nothing is opened. */
export function parseAddress(text: string): Extract<Classified, { kind: 'address' }> | null {
  const t = text.trim();
  const mailto = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(t);
  if (mailto) {
    const rows: Row[] = [{ label: 'Email', value: decodeURIComponent(mailto[1] ?? '') }];
    for (const pair of (mailto[2] ?? '').split('&')) {
      const [k, ...v] = pair.split('=');
      const value = decodeURIComponent(v.join('=').replace(/\+/g, ' '));
      if (k?.toLowerCase() === 'subject' && value) rows.push({ label: 'Subject', value });
      if (k?.toLowerCase() === 'body' && value) rows.push({ label: 'Body', value });
    }
    return { kind: 'address', scheme: 'mailto', rows };
  }
  const tel = /^tel:(.+)$/i.exec(t);
  if (tel) return { kind: 'address', scheme: 'tel', rows: [{ label: 'Phone', value: tel[1]! }] };
  const sms = /^(?:smsto|sms):([^:]*)(?::([\s\S]*))?$/i.exec(t);
  if (sms) {
    const rows: Row[] = [{ label: 'Phone', value: sms[1]! }];
    if (sms[2]) rows.push({ label: 'Message', value: sms[2] });
    return { kind: 'address', scheme: 'sms', rows };
  }
  return null;
}

/** Warnings for a web link. Only the parsed URL is inspected; nothing is requested. */
export function urlWarnings(u: URL): UrlWarning[] {
  const out: UrlWarning[] = [];
  const host = u.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) out.push('ip-address');
  if (host.split('.').some((label) => label.startsWith('xn--'))) out.push('punycode');
  if (SHORTENERS.has(host)) out.push('shortener');
  if (u.username || u.password) out.push('username');
  return out;
}

export function classify(text: string): Classified {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return { kind: 'url', url: t, host: u.hostname, warnings: urlWarnings(u) };
    } catch {
      // Not a parseable URL: fall through to text.
    }
  }
  return parseWifi(t) ?? parseContact(t) ?? parseAddress(t) ?? { kind: 'text', text };
}

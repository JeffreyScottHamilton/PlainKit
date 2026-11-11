import { decodeBase64Utf8 } from './base64';

export type JwtOutcome =
  | {
      ok: true;
      headerText: string;
      payloadText: string;
      signature: string;
      alg: string | null;
      claims: { name: 'exp' | 'iat' | 'nbf'; seconds: number; iso: string }[];
      expired: boolean;
      notYetValid: boolean;
    }
  | { ok: false; message: string };

const PART = /^[A-Za-z0-9_-]*$/;

function jsonObject(part: string, label: string): { ok: true; value: Record<string, unknown>; text: string } | { ok: false; message: string } {
  const dec = decodeBase64Utf8(part);
  if (!dec.ok) return { ok: false, message: `${label} is not valid base64url: ${dec.message}` };
  let value: unknown;
  try {
    value = JSON.parse(dec.text);
  } catch {
    return { ok: false, message: `${label} is not valid JSON.` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: `${label} must be a JSON object.` };
  return { ok: true, value: value as Record<string, unknown>, text: JSON.stringify(value, null, 2) };
}

/** Decodes only. Never verifies the signature. */
export function decodeJwt(raw: string, nowMs: number): JwtOutcome {
  const token = raw.trim().replace(/^Bearer\s+/i, '');
  if (token === '') return { ok: false, message: 'Paste a JWT first.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, message: `A JWT has 3 dot-separated parts (header.payload.signature). Found ${parts.length}.` };
  const [h, p, s] = parts as [string, string, string];
  if (!PART.test(h) || !PART.test(p) || !PART.test(s)) return { ok: false, message: 'JWT parts may only contain base64url characters (A-Z, a-z, 0-9, - and _).' };
  const header = jsonObject(h, 'Header');
  if (!header.ok) return header;
  const payload = jsonObject(p, 'Payload');
  if (!payload.ok) return payload;

  const claims: { name: 'exp' | 'iat' | 'nbf'; seconds: number; iso: string }[] = [];
  for (const name of ['exp', 'iat', 'nbf'] as const) {
    const v = payload.value[name];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, message: `Claim "${name}" must be a number of seconds since 1970.` };
    const d = new Date(v * 1000);
    if (Number.isNaN(d.getTime())) return { ok: false, message: `Claim "${name}" is out of the date range.` };
    claims.push({ name, seconds: v, iso: d.toISOString() });
  }
  const exp = claims.find((c) => c.name === 'exp');
  const nbf = claims.find((c) => c.name === 'nbf');
  const alg = typeof header.value.alg === 'string' ? header.value.alg : null;
  return {
    ok: true,
    headerText: header.text,
    payloadText: payload.text,
    signature: s,
    alg,
    claims,
    expired: exp !== undefined && exp.seconds * 1000 <= nowMs,
    notYetValid: nbf !== undefined && nbf.seconds * 1000 > nowMs,
  };
}

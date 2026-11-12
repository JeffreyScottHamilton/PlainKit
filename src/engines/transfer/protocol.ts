import { ToolError } from '@/lib/errors';
import { outputName } from '@/lib/format';

export const CHUNK_BYTES = 64 * 1024;
// Files up to this size get SHA-256 (the sender hashes the whole file first). Larger files get Adler-32.
export const SHA_LIMIT_BYTES = 256 * 1024 * 1024;
export const MAX_FILES = 500;

export type FileMeta = { name: string; size: number; mime: string };
export type CheckAlg = 'sha-256' | 'adler32';
export type Check = { alg: CheckAlg; hex: string };

export type Msg =
  | { type: 'offer'; files: FileMeta[] }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'file-start'; index: number }
  | { type: 'file-end'; index: number; bytes: number; check: Check }
  | { type: 'done' }
  | { type: 'verified' }
  | { type: 'cancel'; reason: 'user' | 'integrity' };

export function checkAlgFor(size: number): CheckAlg {
  return size <= SHA_LIMIT_BYTES ? 'sha-256' : 'adler32';
}

export function planChunks(size: number, chunk = CHUNK_BYTES): { offset: number; length: number }[] {
  const out: { offset: number; length: number }[] = [];
  for (let offset = 0; offset < size; offset += chunk) out.push({ offset, length: Math.min(chunk, size - offset) });
  return out;
}

/** Running Adler-32 (RFC 1950). Catches accidental corruption only. It is not a security check. */
export class Adler32 {
  private a = 1;
  private b = 0;
  update(bytes: Uint8Array): this {
    for (const x of bytes) {
      this.a = (this.a + x) % 65521;
      this.b = (this.b + this.a) % 65521;
    }
    return this;
  }
  get value(): number {
    return this.b * 65536 + this.a;
  }
  hex(): string {
    return this.value.toString(16).padStart(8, '0');
  }
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps only the last path part, replaces control characters, never returns an empty or dot-only name. */
export function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '_');
  const name = outputName(base, '').slice(0, 200);
  return name.trim() === '' || /^\.+$/.test(name) ? 'file' : name;
}

/** Each a=fingerprint value in an SDP, upper-cased, e.g. "AB:CD:...". */
export function fingerprintsOf(sdp: string): string[] {
  return [...sdp.matchAll(/^a=fingerprint:\S+ ((?:[0-9A-Fa-f]{2}:)*[0-9A-Fa-f]{2})\s*$/gm)].map((m) => (m[1] ?? '').toUpperCase());
}

/**
 * Six-digit number from SHA-256 over the sorted, de-duplicated fingerprints of both SDPs.
 * Both sides compute the same value. It helps detect a swapped code; it is not strong authentication.
 */
export async function comparisonNumber(localSdp: string, remoteSdp: string): Promise<string | null> {
  const fps = [...new Set([...fingerprintsOf(localSdp), ...fingerprintsOf(remoteSdp)])].sort();
  if (fps.length === 0) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fps.join('\n')));
  return String(new DataView(digest).getUint32(0) % 1_000_000).padStart(6, '0');
}

const bad = () => new ToolError('protocol', 'The other device sent a message this app does not understand.', 'Create a new invite and send again.');
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIdx = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const MIME_RE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

function metaOf(v: unknown): FileMeta {
  if (!isRec(v) || typeof v.name !== 'string' || v.name.length > 1024 || !isIdx(v.size) || typeof v.mime !== 'string') throw bad();
  return { name: v.name, size: v.size, mime: MIME_RE.test(v.mime) && v.mime.length <= 255 ? v.mime : 'application/octet-stream' };
}

function checkOf(v: unknown): Check {
  if (!isRec(v) || typeof v.hex !== 'string') throw bad();
  if (v.alg === 'sha-256' && /^[0-9a-f]{64}$/.test(v.hex)) return { alg: 'sha-256', hex: v.hex };
  if (v.alg === 'adler32' && /^[0-9a-f]{8}$/.test(v.hex)) return { alg: 'adler32', hex: v.hex };
  throw bad();
}

/** Strict parse of one control message from the peer. Anything unexpected throws a protocol ToolError. */
export function parseMsg(text: string): Msg {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw bad();
  }
  if (!isRec(v)) throw bad();
  switch (v.type) {
    case 'offer':
      if (!Array.isArray(v.files) || v.files.length === 0 || v.files.length > MAX_FILES) throw bad();
      return { type: 'offer', files: v.files.map(metaOf) };
    case 'accept':
      return { type: 'accept' };
    case 'decline':
      return { type: 'decline' };
    case 'done':
      return { type: 'done' };
    case 'verified':
      return { type: 'verified' };
    case 'cancel':
      if (v.reason === 'user') return { type: 'cancel', reason: 'user' };
      if (v.reason === 'integrity') return { type: 'cancel', reason: 'integrity' };
      throw bad();
    case 'file-start':
      if (!isIdx(v.index)) throw bad();
      return { type: 'file-start', index: v.index };
    case 'file-end':
      if (!isIdx(v.index) || !isIdx(v.bytes)) throw bad();
      return { type: 'file-end', index: v.index, bytes: v.bytes, check: checkOf(v.check) };
    default:
      throw bad();
  }
}

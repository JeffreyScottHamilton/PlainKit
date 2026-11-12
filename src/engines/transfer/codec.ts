import { ToolError } from '@/lib/errors';
import { Adler32 } from './protocol';

// Invite and reply codes: "pk1." + base64url(deflate-raw(JSON) + 4-byte Adler-32 of the deflated bytes).
// The checksum catches copy errors only. Authentication is the comparison number, not the code.
export type CodeType = 'offer' | 'answer';
export type CodePayload = { v: 1; type: CodeType; sdp: string };

export const CODE_PREFIX = 'pk1.';
const MAX_SDP = 32 * 1024;
const MAX_INFLATED = 64 * 1024;
const CORRUPT_NEXT = 'Copy the whole code again, without editing it.';

const corrupt = () => new ToolError('code-corrupt', 'This code is damaged or incomplete.', CORRUPT_NEXT);

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Pipes bytes through a stream transform. Rejects when the output exceeds max (guards against inflate bombs). */
async function run(input: BufferSource, ts: TransformStream<BufferSource, Uint8Array>, max: number): Promise<Uint8Array> {
  const src = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(input);
      c.close();
    },
  });
  const reader = src.pipeThrough(ts).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    total += r.value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new RangeError('output too large');
    }
    parts.push(r.value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export async function encodeCode(p: CodePayload): Promise<string> {
  if (typeof CompressionStream === 'undefined')
    throw new ToolError('unsupported', 'This browser cannot build pairing codes.', 'Use a current version of Chrome, Edge, Firefox or Safari.', false);
  const z = await run(new TextEncoder().encode(JSON.stringify(p)), new CompressionStream('deflate-raw'), Infinity);
  const out = new Uint8Array(z.length + 4);
  out.set(z);
  new DataView(out.buffer).setUint32(z.length, new Adler32().update(z).value);
  return CODE_PREFIX + toB64Url(out);
}

function isPayload(v: unknown): v is CodePayload {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && (o.type === 'offer' || o.type === 'answer') && typeof o.sdp === 'string' && o.sdp.startsWith('v=0') && o.sdp.length <= MAX_SDP;
}

/** Strict decode of a pasted code. Whitespace is ignored. expect is the type the paste box needs. */
export async function decodeCode(text: string, expect: CodeType): Promise<CodePayload> {
  const t = text.replace(/\s+/g, '');
  if (t === '') throw new ToolError('code-empty', 'The code box is empty.', 'Paste the code from the other device.');
  if (!t.startsWith(CODE_PREFIX))
    throw new ToolError('code-prefix', 'This is not a Plainkit code. Codes start with "pk1.".', 'Copy the whole code from the other device.');
  const body = t.slice(CODE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw corrupt();
  let bytes: Uint8Array;
  try {
    bytes = fromB64Url(body);
  } catch {
    throw corrupt();
  }
  if (bytes.length <= 4) throw corrupt();
  const z = bytes.slice(0, bytes.length - 4);
  const sum = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4);
  if (new Adler32().update(z).value !== sum) throw corrupt();
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(await run(z, new DecompressionStream('deflate-raw'), MAX_INFLATED)));
  } catch {
    throw corrupt();
  }
  if (!isPayload(payload)) throw new ToolError('code-shape', 'This code does not contain a valid pairing offer or reply.', CORRUPT_NEXT);
  if (payload.type !== expect)
    throw expect === 'offer'
      ? new ToolError('code-type', 'This is a reply code, not an invite code.', 'Paste the invite code from the sending device.')
      : new ToolError('code-type', 'This is an invite code, not a reply code.', 'Paste the reply code from the receiving device.');
  return payload;
}

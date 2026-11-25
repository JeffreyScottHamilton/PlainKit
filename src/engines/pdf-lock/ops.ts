// Engine operations: inspect, unlock, lock. Pure functions over bytes; the worker wraps them.

import { ToolError } from '@/lib/errors';
import { expandObjectStreams, PdfSyntaxError, scanPdf, type RawObject, type RawPdf } from './scan';
import { authenticate, createSecurity, decryptObject, encryptObject, parseSecurity, permissionValue, type SecurityInfo } from './security';
import { writePdf } from './write';
import { dict, isDict, isName, isRef, isString, isStream, type PdfDict, type PdfValue } from './types';
import { randomBytes } from './webcrypto';

export type Inspection = { readonly encrypted: boolean; readonly opensWithoutPassword: boolean };
export type UnlockResult = { readonly bytes: Uint8Array; readonly opensWithoutPassword: boolean };
export type LockOptions = {
  readonly userPassword: string;
  readonly ownerPassword?: string;
  readonly print?: boolean;
  readonly copy?: boolean;
  readonly edit?: boolean;
};

const notPdf = () => new ToolError('not-pdf', 'This file is not a PDF.', 'Choose a PDF file.', false);
const corrupt = (detail: string) =>
  new ToolError('corrupt-pdf', `This PDF could not be read (${detail}).`, 'Try a different copy of the file.', false);

const HEADER = new TextEncoder().encode('%PDF-');

function startsWithHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024) - HEADER.length;
  for (let i = 0; i <= limit; i++) {
    let ok = true;
    for (let k = 0; k < HEADER.length; k++) {
      if (bytes[i + k] !== HEADER[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function parseInput(bytes: Uint8Array): RawPdf {
  if (!startsWithHeader(bytes)) throw notPdf();
  try {
    return scanPdf(bytes);
  } catch (e) {
    if (e instanceof PdfSyntaxError) throw corrupt(e.message);
    throw e;
  }
}

type EncryptRef = { readonly num: number; readonly dict: PdfDict };

function findEncrypt(raw: RawPdf): EncryptRef | null {
  const e = raw.trailer.map.get('Encrypt');
  if (e === undefined) return null;
  if (isRef(e)) {
    const o = raw.objects.get(e.num);
    if (!o || !isDict(o.value)) throw corrupt('encryption dictionary is missing');
    return { num: e.num, dict: o.value };
  }
  if (isDict(e)) return { num: -1, dict: e };
  throw corrupt('encryption entry is not valid');
}

function idOf(raw: RawPdf): Uint8Array {
  const id = raw.trailer.map.get('ID');
  if (Array.isArray(id) && isString(id[0])) return id[0].bytes;
  return new Uint8Array(0);
}

function securityOf(enc: EncryptRef, raw: RawPdf): SecurityInfo {
  try {
    return parseSecurity(enc.dict, idOf(raw));
  } catch (e) {
    if (e instanceof PdfSyntaxError) throw corrupt(e.message);
    throw e;
  }
}

/** Keeps the trailer entries a plain file needs. Encrypt, XRefStm and Prev are dropped. */
function outputTrailer(raw: RawPdf, id: Uint8Array | null): PdfDict {
  const entries: [string, PdfValue][] = [];
  const root = raw.trailer.map.get('Root');
  if (root === undefined) throw corrupt('no document catalog');
  entries.push(['Root', root]);
  const info = raw.trailer.map.get('Info');
  if (info !== undefined) entries.push(['Info', info]);
  if (id) entries.push(['ID', [{ kind: 'string', bytes: id }, { kind: 'string', bytes: id }]]);
  else {
    const existing = raw.trailer.map.get('ID');
    if (existing !== undefined) entries.push(['ID', existing]);
  }
  return dict(entries);
}

/** Removes a Crypt filter. Its identity meaning is "no encryption", and some readers reject it. */
function stripCrypt(d: PdfDict): PdfDict {
  const f = d.map.get('Filter');
  if (isName(f, 'Crypt')) {
    const entries = [...d.map].filter(([k]) => k !== 'Filter' && k !== 'DecodeParms');
    return dict(entries);
  }
  if (Array.isArray(f) && f.some((x) => isName(x, 'Crypt'))) {
    const parms = d.map.get('DecodeParms');
    const keep: PdfValue[] = [];
    const keepParms: PdfValue[] = [];
    f.forEach((x, i) => {
      if (isName(x, 'Crypt')) return;
      keep.push(x);
      if (Array.isArray(parms)) keepParms.push(parms[i] ?? null);
    });
    const entries = [...d.map].filter(([k]) => k !== 'Filter' && k !== 'DecodeParms');
    if (keep.length) entries.push(['Filter', keep]);
    if (keep.length && Array.isArray(parms)) entries.push(['DecodeParms', keepParms]);
    return dict(entries);
  }
  return d;
}

function cleanValue(v: PdfValue): PdfValue {
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'stream') {
    return { kind: 'stream', dict: stripCrypt(v.dict), data: v.data };
  }
  return v;
}

function isXRefStream(v: PdfValue): boolean {
  return isStream(v) && isName(v.dict.map.get('Type'), 'XRef');
}

/** Maps low-level failures to a ToolError so the UI gets a message and next step. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof PdfSyntaxError) throw corrupt(e.message);
    throw corrupt('the data could not be decrypted');
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<Inspection> {
  const raw = parseInput(bytes);
  const enc = findEncrypt(raw);
  if (!enc) return { encrypted: false, opensWithoutPassword: false };
  const info = securityOf(enc, raw);
  const open = await guard(() => authenticate(info, '', false));
  return { encrypted: true, opensWithoutPassword: open !== null };
}

export async function unlockPdf(bytes: Uint8Array, password: string, signal?: AbortSignal): Promise<UnlockResult> {
  const raw = parseInput(bytes);
  const enc = findEncrypt(raw);
  if (!enc) throw new ToolError('not-encrypted', 'This PDF has no password.', 'Choose an encrypted PDF, or use Lock to add a password.', false);
  const info = securityOf(enc, raw);
  const openWithout = await guard(() => authenticate(info, '', false));
  const auth = openWithout ?? (await guard(() => authenticate(info, password, true)));
  if (!auth) {
    throw new ToolError('wrong-password', 'That password did not open this PDF.', 'Check the password. Passwords are case-sensitive. Try again.', true);
  }
  const decrypted = await guard(async () => {
    const map = new Map<number, RawObject>();
    for (const o of raw.objects.values()) {
      if (o.num === enc.num) continue;
      signal?.throwIfAborted();
      map.set(o.num, await decryptObject(info, auth.fileKey, o));
    }
    return map;
  });
  const objects = await guard(async () => expandObjectStreams(decrypted, (o) => o));
  const out = new Map<number, PdfValue>();
  for (const o of objects.values()) {
    if (isXRefStream(o.value)) continue;
    out.set(o.num, cleanValue(o.value));
  }
  return { bytes: writePdf(out, outputTrailer(raw, null)), opensWithoutPassword: openWithout !== null };
}

const randomPassword = () => Array.from(randomBytes(24), (b) => b.toString(16).padStart(2, '0')).join('');

export async function lockPdf(bytes: Uint8Array, options: LockOptions, signal?: AbortSignal): Promise<Uint8Array> {
  if (options.userPassword.length === 0) {
    throw new ToolError('password-required', 'Enter a password to lock this PDF.', 'Type a password, then try again.', true);
  }
  const raw = parseInput(bytes);
  if (findEncrypt(raw)) {
    throw new ToolError('already-encrypted', 'This PDF already has a password.', 'Use Unlock to remove the password first, then lock it again.', false);
  }
  const objects = await guard(async () => expandObjectStreams(raw.objects, (o) => o));
  const existingId = idOf(raw);
  const id = existingId.length === 16 ? existingId : randomBytes(16);
  const P = permissionValue({
    print: options.print !== false,
    printHigh: options.print !== false,
    copy: options.copy !== false,
    accessibility: options.copy !== false,
    modify: options.edit !== false,
    assemble: options.edit !== false,
    annotate: options.edit !== false,
    fillForms: options.edit !== false,
  });
  const ownerPassword = options.ownerPassword && options.ownerPassword.length > 0 ? options.ownerPassword : randomPassword();
  const sec = await guard(() => createSecurity(options.userPassword, ownerPassword, P, true, id));

  let encryptNum = 0;
  for (const n of objects.keys()) encryptNum = Math.max(encryptNum, n);
  encryptNum += 1;

  const out = new Map<number, PdfValue>();
  for (const o of objects.values()) {
    if (isXRefStream(o.value)) continue;
    signal?.throwIfAborted();
    const e = await guard(() => encryptObject(sec.info, sec.fileKey, o));
    out.set(o.num, cleanValue(e.value));
  }
  out.set(encryptNum, sec.encryptDict);

  const trailer = outputTrailer(raw, id);
  const entries: [string, PdfValue][] = [...trailer.map, ['Encrypt', { kind: 'ref', num: encryptNum }]];
  return writePdf(out, dict(entries));
}

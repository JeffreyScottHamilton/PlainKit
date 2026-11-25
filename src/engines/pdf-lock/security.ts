// PDF standard security handler: reads Encrypt dictionaries (RC4 and AES, R2 to R6), authenticates
// passwords, and encrypts or decrypts strings and stream data. Writing is AES-256 (R6) only.

import { ToolError } from '@/lib/errors';
import { md5 } from './md5';
import { rc4 } from './rc4';
import { PdfSyntaxError, type RawObject } from './scan';
import { aesCbcDecrypt, aesCbcDecryptNoPad, aesCbcEncrypt, aesCbcEncryptNoPad, concat, randomBytes, sha } from './webcrypto';
import { dict, isDict, isName, isString, str, type PdfDict, type PdfValue } from './types';

export type Method = 'none' | 'rc4' | 'aesv2' | 'aesv3';

export type SecurityInfo = {
  readonly V: number;
  readonly R: number;
  readonly P: number;
  readonly O: Uint8Array;
  readonly U: Uint8Array;
  readonly OE: Uint8Array;
  readonly UE: Uint8Array;
  readonly id0: Uint8Array;
  readonly encryptMetadata: boolean;
  readonly strMethod: Method;
  readonly stmMethod: Method;
  /** Key length in bytes for legacy (R2 to R4) handlers. */
  readonly keyBytes: number;
};

export type Authenticated = { readonly fileKey: Uint8Array; readonly role: 'user' | 'owner' };

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e,
  0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);
const ZERO16 = new Uint8Array(16);
const encoder = new TextEncoder();

const unsupported = (what: string) =>
  new ToolError('unsupported-encryption', `This PDF uses ${what}, which this tool cannot open.`, 'Use a PDF that uses RC4 or AES encryption, or remove the protection in the app that made it.', false);

const corrupt = (detail: string) => new ToolError('corrupt-pdf', `The PDF is damaged or unreadable (${detail}).`, 'Try a different copy of the file.', false);

const le4 = (n: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, true);
  return out;
};

/** Password bytes. R5 and R6 use UTF-8 truncated to 127 bytes. R2 to R4 use UTF-8 as well (matches ASCII). No SASLprep. */
export function passwordBytes(pw: string, revision: number): Uint8Array {
  const b = encoder.encode(pw);
  return revision >= 5 ? b.subarray(0, 127) : b;
}

const padPassword = (pw: Uint8Array) => concat(pw.subarray(0, 32), PAD).subarray(0, 32);

const bytesOf = (v: PdfValue | undefined): Uint8Array | null => (isString(v) ? v.bytes : null);

const numberOr = (v: PdfValue | undefined, fallback: number): number => (typeof v === 'number' ? v : fallback);

function methodOf(cf: PdfDict | undefined, filterName: string): Method {
  if (filterName === 'Identity') return 'none';
  const entry = cf?.map.get(filterName);
  if (!isDict(entry)) throw unsupported(`an unknown crypt filter (${filterName})`);
  const cfm = entry.map.get('CFM');
  if (!isName(cfm)) return 'none';
  if (cfm.name === 'None') return 'none';
  if (cfm.name === 'V2') return 'rc4';
  if (cfm.name === 'AESV2') return 'aesv2';
  if (cfm.name === 'AESV3') return 'aesv3';
  throw unsupported(`an unknown encryption method (${cfm.name})`);
}

/** Reads the Encrypt dictionary. Throws ToolError for unsupported handlers and PdfSyntaxError for damage. */
export function parseSecurity(enc: PdfDict, id0: Uint8Array): SecurityInfo {
  const filter = enc.map.get('Filter');
  if (!isName(filter, 'Standard')) throw unsupported('a non-standard security handler');
  const V = numberOr(enc.map.get('V'), 0);
  const R = numberOr(enc.map.get('R'), 0);
  const O = bytesOf(enc.map.get('O'));
  const U = bytesOf(enc.map.get('U'));
  if (!O || !U) throw corrupt('missing owner or user password entry');
  const OE = bytesOf(enc.map.get('OE')) ?? new Uint8Array(0);
  const UE = bytesOf(enc.map.get('UE')) ?? new Uint8Array(0);
  const P = numberOr(enc.map.get('P'), 0);
  const encryptMetadata = enc.map.get('EncryptMetadata') !== false;

  if (V === 5) {
    if (R !== 5 && R !== 6) throw unsupported(`revision ${R} of AES-256`);
    if (OE.length !== 32 || UE.length !== 32 || O.length < 48 || U.length < 48) throw corrupt('bad AES-256 key entries');
    return { V, R, P, O, U, OE, UE, id0, encryptMetadata, strMethod: 'aesv3', stmMethod: 'aesv3', keyBytes: 32 };
  }
  if (V !== 1 && V !== 2 && V !== 4) throw unsupported(`security version ${V}`);
  if (R < 2 || R > 4) throw unsupported(`revision ${R}`);
  if (O.length < 32 || U.length < 32) throw corrupt('short owner or user entry');

  let strMethod: Method = 'rc4';
  let stmMethod: Method = 'rc4';
  let keyBytes = 5;
  if (V === 4) {
    const cf = enc.map.get('CF');
    const cfDict = isDict(cf) ? cf : undefined;
    const sf = enc.map.get('StmF');
    const tf = enc.map.get('StrF');
    const stmF = isName(sf) ? sf.name : 'Identity';
    const strF = isName(tf) ? tf.name : 'Identity';
    stmMethod = methodOf(cfDict, stmF);
    strMethod = methodOf(cfDict, strF);
    const named = stmF !== 'Identity' ? cfDict?.map.get(stmF) : strF !== 'Identity' ? cfDict?.map.get(strF) : undefined;
    const cfLen = isDict(named) ? numberOr(named.map.get('Length'), 16) : 16;
    keyBytes = cfLen < 40 ? cfLen : cfLen / 8;
  } else {
    const bits = numberOr(enc.map.get('Length'), 40);
    keyBytes = V === 1 ? 5 : Math.floor(bits / 8);
  }
  if (keyBytes < 5 || keyBytes > 16) throw corrupt('key length out of range');
  return { V, R, P, O, U, OE, UE, id0, encryptMetadata, strMethod, stmMethod, keyBytes };
}

// ---- Legacy handlers (R2 to R4), spec Algorithms 2, 3, 4, 5, 6, 7 ----

function legacyKey(info: SecurityInfo, userPad: Uint8Array): Uint8Array {
  const extra = info.R >= 4 && !info.encryptMetadata ? new Uint8Array([0xff, 0xff, 0xff, 0xff]) : new Uint8Array(0);
  let h = md5(concat(userPad, info.O.subarray(0, 32), le4(info.P), info.id0, extra));
  if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, info.keyBytes));
  return h.subarray(0, info.keyBytes);
}

function xorKey(key: Uint8Array, i: number): Uint8Array {
  return key.map((b) => b ^ i);
}

function legacyUserCheck(info: SecurityInfo, key: Uint8Array): boolean {
  if (info.R === 2) return bytesEqual(rc4(key, PAD), info.U.subarray(0, 32));
  let x = rc4(key, md5(concat(PAD, info.id0)));
  for (let i = 1; i <= 19; i++) x = rc4(xorKey(key, i), x);
  return bytesEqual(x.subarray(0, 16), info.U.subarray(0, 16));
}

/** Recovers the user password from the owner entry (Algorithm 7, reversed). */
function userPadFromOwner(info: SecurityInfo, ownerPad: Uint8Array): Uint8Array {
  let h = md5(ownerPad);
  if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const key = h.subarray(0, info.keyBytes);
  let x: Uint8Array = new Uint8Array(info.O.subarray(0, 32));
  if (info.R === 2) x = rc4(key, x);
  else for (let i = 19; i >= 0; i--) x = rc4(xorKey(key, i), x);
  return x;
}

function authLegacy(info: SecurityInfo, pw: Uint8Array, ownerOk: boolean): Authenticated | null {
  const userPad = padPassword(pw);
  const key = legacyKey(info, userPad);
  if (legacyUserCheck(info, key)) return { fileKey: key, role: 'user' };
  if (!ownerOk) return null;
  const fromOwner = userPadFromOwner(info, userPad);
  const ownerKey = legacyKey(info, fromOwner);
  if (legacyUserCheck(info, ownerKey)) return { fileKey: ownerKey, role: 'owner' };
  return null;
}

// ---- AES-256 handlers (R5 and R6), spec 7.6.4.3 and ISO 32000-2 Algorithm 2.B ----

/** Algorithm 2.B (R6). Returns 32 bytes. R5 is a single SHA-256. */
export async function hashR6(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  let k = await sha(256, concat(pw, salt, udata));
  let lastE = 0;
  for (let i = 0; i < 64 || lastE > i - 32; i++) {
    const unit = concat(pw, k, udata);
    const k1 = new Uint8Array(unit.length * 64);
    for (let r = 0; r < 64; r++) k1.set(unit, r * unit.length);
    const e = await aesCbcEncryptNoPad(k.subarray(0, 16), k.subarray(16, 32), k1);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j]!;
    const mod = sum % 3;
    k = await sha(mod === 0 ? 256 : mod === 1 ? 384 : 512, e);
    lastE = e[e.length - 1]!;
  }
  return k.subarray(0, 32);
}

async function hashFor(R: number, pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  return R === 6 ? hashR6(pw, salt, udata) : sha(256, concat(pw, salt, udata));
}

async function authV5(info: SecurityInfo, pw: Uint8Array, ownerOk: boolean): Promise<Authenticated | null> {
  const empty = new Uint8Array(0);
  const uVal = info.U.subarray(32, 40);
  const uKeySalt = info.U.subarray(40, 48);
  if (bytesEqual(await hashFor(info.R, pw, uVal, empty), info.U.subarray(0, 32))) {
    const ik = await hashFor(info.R, pw, uKeySalt, empty);
    return { fileKey: await aesCbcDecryptNoPad(ik, ZERO16, info.UE), role: 'user' };
  }
  if (!ownerOk) return null;
  const udata = info.U.subarray(0, 48);
  const oVal = info.O.subarray(32, 40);
  const oKeySalt = info.O.subarray(40, 48);
  if (bytesEqual(await hashFor(info.R, pw, oVal, udata), info.O.subarray(0, 32))) {
    const ik = await hashFor(info.R, pw, oKeySalt, udata);
    return { fileKey: await aesCbcDecryptNoPad(ik, ZERO16, info.OE), role: 'owner' };
  }
  return null;
}

/** Tries the password as user password, then (when ownerOk) as owner password. Null when neither matches. */
export async function authenticate(info: SecurityInfo, pw: string, ownerOk = true): Promise<Authenticated | null> {
  const bytes = passwordBytes(pw, info.R);
  if (info.V === 5) return authV5(info, bytes, ownerOk);
  return authLegacy(info, bytes, ownerOk);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

// ---- Per-object crypto ----

function objectKey(fileKey: Uint8Array, num: number, gen: number, m: Method): Uint8Array {
  if (m === 'aesv3') return fileKey;
  const idx = new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
  const salt = m === 'aesv2' ? new Uint8Array([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array(0);
  return md5(concat(fileKey, idx, salt)).subarray(0, Math.min(fileKey.length + 5, 16));
}

export async function decryptBytes(m: Method, fileKey: Uint8Array, num: number, gen: number, data: Uint8Array): Promise<Uint8Array> {
  if (m === 'none') return data;
  const key = objectKey(fileKey, num, gen, m);
  if (m === 'rc4') return rc4(key, data);
  if (data.length === 0) return data;
  if (data.length < 32 || data.length % 16 !== 0) throw new PdfSyntaxError('encrypted data has a bad length');
  return aesCbcDecrypt(key, data.subarray(0, 16), data.subarray(16));
}

export async function encryptBytes(m: Method, fileKey: Uint8Array, num: number, gen: number, data: Uint8Array): Promise<Uint8Array> {
  if (m === 'none') return data;
  const key = objectKey(fileKey, num, gen, m);
  if (m === 'rc4') return rc4(key, data);
  const iv = randomBytes(16);
  return concat(iv, await aesCbcEncrypt(key, iv, data));
}

type ByteFn = (data: Uint8Array) => Promise<Uint8Array>;

/** Applies fn to every string in a value. Signature Contents strings are never encrypted (spec 7.6.1). */
async function mapStrings(v: PdfValue, fn: ByteFn): Promise<PdfValue> {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out: PdfValue[] = [];
    for (const x of v) out.push(await mapStrings(x, fn));
    return out;
  }
  if (v.kind === 'string') return str(await fn(v.bytes));
  if (v.kind === 'dict') return mapDict(v, fn);
  if (v.kind === 'stream') return { kind: 'stream', dict: await mapDict(v.dict, fn), data: v.data };
  return v;
}

async function mapDict(d: PdfDict, fn: ByteFn): Promise<PdfDict> {
  const isSig = isName(d.map.get('Type'), 'Sig') || isName(d.map.get('Type'), 'DocTimeStamp');
  const entries: [string, PdfValue][] = [];
  for (const [k, v] of d.map) {
    if (isSig && k === 'Contents') entries.push([k, v]);
    else entries.push([k, await mapStrings(v, fn)]);
  }
  return dict(entries);
}

/** Stream data that is never encrypted: XRef streams, identity crypt filters, and metadata when EncryptMetadata is false. */
function streamMethod(d: PdfDict, info: SecurityInfo, fallback: Method): Method {
  if (isName(d.map.get('Type'), 'XRef')) return 'none';
  if (isName(d.map.get('Type'), 'Metadata') && !info.encryptMetadata) return 'none';
  const filter = d.map.get('Filter');
  if (isName(filter, 'Crypt')) {
    const parms = d.map.get('DecodeParms');
    const n = isDict(parms) ? parms.map.get('Name') : undefined;
    if (!isName(n) || n.name === 'Identity') return 'none';
  }
  return fallback;
}

/** Decrypts one object read from the file. Object streams must already be expanded by the caller. */
export async function decryptObject(info: SecurityInfo, fileKey: Uint8Array, o: RawObject): Promise<RawObject> {
  const { num, gen } = o;
  const strFn: ByteFn = (d) => decryptBytes(info.strMethod, fileKey, num, gen, d);
  const v = o.value;
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'stream') {
    const sm = streamMethod(v.dict, info, info.stmMethod);
    const dictOut = await mapDict(v.dict, strFn);
    const data = await decryptBytes(sm, fileKey, num, gen, v.data);
    return { ...o, value: { kind: 'stream', dict: dictOut, data } };
  }
  return { ...o, value: await mapStrings(v, strFn) };
}

/** Encrypts one object for writing. Same skip rules as decryptObject. */
export async function encryptObject(info: SecurityInfo, fileKey: Uint8Array, o: RawObject): Promise<RawObject> {
  const { num, gen } = o;
  const strFn: ByteFn = (d) => encryptBytes(info.strMethod, fileKey, num, gen, d);
  const v = o.value;
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'stream') {
    const sm = streamMethod(v.dict, info, info.stmMethod);
    const dictOut = await mapDict(v.dict, strFn);
    const data = await encryptBytes(sm, fileKey, num, gen, v.data);
    return { ...o, value: { kind: 'stream', dict: dictOut, data } };
  }
  return { ...o, value: await mapStrings(v, strFn) };
}

// ---- Writing: AES-256 (R6) only ----

export type NewSecurity = {
  readonly fileKey: Uint8Array;
  readonly encryptDict: PdfDict;
  readonly id0: Uint8Array;
  readonly info: SecurityInfo;
};

/**
 * Builds a new AES-256 (R6) Encrypt dictionary. Passwords: user opens the file, owner changes
 * permissions. Both are required by the spec, so the caller passes the owner password (or a random one).
 */
export async function createSecurity(userPw: string, ownerPw: string, P: number, encryptMetadata: boolean, id0: Uint8Array): Promise<NewSecurity> {
  const userBytes = passwordBytes(userPw, 6);
  const ownerBytes = passwordBytes(ownerPw, 6);
  const fileKey = randomBytes(32);
  const uVal = randomBytes(8);
  const uKey = randomBytes(8);
  const U = concat(await hashR6(userBytes, uVal, new Uint8Array(0)), uVal, uKey);
  const UE = await aesCbcEncryptNoPad(await hashR6(userBytes, uKey, new Uint8Array(0)), ZERO16, fileKey);
  const oVal = randomBytes(8);
  const oKey = randomBytes(8);
  const O = concat(await hashR6(ownerBytes, oVal, U), oVal, oKey);
  const OE = await aesCbcEncryptNoPad(await hashR6(ownerBytes, oKey, U), ZERO16, fileKey);
  const permsPlain = concat(le4(P), new Uint8Array([0xff, 0xff, 0xff, 0xff]), new Uint8Array([encryptMetadata ? 0x54 : 0x46]), encoder.encode('adb'), randomBytes(4));
  const Perms = await aesCbcEncryptNoPad(fileKey, ZERO16, permsPlain);

  const stdCF = dict([
    ['CFM', { kind: 'name', name: 'AESV3' }],
    ['AuthEvent', { kind: 'name', name: 'DocOpen' }],
    ['Length', 32],
  ]);
  const encryptDict = dict([
    ['Filter', { kind: 'name', name: 'Standard' }],
    ['V', 5],
    ['R', 6],
    ['Length', 256],
    ['P', P | 0],
    ['O', str(O)],
    ['U', str(U)],
    ['OE', str(OE)],
    ['UE', str(UE)],
    ['Perms', str(Perms)],
    ['EncryptMetadata', encryptMetadata],
    ['CF', dict([['StdCF', stdCF]])],
    ['StmF', { kind: 'name', name: 'StdCF' }],
    ['StrF', { kind: 'name', name: 'StdCF' }],
  ]);
  const info: SecurityInfo = {
    V: 5,
    R: 6,
    P: P | 0,
    O,
    U,
    OE,
    UE,
    id0,
    encryptMetadata,
    strMethod: 'aesv3',
    stmMethod: 'aesv3',
    keyBytes: 32,
  };
  return { fileKey, encryptDict, id0, info };
}

/** Permission bits (PDF table 22). Base bits are reserved and must be set. */
export const PERM_BITS = {
  print: 0x004,
  modify: 0x008,
  copy: 0x010,
  annotate: 0x020,
  fillForms: 0x100,
  accessibility: 0x200,
  assemble: 0x400,
  printHigh: 0x800,
} as const;

export function permissionValue(allowed: Partial<Record<keyof typeof PERM_BITS, boolean>>): number {
  let p = 0xfffff0c0;
  for (const [k, bit] of Object.entries(PERM_BITS) as [keyof typeof PERM_BITS, number][]) {
    if (allowed[k] !== false) p |= bit;
    else p &= ~bit;
  }
  return p | 0;
}

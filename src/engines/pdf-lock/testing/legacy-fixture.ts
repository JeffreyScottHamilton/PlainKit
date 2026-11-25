// TEST ONLY. Builds encrypted PDFs for RC4-128 (V2 R3), AES-128 (V4 R4, AESV2) and AES-256 (V5 R5)
// from the spec, using node:crypto for AES and SHA. These files are independent fixtures: the
// unlock path must open them, and pdf.js (legacy build) must open them too.
// Not shipped: nothing in src/tools or src/workers imports this module.

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { md5 } from '../md5';
import { rc4 } from '../rc4';

export type FixtureMode = 'rc4-40' | 'rc4-128' | 'aes-128' | 'aes-256-r5';

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const pad32 = (pw: string) => Buffer.concat([Buffer.from(pw, 'utf8').subarray(0, 32), PAD]).subarray(0, 32);
const le4 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

const PLAIN_OBJECTS = (text: string): [number, string | Buffer][] => {
  const content = `BT /F1 24 Tf 20 60 Td (${text}) Tj ET`;
  return [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'],
    [4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
    [6, `<< /Title (${text}) >>`],
  ];
};

function legacyKey(userPad: Buffer, O: Buffer, P: number, id0: Buffer, n: number, r: number): Buffer {
  let h = md5(Buffer.concat([userPad, O, le4(P), id0]));
  if (r >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  return Buffer.from(h.subarray(0, n));
}

function legacyOwner(ownerPad: Buffer, userPad: Buffer, n: number, r: number): Buffer {
  let h = md5(ownerPad);
  if (r >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const key = Buffer.from(h.subarray(0, n));
  let x = Buffer.from(rc4(key, userPad));
  if (r >= 3) for (let i = 1; i <= 19; i++) x = Buffer.from(rc4(Buffer.from(key.map((b) => b ^ i)), x));
  return x;
}

function legacyU(key: Buffer, id0: Buffer, r: number): Buffer {
  if (r === 2) return Buffer.from(rc4(key, PAD));
  let x = Buffer.from(rc4(key, md5(Buffer.concat([PAD, id0]))));
  for (let i = 1; i <= 19; i++) x = Buffer.from(rc4(Buffer.from(key.map((b) => b ^ i)), x));
  return Buffer.concat([x, Buffer.alloc(16)]);
}

function aesCbc(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const c = createCipheriv(key.length === 16 ? 'aes-128-cbc' : 'aes-256-cbc', key, iv);
  return Buffer.concat([c.update(data), c.final()]);
}

function aesNoPad(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const c = createCipheriv(key.length === 16 ? 'aes-128-cbc' : 'aes-256-cbc', key, iv);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
}

const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();

function objKey(fileKey: Buffer, num: number, gen: number, aes: boolean): Buffer {
  const idx = Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
  const salt = aes ? Buffer.from('sAlT') : Buffer.alloc(0);
  return Buffer.from(md5(Buffer.concat([fileKey, idx, salt])).subarray(0, Math.min(fileKey.length + 5, 16)));
}

function encryptData(mode: FixtureMode, fileKey: Buffer, num: number, data: Buffer): Buffer {
  if (mode === 'rc4-128' || mode === 'rc4-40') return Buffer.from(rc4(objKey(fileKey, num, 0, false), data));
  const key = mode === 'aes-256-r5' ? fileKey : objKey(fileKey, num, 0, true);
  const iv = randomBytes(16);
  return Buffer.concat([iv, aesCbc(key, iv, data)]);
}

/** Rewrites object text: literal strings "(...)" in dictionaries become hex strings of ciphertext. */
function encryptObjectText(mode: FixtureMode, fileKey: Buffer, num: number, text: string): Buffer {
  const stream = /^(<<[\s\S]*?>>)\nstream\n([\s\S]*)\nendstream$/.exec(text);
  if (stream) {
    const enc = encryptData(mode, fileKey, num, Buffer.from(stream[2]!, 'latin1'));
    return Buffer.concat([Buffer.from(`${stream[1]!.replace(/\/Length \d+/, `/Length ${enc.length}`)}\nstream\n`, 'latin1'), enc, Buffer.from('\nendstream', 'latin1')]);
  }
  const replaced = text.replace(/\(([^)]*)\)/g, (_m, s: string) => `<${encryptData(mode, fileKey, num, Buffer.from(s, 'latin1')).toString('hex')}>`);
  return Buffer.from(replaced, 'latin1');
}

export function buildEncryptedFixture(mode: FixtureMode, opts: { userPassword: string; ownerPassword: string; text: string }): Buffer {
  const id0 = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const P = -3904; // 0xFFFFF0C0 as int32: the reserved base bits with every permission granted.
  const parts: Buffer[] = [];
  const offsets = new Map<number, number>();
  let encryptDict: string;
  let fileKey: Buffer;

  if (mode === 'aes-256-r5') {
    fileKey = randomBytes(32);
    const uVal = randomBytes(8);
    const uKey = randomBytes(8);
    const U = Buffer.concat([sha256(Buffer.from(opts.userPassword), uVal), uVal, uKey]);
    const UE = aesNoPad(sha256(Buffer.from(opts.userPassword), uKey), Buffer.alloc(16), fileKey);
    const oVal = randomBytes(8);
    const oKey = randomBytes(8);
    const O = Buffer.concat([sha256(Buffer.from(opts.ownerPassword), oVal, U), oVal, oKey]);
    const OE = aesNoPad(sha256(Buffer.from(opts.ownerPassword), oKey, U), Buffer.alloc(16), fileKey);
    encryptDict = `<< /Filter /Standard /V 5 /R 5 /Length 256 /P ${P} /O <${O.toString('hex')}> /U <${U.toString('hex')}> /OE <${OE.toString('hex')}> /UE <${UE.toString('hex')}> /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF >>`;
  } else {
    const n = mode === 'rc4-40' ? 5 : 16;
    const r = mode === 'rc4-40' ? 2 : mode === 'rc4-128' ? 3 : 4;
    const O = legacyOwner(pad32(opts.ownerPassword), pad32(opts.userPassword), n, r);
    fileKey = legacyKey(pad32(opts.userPassword), O, P, id0, n, r);
    const U = legacyU(fileKey, id0, r);
    const cf =
      mode === 'rc4-40'
        ? '/V 1 /R 2'
        : mode === 'rc4-128'
          ? '/V 2 /R 3 /Length 128'
          : '/V 4 /R 4 /Length 128 /CF << /StdCF << /CFM /AESV2 /AuthEvent /DocOpen /Length 16 >> >> /StmF /StdCF /StrF /StdCF';
    encryptDict = `<< /Filter /Standard ${cf} /P ${P} /O <${O.toString('hex')}> /U <${U.toString('hex')}> >>`;
  }

  const objects = PLAIN_OBJECTS(opts.text);
  const encryptNum = objects.length + 1;
  // Encrypt the objects. The Encrypt dictionary itself is not encrypted.
  const encryptedBodies = objects.map(([num, body]) => [num, encryptObjectText(mode, fileKey, num, String(body))] as const);

  parts.push(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
  for (const [num, body] of encryptedBodies) {
    offsets.set(num, parts.reduce((s, p) => s + p.length, 0));
    parts.push(Buffer.from(`${num} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1'));
  }
  offsets.set(encryptNum, parts.reduce((s, p) => s + p.length, 0));
  parts.push(Buffer.from(`${encryptNum} 0 obj\n${encryptDict}\nendobj\n`, 'latin1'));

  const xrefAt = parts.reduce((s, p) => s + p.length, 0);
  const size = encryptNum + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) xref += `${String(offsets.get(i) ?? 0).padStart(10, '0')} 00000 n \n`;
  parts.push(Buffer.from(xref, 'latin1'));
  parts.push(Buffer.from(`trailer\n<< /Size ${size} /Root 1 0 R /Info 6 0 R /Encrypt ${encryptNum} 0 R /ID [<${id0.toString('hex')}> <${id0.toString('hex')}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}


// @vitest-environment node
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { inspectPdf, lockPdf, unlockPdf } from './ops';
import { scanPdf } from './scan';
import { buildEncryptedFixture, type FixtureMode } from './testing/legacy-fixture';

const TEXT = 'Plainkit secret 42';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function makePlainPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 144]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 60, size: 24, font });
  doc.setTitle(text);
  return doc.save();
}

/** Independent reader: pdf.js legacy build in node. Rejects with PasswordException when a password is needed. */
async function pdfText(data: Uint8Array, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), password, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    return tc.items.map((i) => ('str' in i ? i.str : '')).join('');
  } finally {
    await task.destroy();
  }
}

const encryptDictOf = (bytes: Uint8Array) => {
  const raw = scanPdf(bytes);
  const e = raw.trailer.map.get('Encrypt');
  if (!e || typeof e !== 'object' || Array.isArray(e) || e.kind !== 'ref') return null;
  const o = raw.objects.get(e.num);
  return o && typeof o.value === 'object' && o.value !== null && !Array.isArray(o.value) && o.value.kind === 'dict' ? o.value : null;
};

async function expectToolError(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ToolError);
  expect((err as ToolError).code).toBe(code);
}

describe('acceptance: lock then verify with pdf.js', () => {
  it('lock with "pw" makes pdf.js ask for a password, and "pw" opens it with the text', async () => {
    const plain = await makePlainPdf(TEXT);
    const locked = await lockPdf(plain, { userPassword: 'pw' });
    await expect(pdfText(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    expect(await pdfText(locked, 'pw')).toContain(TEXT);
  });

  it('the owner password opens the locked file in pdf.js too', async () => {
    const plain = await makePlainPdf(TEXT);
    const locked = await lockPdf(plain, { userPassword: 'pw', ownerPassword: 'owner-pw' });
    expect(await pdfText(locked, 'owner-pw')).toContain(TEXT);
  });

  it('the locked bytes hold no plaintext of the text (strings and content are encrypted)', async () => {
    const plain = await makePlainPdf(TEXT);
    const locked = await lockPdf(plain, { userPassword: 'pw' });
    expect(Buffer.from(locked).includes(Buffer.from(TEXT))).toBe(false);
  });

  it('writes an AES-256 (V5 R6) Encrypt dictionary with /ID', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    const enc = encryptDictOf(locked);
    expect(enc).not.toBeNull();
    expect(enc!.map.get('V')).toBe(5);
    expect(enc!.map.get('R')).toBe(6);
    expect(scanPdf(locked).trailer.map.has('ID')).toBe(true);
  });
});

describe('acceptance: unlock', () => {
  it('unlock with "pw" yields a PDF pdf.js opens with no password, containing the text', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    const out = await unlockPdf(locked, 'pw');
    expect(out.opensWithoutPassword).toBe(false);
    expect(await pdfText(out.bytes)).toContain(TEXT);
    expect(scanPdf(out.bytes).trailer.map.has('Encrypt')).toBe(false);
  });

  it('unlock also accepts the owner password', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw', ownerPassword: 'owner-pw' });
    const out = await unlockPdf(locked, 'owner-pw');
    expect(await pdfText(out.bytes)).toContain(TEXT);
  });

  it('a wrong password throws a ToolError with code wrong-password', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    await expectToolError(unlockPdf(locked, 'not-the-password'), 'wrong-password');
  });

  it('the original bytes are not changed by lock or unlock', async () => {
    const plain = await makePlainPdf(TEXT);
    const before = sha(plain);
    const locked = await lockPdf(plain, { userPassword: 'pw' });
    expect(sha(plain)).toBe(before);
    const lockedBefore = sha(locked);
    await unlockPdf(locked, 'pw');
    expect(sha(locked)).toBe(lockedBefore);
  });

  it('an unencrypted PDF gives not-encrypted and inspect reports encrypted false', async () => {
    const plain = await makePlainPdf(TEXT);
    expect(await inspectPdf(plain)).toEqual({ encrypted: false, opensWithoutPassword: false });
    await expectToolError(unlockPdf(plain, ''), 'not-encrypted');
  });

  it('lock refuses an already-encrypted PDF', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    await expectToolError(lockPdf(locked, { userPassword: 'again' }), 'already-encrypted');
  });

  it('lock requires a non-empty password', async () => {
    await expectToolError(lockPdf(await makePlainPdf(TEXT), { userPassword: '' }), 'password-required');
  });

  it('lock with copying and editing disallowed clears those permission bits', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw', copy: false, edit: false });
    const P = encryptDictOf(locked)!.map.get('P') as number;
    expect(P & 0x010).toBe(0);
    expect(P & 0x008).toBe(0);
    expect(P & 0x004).toBe(0x004);
  });

  it('non-PDF bytes give not-pdf, and a truncated PDF gives a ToolError (no crash)', async () => {
    await expectToolError(unlockPdf(new TextEncoder().encode('hello'), 'x'), 'not-pdf');
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    const cut = locked.subarray(0, Math.floor(locked.length / 2));
    const err = await unlockPdf(cut, 'pw').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
  });

  it('an aborted unlock throws and does not return output', async () => {
    const locked = await lockPdf(await makePlainPdf(TEXT), { userPassword: 'pw' });
    const ctl = new AbortController();
    ctl.abort();
    await expect(unlockPdf(locked, 'pw', ctl.signal)).rejects.toThrow();
  });
});

describe('owner-only protection (opens without a password)', () => {
  const fixture = buildEncryptedFixture('rc4-128', { userPassword: '', ownerPassword: 'owner-only', text: TEXT });

  it('inspect reports the file opens without a password', async () => {
    expect(await inspectPdf(fixture)).toEqual({ encrypted: true, opensWithoutPassword: true });
  });

  it('unlock works with any typed password and reports that no password was needed', async () => {
    const out = await unlockPdf(fixture, 'anything');
    expect(out.opensWithoutPassword).toBe(true);
    expect(await pdfText(out.bytes)).toContain(TEXT);
  });
});

describe('legacy and AES-256 fixtures, independent of this engine', () => {
  const modes: FixtureMode[] = ['rc4-40', 'rc4-128', 'aes-128', 'aes-256-r5'];
  // pdf.js (legacy, node) is the independent oracle for these modes. It throws
  // "Invalid argument for stringToBytes" on the AES-256 R5 fixture before any password check,
  // so R5 has no independent oracle here (see the todo below).
  const oracleModes: FixtureMode[] = ['rc4-40', 'rc4-128', 'aes-128'];
  it.each(oracleModes)('%s: pdf.js needs the password, and the user password opens it', async (mode) => {
    const fixture = buildEncryptedFixture(mode, { userPassword: 'pw', ownerPassword: 'owner-pw', text: TEXT });
    await expect(pdfText(fixture)).rejects.toMatchObject({ name: 'PasswordException' });
    expect(await pdfText(fixture, 'pw')).toContain(TEXT);
  });
  it.todo('aes-256-r5: pdf.js oracle. pdf.js 5.x throws "Invalid argument for stringToBytes" on the R5 fixture; R5 is checked only by our own unlock tests');

  it.each(modes)('%s: unlock with the user password gives a PDF pdf.js opens with no password', async (mode) => {
    const fixture = buildEncryptedFixture(mode, { userPassword: 'pw', ownerPassword: 'owner-pw', text: TEXT });
    const out = await unlockPdf(fixture, 'pw');
    expect(await pdfText(out.bytes)).toContain(TEXT);
    expect(scanPdf(out.bytes).trailer.map.has('Encrypt')).toBe(false);
  });

  it.each(modes)('%s: unlock with the owner password works', async (mode) => {
    const fixture = buildEncryptedFixture(mode, { userPassword: 'pw', ownerPassword: 'owner-pw', text: TEXT });
    const out = await unlockPdf(fixture, 'owner-pw');
    expect(await pdfText(out.bytes)).toContain(TEXT);
  });

  it.each(modes)('%s: a wrong password is rejected', async (mode) => {
    const fixture = buildEncryptedFixture(mode, { userPassword: 'pw', ownerPassword: 'owner-pw', text: TEXT });
    await expectToolError(unlockPdf(fixture, 'nope'), 'wrong-password');
  });
});

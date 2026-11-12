import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { Adler32, MAX_FILES, SHA_LIMIT_BYTES, checkAlgFor, comparisonNumber, fingerprintsOf, parseMsg, planChunks, sanitizeFilename } from './protocol';

const enc = (s: string) => new TextEncoder().encode(s);

describe('chunk planning', () => {
  it('splits 300 KiB into four full 64 KiB chunks and one short tail', () => {
    const plan = planChunks(300 * 1024);
    expect(plan).toHaveLength(5);
    expect(plan.slice(0, 4).every((c) => c.length === 65536)).toBe(true);
    expect(plan[4]).toEqual({ offset: 4 * 65536, length: 300 * 1024 - 4 * 65536 });
    expect(plan.reduce((t, c) => t + c.length, 0)).toBe(300 * 1024);
  });

  it('handles exact multiples, one byte over, and empty files', () => {
    expect(planChunks(65536)).toEqual([{ offset: 0, length: 65536 }]);
    expect(planChunks(65537)).toEqual([
      { offset: 0, length: 65536 },
      { offset: 65536, length: 1 },
    ]);
    expect(planChunks(0)).toEqual([]);
  });

  it('uses SHA-256 up to the limit and Adler-32 above it', () => {
    expect(checkAlgFor(SHA_LIMIT_BYTES)).toBe('sha-256');
    expect(checkAlgFor(SHA_LIMIT_BYTES + 1)).toBe('adler32');
  });
});

describe('running checksum', () => {
  it('matches the published Adler-32 vector and the empty value', () => {
    expect(new Adler32().update(enc('Wikipedia')).hex()).toBe('11e60398');
    expect(new Adler32().hex()).toBe('00000001');
  });

  it('is the same whether updated in pieces or at once', () => {
    const data = enc('the quick brown fox jumps over the lazy dog'.repeat(1000));
    const whole = new Adler32().update(data).hex();
    const pieces = new Adler32();
    for (let i = 0; i < data.length; i += 777) pieces.update(data.subarray(i, i + 777));
    expect(pieces.hex()).toBe(whole);
  });
});

describe('filename sanitizing', () => {
  it('keeps only the last path part', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\photo.jpg')).toBe('photo.jpg');
  });

  it('replaces control characters', () => {
    expect(sanitizeFilename('a\u0000b\u001fc.txt')).toBe('a_b_c.txt');
  });

  it('falls back to a plain name when nothing usable is left', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('..')).toBe('file');
    expect(sanitizeFilename('dir/')).toBe('file');
  });
});

const SDP_A = 'v=0\r\na=fingerprint:sha-256 AA:11:22:33\r\n';
const SDP_B = 'v=0\r\na=fingerprint:sha-256 bb:44:55:66\r\n';

describe('fingerprints and comparison number', () => {
  it('extracts fingerprints in upper case', () => {
    expect(fingerprintsOf(SDP_B)).toEqual(['BB:44:55:66']);
    expect(fingerprintsOf('v=0\r\n')).toEqual([]);
  });

  it('gives the same six digits from either side', async () => {
    const ab = await comparisonNumber(SDP_A, SDP_B);
    const ba = await comparisonNumber(SDP_B, SDP_A);
    expect(ab).toMatch(/^\d{6}$/);
    expect(ab).toBe(ba);
  });

  it('changes when a fingerprint changes, and is null without fingerprints', async () => {
    const other = 'v=0\r\na=fingerprint:sha-256 CC:00:00:01\r\n';
    expect(await comparisonNumber(SDP_A, other)).not.toBe(await comparisonNumber(SDP_A, SDP_B));
    expect(await comparisonNumber('v=0\r\n', 'v=0\r\n')).toBeNull();
  });
});

describe('control message parsing', () => {
  it('parses a valid offer and replaces an unknown MIME type', () => {
    const m = parseMsg(JSON.stringify({ type: 'offer', files: [{ name: 'a.bin', size: 3, mime: 'application/x' }, { name: 'b', size: 0, mime: 'bad mime' }] }));
    expect(m).toEqual({
      type: 'offer',
      files: [
        { name: 'a.bin', size: 3, mime: 'application/x' },
        { name: 'b', size: 0, mime: 'application/octet-stream' },
      ],
    });
  });

  it('rejects garbage, unknown types, and malformed fields with a protocol error', () => {
    const cases = [
      'not json',
      JSON.stringify({ type: 'nope' }),
      JSON.stringify({ type: 'offer', files: [] }),
      JSON.stringify({ type: 'offer', files: Array.from({ length: MAX_FILES + 1 }, () => ({ name: 'x', size: 1, mime: 'a/b' })) }),
      JSON.stringify({ type: 'file-start', index: -1 }),
      JSON.stringify({ type: 'file-end', index: 0, bytes: 1, check: { alg: 'sha-256', hex: 'abc' } }),
      JSON.stringify({ type: 'cancel', reason: 'other' }),
    ];
    for (const c of cases) {
      let err: unknown;
      try {
        parseMsg(c);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).code).toBe('protocol');
    }
  });
});

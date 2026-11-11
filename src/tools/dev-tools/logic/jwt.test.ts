import { describe, expect, it } from 'vitest';
import { decodeJwt } from './jwt';

// Standard example token: HS256, payload {"sub":"1234567890","name":"John Doe","iat":1516239022}
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('jwt', () => {
  it('decodes header, payload and iat from a known token', () => {
    const r = decodeJwt(TOKEN, Date.parse('2030-01-01T00:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.alg).toBe('HS256');
    expect(r.payloadText).toContain('"name": "John Doe"');
    expect(r.claims).toEqual([{ name: 'iat', seconds: 1516239022, iso: '2018-01-18T01:30:22.000Z' }]);
    expect(r.expired).toBe(false);
  });
  it('flags an expired token', () => {
    const t = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ exp: 100 })).toString('base64url') + '.';
    const r = decodeJwt(t, 200_000);
    expect(r.ok && r.expired).toBe(true);
  });
  it('rejects input without three parts', () => {
    const r = decodeJwt('a.b', 0);
    expect(r).toEqual({ ok: false, message: 'A JWT has 3 dot-separated parts (header.payload.signature). Found 2.' });
  });
});

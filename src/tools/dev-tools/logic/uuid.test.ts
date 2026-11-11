import { describe, expect, it } from 'vitest';
import { formatUuid, uuidV4, uuidV7, validCount } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('v4 has version 4 and RFC variant bits', () => {
    for (let i = 0; i < 20; i++) expect(uuidV4()).toMatch(V4);
  });
  it('v7 sets version and variant bits and encodes the millisecond timestamp', () => {
    const ms = 1767225600123;
    const id = uuidV7(ms, (b) => b.fill(0xff));
    expect(id).toMatch(V7);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
  });
  it('formats uppercase and without hyphens', () => {
    expect(formatUuid('0190aaaa-bbbb-7ccc-8ddd-eeeeffff0000', true, false)).toBe('0190AAAABBBB7CCC8DDDEEEEFFFF0000');
  });
  it('validates count range 1-100', () => {
    expect([validCount(0), validCount(1), validCount(100), validCount(101), validCount(1.5)]).toEqual([false, true, true, false, false]);
  });
});

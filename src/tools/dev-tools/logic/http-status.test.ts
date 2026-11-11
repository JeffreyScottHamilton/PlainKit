import { describe, expect, it } from 'vitest';
import { HTTP_STATUS, searchStatus } from './http-status';

describe('http status reference', () => {
  it('contains the codes the reference must include and no duplicates', () => {
    const codes = HTTP_STATUS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of [418, 429, 451, 404, 500]) expect(codes).toContain(c);
  });

  it('matches numeric prefixes and text', () => {
    expect(searchStatus('42').map((s) => s.code)).toEqual([421, 422, 423, 424, 425, 426, 428, 429]);
    expect(searchStatus('teapot').map((s) => s.code)).toEqual([418]);
    expect(searchStatus('')).toHaveLength(HTTP_STATUS.length);
  });

  it('returns no rows for an unknown query', () => {
    expect(searchStatus('zzz-nothing')).toEqual([]);
  });
});

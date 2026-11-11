import { describe, expect, it } from 'vitest';
import { lineDiff } from './diff';

describe('diff', () => {
  it('marks removed and added lines with prefixes and counts them', () => {
    const r = lineDiff('a\nb\nc\n', 'a\nB\nc\n', false);
    expect([r.added, r.removed, r.same]).toEqual([1, 1, 2]);
    expect(r.rows).toContainEqual({ kind: 'removed', prefix: '- ', text: 'b' });
    expect(r.rows).toContainEqual({ kind: 'added', prefix: '+ ', text: 'B' });
  });
  it('can ignore whitespace-only differences', () => {
    const r = lineDiff('a  \n', 'a\n', true);
    expect([r.added, r.removed]).toEqual([0, 0]);
  });
});

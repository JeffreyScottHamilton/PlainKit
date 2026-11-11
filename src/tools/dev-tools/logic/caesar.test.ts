import { describe, expect, it } from 'vitest';
import { caesar, rot47 } from './caesar';

describe('caesar and ROT', () => {
  it('shifts letters, keeps case and non-letters', () => {
    expect(caesar('Hello, World! 123', 'shift', 3)).toBe('Khoor, Zruog! 123');
    expect(caesar('Khoor', 'shift', -3)).toBe('Hello');
    expect(caesar('abc', 'shift', -25)).toBe('bcd');
  });

  it('ROT13 is its own inverse', () => {
    const once = caesar('Plainkit 2026!', 'rot13', 0);
    expect(once).toBe('Cynvaxvg 2026!');
    expect(caesar(once, 'rot13', 0)).toBe('Plainkit 2026!');
  });

  it('ROT47 round-trips printable ASCII and leaves spaces alone', () => {
    const src = 'Hi there ~!';
    expect(rot47(rot47(src))).toBe(src);
    expect(rot47('Hello')).toBe('w6==@');
  });
});

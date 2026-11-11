import { describe, expect, it } from 'vitest';
import { hexToText, textToHex } from './hex-ascii';

describe('hex-ascii', () => {
  it('encodes UTF-8 bytes of é as c3 a9', () => {
    expect(textToHex('é', 'space')).toBe('c3 a9');
    expect(textToHex('é', 'none')).toBe('c3a9');
    expect(textToHex('é', '0x')).toBe('0xc3 0xa9');
  });

  it('decodes mixed separators back to text', () => {
    expect(hexToText('0xc3 0xa9, c3a9')).toEqual({ ok: true, text: 'éé', bytes: 4 });
    expect(hexToText('48656c6c6f')).toEqual({ ok: true, text: 'Hello', bytes: 5 });
  });

  it('reports the position of an invalid hex digit and odd counts', () => {
    const bad = hexToText('48 6g');
    expect(bad).toEqual({ ok: false, error: 'Invalid hex character "g" at position 5.' });
    const odd = hexToText('486');
    expect(odd.ok).toBe(false);
    if (!odd.ok) expect(odd.error).toMatch(/Odd number of hex digits \(3\)/);
  });
});

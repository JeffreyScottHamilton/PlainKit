import { describe, expect, it } from 'vitest';
import { cssVariables, hexList } from './export';

describe('export text', () => {
  it('writes one numbered CSS variable per color inside :root', () => {
    expect(cssVariables(['#ff0000', '#00ff00'])).toBe(':root {\n  --color-1: #ff0000;\n  --color-2: #00ff00;\n}\n');
  });

  it('writes one HEX value per line', () => {
    expect(hexList(['#ff0000', '#00ff00'])).toBe('#ff0000\n#00ff00\n');
    expect(hexList([])).toBe('');
  });
});

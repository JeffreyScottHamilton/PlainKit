import { describe, expect, it } from 'vitest';
import { commandPreview, parseOctal, parseSymbolic, toOctal, toSymbolic } from './chmod';

describe('chmod', () => {
  it('converts 4755 with setuid to symbolic and back', () => {
    const r = parseOctal('4755');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toEqual({ special: 4, owner: 7, group: 5, other: 5 });
    expect(toSymbolic(r.mode)).toBe('rwsr-xr-x');
    expect(toOctal(r.mode)).toBe('4755');
    expect(parseSymbolic('rwsr-xr-x')).toEqual({ ok: true, mode: r.mode });
  });

  it('uses 3 digits without special bits and previews the command', () => {
    const r = parseOctal('755');
    if (!r.ok) throw new Error('unexpected');
    expect(toOctal(r.mode)).toBe('755');
    expect(commandPreview(r.mode, 'deploy.sh')).toBe('chmod 755 deploy.sh');
    expect(commandPreview(r.mode, "my file's")).toBe("chmod 755 'my file'\\''s'");
  });

  it('rejects bad octal and symbolic input', () => {
    expect(parseOctal('789').ok).toBe(false);
    expect(parseOctal('75').ok).toBe(false);
    const sym = parseSymbolic('rwxr-xr-q');
    expect(sym.ok).toBe(false);
  });
});

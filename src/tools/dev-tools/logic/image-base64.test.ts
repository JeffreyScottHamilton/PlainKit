import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64, parseDataUri, toDataUri } from './image-base64';

describe('image base64', () => {
  it('encodes bytes and builds a data URI', () => {
    const buf = new TextEncoder().encode('Hi').buffer as ArrayBuffer;
    expect(arrayBufferToBase64(buf)).toBe('SGk=');
    expect(toDataUri('image/png', 'SGk=')).toBe('data:image/png;base64,SGk=');
  });

  it('parses an allowed raster data URI and counts decoded bytes', () => {
    const r = parseDataUri('data:image/png;base64,SGVsbG8=');
    expect(r).toEqual({ ok: true, mime: 'image/png', base64: 'SGVsbG8=', bytes: 5 });
  });

  it('rejects SVG and other types', () => {
    const svg = parseDataUri('data:image/svg+xml;base64,PHN2Zz4=');
    expect(svg.ok).toBe(false);
    if (!svg.ok) expect(svg.error).toMatch(/SVG is not allowed/);
    expect(parseDataUri('data:text/html;base64,PGI+').ok).toBe(false);
    expect(parseDataUri('data:image/png;base64,SGVsb').ok).toBe(false);
  });
});

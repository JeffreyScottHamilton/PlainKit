import { describe, expect, it } from 'vitest';
import { assertDecodable, fitWithin, parseHexColor } from './dimensions';
import { ToolError } from '@/lib/errors';

describe('fitWithin', () => {
  it('keeps aspect ratio and never upscales', () => {
    expect(fitWithin(1200, 800, 600)).toEqual({ width: 600, height: 400, scaled: true });
    expect(fitWithin(1200, 800, 4000)).toEqual({ width: 1200, height: 800, scaled: false });
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false });
  });
});

describe('assertDecodable', () => {
  it('refuses sides over 16384 px and more than 100 megapixels', () => {
    expect(() => assertDecodable(16385, 10)).toThrow(ToolError);
    expect(() => assertDecodable(11000, 10000)).toThrow(ToolError);
    expect(() => assertDecodable(6000, 4000)).not.toThrow();
  });
});

describe('parseHexColor', () => {
  it('accepts only #rrggbb', () => {
    expect(parseHexColor('#FFFFFF')).toBe('#ffffff');
    expect(parseHexColor('#fff')).toBeNull();
    expect(parseHexColor('red')).toBeNull();
  });
});

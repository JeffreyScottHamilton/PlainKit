import { describe, expect, it } from 'vitest';
import { decodeGifWithGifuct, composeGif } from './gifdecode';
import { quantizeRgba, writeGif, type IndexedFrame } from './write';
import type { ParsedFrame } from 'gifuct-js';

/** A solid RGBA frame, fully opaque. */
function solid(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = rgb[0];
    d[i * 4 + 1] = rgb[1];
    d[i * 4 + 2] = rgb[2];
    d[i * 4 + 3] = 255;
  }
  return d;
}

function indexed(w: number, h: number, rgb: [number, number, number], ms: number, colors = 256): IndexedFrame {
  return { ...quantizeRgba(solid(w, h, rgb), colors), width: w, height: h, ms };
}

const bytesOf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const hasNetscape = (u: Uint8Array) => Buffer.from(u).includes(Buffer.from('NETSCAPE2.0'));

describe('GIF round trip: encode then decode', () => {
  it('keeps the frame count, the order, the delays and the colours', () => {
    const bytes = writeGif(
      [indexed(16, 8, [255, 0, 0], 100), indexed(16, 8, [0, 255, 0], 200), indexed(16, 8, [0, 0, 255], 330)],
      true,
    );
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    const frames = [...decodeGifWithGifuct(bytesOf(bytes))];
    expect(frames.map((f) => f.ms)).toEqual([100, 200, 330]);
    expect(frames.map((f) => [f.width, f.height])).toEqual([
      [16, 8],
      [16, 8],
      [16, 8],
    ]);
    const px = (f: (typeof frames)[number]): number[] => [f.data[0]!, f.data[1]!, f.data[2]!];
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 8);
    expect(near(px(frames[0]!), [255, 0, 0])).toBe(true);
    expect(near(px(frames[1]!), [0, 255, 0])).toBe(true);
    expect(near(px(frames[2]!), [0, 0, 255])).toBe(true);
  });

  it('rounds delays to whole centiseconds, as the format stores them', () => {
    const bytes = writeGif([indexed(4, 4, [9, 9, 9], 33)], true);
    expect([...decodeGifWithGifuct(bytesOf(bytes))].map((f) => f.ms)).toEqual([30]);
  });

  it('writes the loop block only when the animation should repeat', () => {
    const frame = [indexed(4, 4, [1, 2, 3], 100)];
    expect(hasNetscape(writeGif(frame, true))).toBe(true);
    expect(hasNetscape(writeGif(frame, false))).toBe(false);
  });

  it('uses a smaller palette when asked, and still decodes', () => {
    const q = quantizeRgba(solid(8, 8, [10, 200, 90]), 64);
    expect(q.palette.length).toBeLessThanOrEqual(64);
    expect([...decodeGifWithGifuct(bytesOf(writeGif([{ ...q, width: 8, height: 8, ms: 100 }], true)))]).toHaveLength(1);
  });

  it('rejects bytes that are not a GIF with a ToolError', () => {
    expect(() => decodeGifWithGifuct(new TextEncoder().encode('not a gif at all, just text').buffer as ArrayBuffer)).toThrow(
      /This file is not a GIF/,
    );
  });
});

describe('composeGif disposal', () => {
  const frame = (dims: { top: number; left: number; width: number; height: number }, disposalType: number, rgba: number[]): ParsedFrame =>
    ({ dims: { ...dims }, disposalType, delay: 50, patch: Uint8ClampedArray.from(rgba), colorTable: [], pixels: [], transparentIndex: 0 }) as ParsedFrame;

  it('clears the previous frame area when its disposal is 2', () => {
    const a = frame({ top: 0, left: 0, width: 1, height: 1, }, 2, [255, 0, 0, 255]);
    const b = frame({ top: 0, left: 1, width: 1, height: 1 }, 0, [0, 255, 0, 255]);
    const out = [...composeGif(2, 1, [a, b])];
    expect(Array.from(out[1]!.data)).toEqual([0, 0, 0, 0, 0, 255, 0, 255]);
  });

  it('restores the previous screen when its disposal is 3', () => {
    const a = frame({ top: 0, left: 0, width: 1, height: 1 }, 3, [255, 0, 0, 255]);
    const b = frame({ top: 0, left: 1, width: 1, height: 1 }, 0, [0, 255, 0, 255]);
    const out = [...composeGif(2, 1, [a, b])];
    expect(Array.from(out[1]!.data)).toEqual([0, 0, 0, 0, 0, 255, 0, 255]);
  });
});

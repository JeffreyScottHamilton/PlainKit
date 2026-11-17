export type PaletteSize = 3 | 5 | 8 | 10;
export const PALETTE_SIZES: readonly PaletteSize[] = [3, 5, 8, 10];

/** Straight (not premultiplied) RGBA pixels, row-major. */
export type Rgba = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> };

/** share is 0..1 of the opaque pixels sampled from the picture. */
export type Swatch = { hex: string; share: number };

export type PaletteRequest = { type: 'analyze'; blob: Blob; k: PaletteSize };
export type PaletteResponse = { kind: 'analyze'; colors: Swatch[]; preview: Rgba };

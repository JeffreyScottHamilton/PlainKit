export type Pt = { x: number; y: number };

/** Page corners as fractions of the photo width (x) and height (y). Order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** RGBA pixels, row-major, 4 bytes per pixel. */
export type Raster = { width: number; height: number; data: Uint8ClampedArray };

export type Filter = 'original' | 'enhanced' | 'bw' | 'gray';
export type Turns = 0 | 1 | 2 | 3;
export type PageFormat = 'image/jpeg' | 'image/png';
export type PageSizeChoice = 'fit' | 'a4' | 'letter';

export type ScanRequest =
  | { type: 'detect'; blob: Blob }
  | { type: 'page'; blob: Blob; quad: Quad; turns: Turns; filter: Filter; format: PageFormat; maxSide: number };

export type DetectResult = { kind: 'detect'; quad: Quad; detected: boolean };
export type PageResult = { kind: 'page'; bytes: Uint8Array; mime: PageFormat; width: number; height: number };
export type ScanResponse = DetectResult | PageResult;

export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp';
/** Bundled Inter, or system families. Canvas text cannot use remote fonts, and none are used. */
export type FontId = 'inter' | 'sans' | 'serif' | 'mono';
/** Row (t/m/b) then column (l/c/r). */
export type Position = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export type Point = { x: number; y: number };
export type Box = { w: number; h: number };

export type Content = { kind: 'text'; text: string; font: FontId; bold: boolean } | { kind: 'logo'; whiteTransparent: boolean };

export type Placement = { kind: 'grid'; position: Position; marginPct: number } | { kind: 'tile'; spacingPct: number; angle: number };

/** Sizes are percentages of the shorter side of the image, so one setting scales across mixed sizes. */
export type WatermarkSettings = {
  content: Content;
  /** '#rrggbb'. Text only. */
  color: string;
  /** 0..1 */
  opacity: number;
  /** 1..100, share of the shorter side (text: font size; logo: longest side). */
  sizePct: number;
  placement: Placement;
  /** 'keep' resolves to the input format when it is JPEG, PNG or WebP, otherwise PNG. */
  format: 'keep' | OutputMime;
  /** 0..1, used for JPEG and WebP only. */
  quality: number;
};

export type RenderResult = {
  blob: Blob;
  mime: OutputMime;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Number of watermark copies drawn (1 for a single position). */
  copies: number;
  quality: number | null;
  warnings: string[];
};

export type WatermarkRequest = { type: 'watermark'; blob: Blob; logo: Blob | null; settings: WatermarkSettings };

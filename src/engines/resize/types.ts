import type { ImageMime } from '@/engines/image/sniff';

export type Turns = 0 | 1 | 2 | 3; // quarter turns clockwise
export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type Size = { width: number; height: number };
/** Rectangle in pixels of the oriented (rotated/flipped) image. */
export type Rect = { x: number; y: number; w: number; h: number };
/** Same, as fractions 0..1 of the oriented image. Stored so one crop applies to many sizes. */
export type NormRect = { x: number; y: number; w: number; h: number };

export type Target =
  | { kind: 'exact'; width: number; height: number }
  | { kind: 'width'; width: number } // height follows the crop's aspect ratio
  | { kind: 'percent'; percent: number }
  | { kind: 'fit'; maxEdge: number }; // never enlarges

export type RenderSettings = {
  turns: Turns;
  flipH: boolean;
  flipV: boolean;
  crop: NormRect;
  /** width / height of the crop, or null for free. */
  aspect: number | null;
  target: Target;
  /** 'keep' resolves to the input format when it is JPEG, PNG or WebP, otherwise PNG. */
  format: OutputMime | 'keep';
  /** 0..1, used for JPEG and WebP only. */
  quality: number;
};

export type Plan = { crop: Rect; width: number; height: number; upscaled: boolean };
export type PlanResult = { ok: true; plan: Plan } | { ok: false; message: string; nextAction: string };

export type RenderResult = {
  blob: Blob;
  mime: OutputMime;
  width: number;
  height: number;
  /** Size of the image as decoded, before rotation and crop. */
  sourceWidth: number;
  sourceHeight: number;
  crop: Rect;
  upscaled: boolean;
  /** null for PNG. */
  quality: number | null;
  warnings: string[];
};

export type ResizeRequest = { type: 'resize'; blob: Blob; settings: RenderSettings };

export type InputMime = Extract<ImageMime, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/bmp' | 'image/avif'>;

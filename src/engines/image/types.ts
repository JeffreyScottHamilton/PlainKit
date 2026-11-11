import type { ImageMime } from './sniff';

export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp';
export const OUTPUT_MIMES: readonly OutputMime[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * quality: 0..1 for lossy formats. For PNG it is ignored (and a warning is returned when it was given).
 * quality undefined: the encoder default (0.92 for JPEG/WebP), with no PNG warning.
 */
export type QualityMode = { kind: 'quality'; quality?: number };
export type TargetMode = { kind: 'target'; targetBytes: number };
export type EncodeMode = QualityMode | TargetMode;

export type EncodeOptions = {
  mime: OutputMime;
  mode: EncodeMode;
  /** Longest side in px. Never upscales. */
  maxDimension?: number;
  /** "#rrggbb" fill for outputs without alpha (JPEG). Default white. */
  background?: string;
};

export type EncodeResult = {
  blob: Blob;
  mime: OutputMime;
  width: number;
  height: number;
  /** Quality actually used. null for PNG. */
  quality: number | null;
  /** null when no target was requested. */
  targetMet: boolean | null;
  /** Sampled at up to 256 px; a very small transparent area can be missed. */
  hadAlpha: boolean;
  warnings: string[];
  inputMime: ImageMime;
  inputWidth: number;
  inputHeight: number;
};

export type InspectResult = {
  mime: ImageMime;
  width: number;
  height: number;
  hadAlpha: boolean;
  /** GIF is always reported (first frame only). PNG/WebP when animation is signalled in the header. */
  animated: boolean;
};

export type WorkerRequest = { type: 'encode'; blob: Blob; options: EncodeOptions } | { type: 'inspect'; blob: Blob };

export type WorkerResponse = { kind: 'encode'; value: EncodeResult } | { kind: 'inspect'; value: InspectResult };

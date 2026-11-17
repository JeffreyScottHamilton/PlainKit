/** Limits enforced in the worker. Every one is reported as a ToolError with a next action, never a silent cut. */
export const GIF_LIMITS = {
  maxFrames: 600,
  /** Largest frame kept at full size. Bigger video or images are scaled down to fit (with a warning). */
  maxFramePixels: 1920 * 1080,
  /** Frames × output pixels: palette indexes held in memory while encoding. */
  maxExportPixels: 50_000_000,
  /** Longest edge of the frames sent back to the page for the editor and preview. */
  previewMaxEdge: 320,
  /** Shortest per-frame delay: most browsers play anything faster as 100 ms. */
  minDelayMs: 20,
  maxDelayMs: 60_000,
  /** Delay given to still images, which have no timing of their own. */
  stillMs: 200,
} as const;

export type StillItem = { id: string; name: string; blob: Blob };

/** Where frames come from. A video is read at a frame rate; stills and GIFs contribute their own frames. */
export type FrameSpec =
  | { kind: 'video'; blob: Blob; startSec: number; endSec: number | null; fps: number }
  | { kind: 'stills'; items: StillItem[] };

/** Crop rectangle in percent of the frame, 0..100. */
export type Crop = { x: number; y: number; w: number; h: number };

/** One frame in play order. `id` names a source frame; `ms` is how long it stays on screen. */
export type Entry = { id: string; ms: number };

export type GifOptions = {
  /** Output width in pixels; height follows the cropped aspect ratio. null keeps the cropped size. */
  width: number | null;
  crop: Crop | null;
  colors: 64 | 128 | 256;
  loop: boolean;
};

export type ProbeRequest = { type: 'probe'; spec: FrameSpec };
export type ExportRequest = { type: 'export'; spec: FrameSpec; entries: Entry[]; options: GifOptions };
export type GifRequest = ProbeRequest | ExportRequest;

export type ProbedFrame = { id: string; ms: number; bitmap: ImageBitmap };
export type ProbeResult = {
  kind: 'probe';
  /** Preview frames, all the same size (width × height), composed the way the export composes them. */
  frames: ProbedFrame[];
  width: number;
  height: number;
  /** Size the export works at (after the memory cap). */
  fullWidth: number;
  fullHeight: number;
  warnings: string[];
};
export type ExportResult = { kind: 'export'; bytes: Uint8Array; width: number; height: number; frames: number; warnings: string[] };
export type GifResult = ProbeResult | ExportResult;

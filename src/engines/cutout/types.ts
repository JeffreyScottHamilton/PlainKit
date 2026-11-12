export type CutoutRequest =
  | { type: 'segment'; blob: Blob; engine?: { model: ArrayBuffer; wasm: ArrayBuffer } }
  | { type: 'compose'; blob: Blob; matte: Uint8Array; mw: number; mh: number };

export type SegmentResult = {
  kind: 'segment';
  /** Raw model matte, `mw` x `mh` (the model's input size), 0..255. */
  matte: Uint8Array;
  mw: number;
  mh: number;
  /** Original image size after EXIF orientation. */
  width: number;
  height: number;
  inferenceMs: number;
};
export type ComposeResult = { kind: 'compose'; blob: Blob; width: number; height: number };
export type CutoutResponse = SegmentResult | ComposeResult;

export type FaceRequest = { type: 'detect'; blob: Blob; engine: { model: ArrayBuffer; wasm: ArrayBuffer } };
export type FaceBox = { x: number; y: number; w: number; h: number; score: number };
/** Boxes are integers in ORIGINAL image pixels (after EXIF orientation), already padded and clamped. */
export type FaceResult = { kind: 'detect'; boxes: FaceBox[]; width: number; height: number; inferenceMs: number };
export type FaceResponse = FaceResult;

// The one background-removal model Cutout ships. See docs/models.md for why.
export const MODEL = {
  id: 'u2netp',
  name: 'U²-Net-p',
  url: '/models/u2netp/model.onnx',
  /** Exact byte size of the committed file; the UI confirms it with a HEAD request when it can. */
  bytes: 4_574_861,
  sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  licence: 'Apache-2.0',
  licenceUrl: '/models/u2netp/LICENSE',
  inputName: 'input.1',
  /** Model input is a fixed 320 x 320 RGB square; the image is stretched to it (as rembg does). */
  size: 320,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
} as const;

export const ENGINE = {
  name: 'ONNX Runtime Web 1.31.1 (WebAssembly, single thread)',
  /** Loaded at runtime from the same origin; copied there by scripts/copy-ort.mjs. */
  moduleUrl: '/engines/ort/ort.wasm.min.mjs',
  wasmUrl: '/engines/ort/ort-wasm-simd-threaded.wasm',
  bytes: 14_848_852,
  licence: 'MIT',
} as const;

/** Explicit, versioned cache name. Bump the suffix when the file changes. */
export const CACHE_PREFIX = 'plainkit-model-';
export const CACHE_NAME = `${CACHE_PREFIX}${MODEL.id}-v1`;

/** Largest input accepted: 40 megapixels. */
export const MAX_PIXELS = 40_000_000;

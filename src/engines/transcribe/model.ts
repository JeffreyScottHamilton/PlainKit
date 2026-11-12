// The one speech model the Subtitles tool offers. See docs/models.md for why and for the evidence.
export const WHISPER = {
  id: 'whisper-tiny-en',
  name: 'Whisper tiny.en (8-bit)',
  repo: 'onnx-community/whisper-tiny.en',
  revision: '794207fec2761281fe63a23a94b7e9f53a4efbc1',
  /** Served from this site; transformers.js resolves `<localModelPath>/<id>/...`. */
  localModelPath: '/models/',
  licence: 'Apache-2.0 (OpenAI Whisper code is MIT)',
  licenceUrl: '/models/whisper-tiny-en/LICENSE',
  /** English only. A multilingual model was not shipped: tiny multilingual is much less accurate. */
  languages: 'English only',
  multilingual: false,
  dtype: 'q8',
} as const;

/** Every file the browser fetches for a run: model files first, then the ONNX Runtime wasm. Bytes are exact. */
export const FILES = [
  { url: '/models/whisper-tiny-en/config.json', bytes: 2197 },
  { url: '/models/whisper-tiny-en/generation_config.json', bytes: 1646 },
  { url: '/models/whisper-tiny-en/preprocessor_config.json', bytes: 339 },
  { url: '/models/whisper-tiny-en/tokenizer.json', bytes: 2405679 },
  { url: '/models/whisper-tiny-en/tokenizer_config.json', bytes: 282662 },
  { url: '/models/whisper-tiny-en/onnx/encoder_model_quantized.onnx', bytes: 10124993 },
  { url: '/models/whisper-tiny-en/onnx/decoder_model_merged_quantized.onnx', bytes: 30718858 },
] as const;
export const MODEL_BYTES = FILES.reduce((n, f) => n + f.bytes, 0);

export const ENGINE = {
  name: 'ONNX Runtime Web (WebAssembly, single thread)',
  moduleUrl: '/engines/transformers/ort-wasm-simd-threaded.mjs',
  wasmUrl: '/engines/transformers/ort-wasm-simd-threaded.wasm',
  bytes: 14_264_838,
} as const;

export const CACHE_PREFIX = 'plainkit-model-';
/** Versioned. Bump the suffix when any model file changes. */
export const CACHE_NAME = `${CACHE_PREFIX}${WHISPER.id}-v1`;

export const SAMPLE_RATE = 16000;
export const WARN_SECONDS = 10 * 60;
export const MAX_SECONDS = 30 * 60;

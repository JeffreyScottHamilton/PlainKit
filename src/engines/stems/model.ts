// The one stem model Audio stems ships. See docs/models.md and docs/audits/stems-feasibility.md.
export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const;
export type StemName = (typeof STEM_NAMES)[number];

type StemFile = { stem: StemName; url: string; bytes: number; sha256: string };

export const MODEL = {
  id: 'spleeter-4stems',
  name: 'Spleeter 4 stems (fp16 weights)',
  base: '/models/spleeter-4stems/',
  files: [
    { stem: 'vocals', url: '/models/spleeter-4stems/vocals.fp16.onnx', bytes: 19_714_141, sha256: 'db47148ab1c52709ce694893f532c91abfe3edc4d46238939570e036a22878ca' },
    { stem: 'drums', url: '/models/spleeter-4stems/drums.fp16.onnx', bytes: 19_714_140, sha256: '7ae4002e5633634674f74dc3356d5875b0da894d59ce0f60e844bb8f9cb8aa92' },
    { stem: 'bass', url: '/models/spleeter-4stems/bass.fp16.onnx', bytes: 19_714_139, sha256: 'ba4c4949a27222492cca49859901a873b4b71461dc48c7c5a51f93d31eb11f55' },
    { stem: 'other', url: '/models/spleeter-4stems/other.fp16.onnx', bytes: 19_714_140, sha256: '3cc59116cb7195946ab9596d8ca25984d09c0f8a70db8cf85d063132f97bc61d' },
  ] as readonly StemFile[],
  /** Sum of the four files. */
  bytes: 78_856_560,
  licence: 'MIT (Deezer Spleeter)',
  licenceUrl: '/models/spleeter-4stems/LICENSE',
  /** The network only understands 44.1 kHz audio. */
  sampleRate: 44_100,
} as const;

export const ENGINE = {
  name: 'ONNX Runtime Web 1.31.1 (WebAssembly, single thread)',
  moduleUrl: '/engines/ort/ort.wasm.min.mjs',
  wasmUrl: '/engines/ort/ort-wasm-simd-threaded.wasm',
  bytes: 14_848_852,
} as const;

/** Longest audio accepted. Output WAVs (4 stems, 16-bit) and the input copy must fit in tab memory. */
export const MAX_SECONDS = 300;
/** Segment and cross-fade lengths in samples at 44.1 kHz (10 s and 1 s). */
export const SEGMENT = 441_000;
export const OVERLAP = 44_100;
/**
 * Reference speed for the pre-start estimate: processing seconds per audio second, measured in
 * headless Chromium on the build container (see docs/audits/stems-feasibility.md). Real devices differ.
 */
export const REFERENCE_RTF = 0.7;

export const CACHE_PREFIX = 'plainkit-model-';
export const CACHE_NAME = `${CACHE_PREFIX}${MODEL.id}-v1`;

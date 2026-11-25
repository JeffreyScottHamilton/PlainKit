// Files Image to text loads at runtime, all copied to public/ocr/ by scripts/copy-ocr.mjs.
// Bytes are the exact sizes of those files; the first-use notice shows their sum.
export const OCR_FILES = {
  worker: { url: '/ocr/worker.min.js', bytes: 111_307 },
  core: { url: '/ocr/tesseract-core-simd-lstm.wasm.js', bytes: 3_899_472 },
  wasm: { url: '/ocr/tesseract-core-simd-lstm.wasm', bytes: 2_857_601 },
  /** Directory: the worker appends `<lang>.traineddata.gz`. */
  langPath: '/ocr/lang',
  lang: { file: 'eng.traineddata.gz', bytes: 2_952_873 },
} as const;

/** Bytes the browser downloads on first use: worker + core loader + core binary + English model. */
export const FIRST_USE_BYTES = OCR_FILES.worker.bytes + OCR_FILES.core.bytes + OCR_FILES.wasm.bytes + OCR_FILES.lang.bytes;

/** Largest PDF page count accepted in one run. */
export const MAX_PDF_PAGES = 20;
/** Rendering scale for PDF pages: 200 dpi (PDF points are 72 per inch). */
export const PDF_DPI = 200;
/** Largest raster sent to the engine, in pixels (40 megapixels). */
export const MAX_PIXELS = 40_000_000;
/** Words below this confidence (0-100) are listed for review. */
export const LOW_CONFIDENCE = 60;

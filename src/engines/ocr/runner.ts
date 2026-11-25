import { createWorker, OEM, type Worker as TessWorker, type LoggerMessage, type Page } from 'tesseract.js';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import { renderPages } from '@/engines/pdf/raster';
import { MAX_PDF_PAGES, MAX_PIXELS, OCR_FILES, PDF_DPI } from './model';
import { parsePageSpec } from './pages';
import { preprocessRgba, upscaleFactor } from './preprocess';
import { hasWasmSimd } from './support';
import { summarizeWords, type OcrSummary } from './summary';

export type OcrOptions = { grayscale: boolean; autoContrast: boolean; upscale: boolean };
export type PageText = { page: number; text: string; summary: OcrSummary };

/** One engine per tab, kept between runs so the model is not downloaded again each time. */
let engine: Promise<TessWorker> | null = null;
let loaded = false;
/** Receives engine-loading progress for the job that is running now. */
let loadProgress: ((message: string, fraction?: number) => void) | null = null;

/** True once the engine has started in this tab. Before that, a run downloads the engine files first. */
export const isEngineLoaded = (): boolean => loaded;

const abortError = () => new DOMException('Canceled', 'AbortError');

/** Terminates the engine. Work in flight is abandoned; the next run starts a fresh engine. */
export async function stopEngine(): Promise<void> {
  const current = engine;
  engine = null;
  if (!current) return;
  try {
    const w = await current;
    await w.terminate();
  } catch {
    // An engine that never started has nothing to terminate.
  }
}

function getEngine(): Promise<TessWorker> {
  engine ??= createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: OCR_FILES.worker.url,
    corePath: OCR_FILES.core.url,
    langPath: OCR_FILES.langPath,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: (m: LoggerMessage) => loadProgress?.(m.status, m.status.includes('loading') ? m.progress : undefined),
    errorHandler: () => undefined,
  }).then(
    (w) => {
      loaded = true;
      return w;
    },
    () => {
      engine = null;
      throw new ToolError('engine-load', 'The text recognition engine could not start.', 'Check the connection, then try again. The first run downloads the engine.');
    },
  );
  return engine;
}

/** Rejects as soon as the signal aborts, and terminates the engine so the work really stops. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      void stopEngine();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Draws an image blob to a canvas, optionally upscaled and preprocessed. The pixel math is in preprocess.ts. */
async function toCanvas(blob: Blob, opts: OcrOptions): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new ToolError('decode', 'This image could not be read.', 'Use a PNG, JPEG, WebP, GIF or BMP file.');
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    const { width, height } = bitmap;
    bitmap.close();
    throw new ToolError('too-large', `This image is ${width} × ${height}, which is too large to read here.`, 'Crop or resize it, then try again.');
  }
  const f = upscaleFactor(bitmap.width, bitmap.height, opts.upscale, MAX_PIXELS);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * f;
  canvas.height = bitmap.height * f;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new ToolError('canvas', 'This browser could not create a drawing surface.', 'Try another browser.');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (opts.grayscale || opts.autoContrast) {
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(preprocessRgba(img.data, { grayscale: opts.grayscale, autoContrast: opts.autoContrast }));
    g.putImageData(img, 0, 0);
  }
  return canvas;
}

function wordsOf(page: Page): { text: string; confidence: number }[] {
  const out: { text: string; confidence: number }[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) out.push({ text: word.text, confidence: word.confidence });
      }
    }
  }
  return out;
}

async function recognizeCanvas(canvas: HTMLCanvasElement, ctx: EngineContext): Promise<Omit<PageText, 'page'>> {
  const w = await raceAbort(getEngine(), ctx.signal);
  ctx.onProgress({ stage: 'processing', message: 'Reading text' });
  const res = await raceAbort(w.recognize(canvas, {}, { text: true, blocks: true }), ctx.signal);
  return { text: res.data.text.trim(), summary: summarizeWords(wordsOf(res.data)) };
}

/**
 * Reads text from one image, or from the pages of a PDF selected by `pageSpec` (e.g. "1-3, 5"; blank = all).
 * PDF pages are all rendered first, then only the selected ones are read. Throws ToolError on failure
 * and AbortError on cancel.
 */
export async function recognize(
  input: Blob,
  kind: 'image' | 'pdf',
  pageSpec: string,
  opts: OcrOptions,
  ctx: EngineContext,
): Promise<{ results: PageText[]; warnings: string[] }> {
  if (!hasWasmSimd()) {
    throw new ToolError('unsupported', 'This browser cannot run the text recognition engine (WebAssembly SIMD is missing).', 'Use a current Chrome, Edge, Firefox or Safari.');
  }
  loadProgress = (message, fraction) => ctx.onProgress({ stage: 'loading-engine', message, fraction });
  try {
    if (kind === 'image') {
      const canvas = await toCanvas(input, opts);
      return { results: [{ page: 1, ...(await recognizeCanvas(canvas, ctx)) }], warnings: [] };
    }
    let selected: Set<number> | null = null;
    const results: PageText[] = [];
    const { warnings } = await renderPages(input, { dpi: PDF_DPI, format: 'image/png', quality: 1 }, ctx, async (rendered, index, total) => {
      if (!selected) {
        const spec = parsePageSpec(pageSpec, total);
        if (!spec.ok) throw new ToolError('pages', spec.message, 'Change the page range and run again.');
        if (spec.pages.length > MAX_PDF_PAGES) throw new ToolError('too-many-pages', `Up to ${MAX_PDF_PAGES} pages can be read in one run.`, 'Choose a smaller page range.');
        selected = new Set(spec.pages);
      }
      const page = index + 1;
      if (!selected.has(page)) return;
      ctx.onProgress({ stage: 'processing', fraction: index / total, message: `Page ${page} of ${total}` });
      const canvas = await toCanvas(rendered.blob, { grayscale: false, autoContrast: false, upscale: false });
      results.push({ page, ...(await recognizeCanvas(canvas, ctx)) });
    });
    return { results, warnings };
  } finally {
    loadProgress = null;
  }
}

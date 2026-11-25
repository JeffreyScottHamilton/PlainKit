// Copies the Tesseract.js worker, its WebAssembly core and the English recognition model into
// public/ocr/, so Image to text loads everything from the same origin (the library's defaults are CDN URLs).
// The core's .wasm.js loader finds its .wasm next to it, so all files sit in one folder.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'lang'), { recursive: true });

const version = (pkg) => JSON.parse(readFileSync(nm(pkg, 'package.json'), 'utf8')).version;
const FILES = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  [nm('tesseract.js', 'dist', 'worker.min.js.LICENSE.txt'), join(out, 'worker.min.js.LICENSE.txt')],
  // SIMD build only: the loader picks this file; browsers without WebAssembly SIMD get an explicit unsupported state.
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), join(out, 'tesseract-core-simd-lstm.wasm.js')],
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm'), join(out, 'tesseract-core-simd-lstm.wasm')],
  // "best_int" English model (tessdata_best, integerized LSTM), gzip-compressed as the worker expects.
  [nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];
for (const [src, dst] of FILES) copyFileSync(src, dst);

writeFileSync(
  join(out, 'NOTICE.txt'),
  [
    `tesseract.js ${version('tesseract.js')} (worker, Apache-2.0), see worker.min.js.LICENSE.txt. Source: https://github.com/naptha/tesseract.js`,
    `tesseract.js-core ${version('tesseract.js-core')} (WebAssembly core, Apache-2.0). Source: https://github.com/naptha/tesseract.js-core`,
    `Tesseract OCR engine (Apache-2.0), Copyright Google and contributors. Source: https://github.com/tesseract-ocr/tesseract`,
    `English traineddata: tessdata_best 4.0.0 "best_int" (Apache-2.0), packaged as @tesseract.js-data/eng ${version('@tesseract.js-data/eng')} (MIT package). Source: https://github.com/tesseract-ocr/tessdata_best`,
    '',
  ].join('\n'),
);
console.log(`copy-ocr: tesseract.js ${version('tesseract.js')} -> public/ocr (${FILES.length} files)`);

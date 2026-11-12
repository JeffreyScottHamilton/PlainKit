// Copies the ONNX Runtime Web files Cutout loads at runtime into public/engines/ort/,
// so they are served same-origin (no CDN). Run before `vite build` and `vite`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'onnxruntime-web'); // its package.json is not in "exports"
const { version, license } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(root, 'public', 'engines', 'ort');
mkdirSync(out, { recursive: true });

// Single-threaded CPU path: the wasm-only ESM entry, its Emscripten glue, and the SIMD binary.
const FILES = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
for (const f of FILES) copyFileSync(join(pkgDir, 'dist', f), join(out, f));
// The npm package ships no LICENSE file; record the declared licence and its source.
writeFileSync(
  join(out, 'NOTICE.txt'),
  `onnxruntime-web ${version}, licence ${license}, Copyright (c) Microsoft Corporation.\nSource: https://github.com/microsoft/onnxruntime (MIT License).\n`,
);
console.log(`copy-ort: onnxruntime-web ${version} -> public/engines/ort (${FILES.length} files)`);

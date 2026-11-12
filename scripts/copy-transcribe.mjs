// Copies the ONNX Runtime Web files that @huggingface/transformers loads at runtime into
// public/engines/transformers/, so speech recognition runs from the same origin (its default
// is a jsdelivr CDN URL). Uses the copy of onnxruntime-web nested inside transformers, because
// the wasm glue must match the JavaScript it was built with.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nested = join(root, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web');
const pkgDir = existsSync(nested) ? nested : join(root, 'node_modules', 'onnxruntime-web');
const { version, license } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(root, 'public', 'engines', 'transformers');
mkdirSync(out, { recursive: true });

const FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
for (const f of FILES) copyFileSync(join(pkgDir, 'dist', f), join(out, f));
writeFileSync(
  join(out, 'NOTICE.txt'),
  `onnxruntime-web ${version} (as used by @huggingface/transformers, Apache-2.0), licence ${license}, Copyright (c) Microsoft Corporation.\nSource: https://github.com/microsoft/onnxruntime (MIT License).\n`,
);
console.log(`copy-transcribe: onnxruntime-web ${version} -> public/engines/transformers (${FILES.length} files)`);

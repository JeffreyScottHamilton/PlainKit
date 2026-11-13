// Copies the HEIC decoder (libheif, LGPL-3.0) into public/engines/libheif/ as a separate, unmodified file,
// so it is served same-origin, loaded only when a HEIC file is opened, and can be replaced by the site owner.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', 'libheif-js');
const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
const out = join(root, 'public', 'engines', 'libheif');
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, 'libheif-wasm', 'libheif-bundle.mjs'), join(out, 'libheif-bundle.mjs'));
copyFileSync(join(pkg, 'libheif-wasm', 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(
  join(out, 'NOTICE.txt'),
  `libheif-js ${version}: an unmodified WebAssembly build of libheif (https://github.com/strukturag/libheif), with libde265.\n` +
    `Licence: GNU Lesser General Public License v3.0 (see LICENSE in this folder).\n` +
    `Source: https://github.com/strukturag/libheif and https://github.com/catdad-experiments/libheif-js\n` +
    `This file is loaded separately at run time and is not combined with Plainkit's own code. You may replace it with your own build.\n`,
);
console.log(`copy-heif: libheif-js ${version} -> public/engines/libheif`);

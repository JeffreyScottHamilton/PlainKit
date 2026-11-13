# Release notes

## 0.2.0 — 2026-11-13 (not deployed)

Added
- Convert: HEIC/HEIF to JPEG, PNG, WebP; audio and video between the containers the browser can write; images to PDF and PDF pages to images; OBJ, STL and PLY meshes.
- Compress: video and audio re-encoding; PDF by lossless rewrite or by flattening pages to pictures.
- Redact: optional on-device face detection (YuNet).
- Subtitles: read text tracks stored in MKV/WebM; on-device English speech transcription (Whisper tiny).
- Audio stems: experimental four-stem separation (Spleeter), up to 5 minutes.
- Home shows recent tools. Benchmarks in `docs/benchmarks.md`.

Evidence: 506 unit tests; the browser suite on the production build in two passes (see the latest run in the session report). New AI features were each run with the real model in a browser, but only on synthetic inputs or one sample: a drawn face, generated tones, one 11-second speech clip, one HEIC photo.

New limitations
- Stem separation: about 1.9 GB peak browser memory on a 3-minute clip; expect failures on phones. Weights licence rests on the Spleeter paper's statement (see `docs/audits/stems-feasibility.md`).
- Transcription: English only, no punctuation guarantees, invents text on silence or music.
- Face detection misses small, turned or covered faces.
- Media conversion offers only what the browser can encode: no MP3 or FLAC output in Chromium.
- HEIC uses an LGPL-3.0 decoder; only the main picture is converted.
- The deployed site is about 160 MB because models are self-hosted.

## 0.1.0 — 2026-11-12 (not deployed)

First build with all 17 tool families present in one app.

**Evidence** (headless Chromium, Linux build container)
- 452 unit tests pass.
- 144 browser tests pass against the production build, 15 skipped (dev-only fixture or dev-server-only checks). Cutout's real-model test and one HLS test pass on the dev server.
- Accessibility audit: 50 of 50 checks, both themes, all routes.
- Network audit: 14 local flows, 0 external requests, 0 leaks of a marker planted in file names and content.
- Offline: shell after one visit; a tool after one use; every tool after "Save all tools for offline use".
- Initial JavaScript: 104 KB gzip / 91 KB brotli across 5 files (budget 250 KB). PDF, media and inference engines are not in the shell bundle.

**Measured on the build container only**: see `docs/benchmarks.md`. **Not measured**: memory use, first-load transfer on a real network, anything on a real phone.

**Known limitations**
- Tested in Chromium only. Safari and Firefox are unverified, and several features depend on newer APIs (WebCodecs, OffscreenCanvas, Screen Wake Lock, CompressionStream).
- ID photo presets were written from memory and not checked against official sources. The tool says so beside each preset.
- Cutout was only tested on synthetic shapes. Its erase/restore tools have no test.
- Send files was only tested between two tabs on one machine. No relay: some networks will not connect.
- Keep awake has not been observed holding a real lock.
- Video re-encoding and multi-segment HLS remux are built but untested.
- Keyboard controls for crop and comparison are implemented but not covered by tests (redaction is).
- No drag-and-drop page reordering in PDF (buttons only).
- CSV and received files are held in memory.

- The reference site's individual tools were not inspected; only its home page was read.
- Usage and cost telemetry was not available during the build, so no token or cost figures are reported.

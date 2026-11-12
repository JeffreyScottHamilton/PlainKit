# Feature matrix

Status: **planned** (not built) · **experimental** (built, unproven) · **working** (built, automated checks pass) · **verified** (also manually checked on real devices) · **unsupported**.

Source of scope: the written brief. The reference home page (jeffrey-hamilton-tools.vercel.app) was fetched on 2026-11-12 and lists 18 tools with one-line descriptions, matching the 17 families here plus CardTally (gift cards), which is excluded by decision. Each reference tool lives on its own separate host; those hosts were **not** opened, so no per-tool behaviour was observed and nothing below is claimed to match the originals. Two differences from the reference descriptions are deliberate: stem separation ("vocals, drums, bass and the rest") and extracting subtitles from a video are not offered here because neither is verified.

Nothing is "verified" yet: all evidence is automated tests in headless Chromium on a Linux container. No real phone or other browser has been tested.

| Tool | Capability | Status | Evidence |
|---|---|---|---|
| Shell | 17-tool flat nav, routes, back/forward, search by old name, Ctrl+K, theme, favorites, mobile drawer, session tray, clear session | working | `e2e/shell.spec.ts` (9) |
| Compress | JPEG/PNG/WebP by quality | working | `e2e/image.spec.ts`: output magic bytes, dimensions, smaller size |
| Compress | Target size (bounded search, reports when unreachable) | working | `e2e/image.spec.ts`, `src/engines/image/search.test.ts` |
| Compress | Cancel and retry; original bytes unchanged (SHA-256) | working | `e2e/image.spec.ts` |
| Compress | Audio, video, PDF | planned | — |
| Convert | JPEG/PNG/WebP/GIF(first frame)/BMP/AVIF(decode-dependent) → JPEG/PNG/WebP | working | `e2e/image.spec.ts`, `matrix.test.ts`; GIF/BMP/AVIF inputs not yet covered by e2e |
| Convert | In-memory handoff from Compress (no download) | working | `e2e/image.spec.ts` |
| Convert | Audio, video, document, 3D | planned | — |
| Cutout | Local background removal (U²-Net-p), threshold/feather, erase/restore, transparent PNG | experimental | 18 unit tests; e2e runs the real model: PNG with real alpha, same-origin requests only, offline second run, cancel and retry. **Only tested on synthetic shapes, not real photos; refinement tools not exercised by any test** |
| Dev tools | 40 utilities | working | 197 unit tests in `src/tools/dev-tools/logic`; `e2e/dev-tools.spec.ts` (43): every utility renders and loads its example without page errors; Markdown sanitised; regex time limit checked in browser by the agent only |
| Metadata | Inspect EXIF/GPS/IPTC/XMP; lossless removal for JPEG, PNG, WebP; output re-checked two ways | working | 20 unit tests on built fixtures (pixel data byte-identical); e2e confirms GPS and EXIF/XMP absent in the download with exifr and a segment walk. Bytes appended after a JPEG's end marker are not removed |
| Clean links | Tracker removal, signed-link guard, per-parameter restore | working | 15 unit tests; `e2e/small-tools.spec.ts`. Signed-link detection is by parameter name and can false-positive on short names |
| Send files | Manual pairing by invite/reply code, comparison number, explicit accept, chunked transfer with integrity check, cancel | experimental | 21 unit tests; e2e transfers 300 KB between two tabs on one machine and matches SHA-256, plus decline and bad-code cases. **Not tested across two real devices or networks.** STUN mode, expiry, mid-transfer cancel and connection loss have no test |
| Redact | Rectangles by pointer, keyboard or numbers; solid and pixelate; flattened export; undo/redo | working | 13 unit tests; e2e decodes the PNG and checks every sampled pixel in the region |
| Redact | Blur export | experimental | built, not exercised by any test |
| Redact | Face detection | planned | needs a model |
| PDF | Merge, keyboard reorder, rotate, remove, extract, undo/redo; pages copied not rasterised; export re-verified | working | 34 unit tests (mixed sizes, pre-rotated, blank, 20-page, corrupt, encrypted); `e2e/pdf.spec.ts` reloads the download and checks page order and rotation. No drag-and-drop reorder; thumbnails not visually checked |
| Audio stems | Audio extraction to 16-bit WAV, sample rate, mono, trim | working | unit tests on the WAV encoder; e2e parses the downloaded WAV header and samples. Only tested with a WAV source, not with a real video file. No memory or runtime benchmark |
| Audio stems | Stem separation | planned | needs a verified licensed model |
| Subtitles | SRT/VTT parse, edit, shift, validate, convert, undo/redo | working | unit tests in `src/engines/subtitles`; e2e reads the exported VTT and checks the shifted time. UTF-8 files only |
| Subtitles | Embedded-track extraction, transcription, burned-in text | planned | — |
| QR code | Text/URL, Wi-Fi, vCard; PNG/SVG; colors, margin, logo; read-back check | working | 14 unit tests (jsQR round trip); e2e decodes the downloaded PNG in Node. SVG export omits the logo |
| CSV | Encoding/delimiter settings, trim, dedupe (exact or normalised), rename/reorder/split, find/replace, undo/redo, CSV/TSV/JSON export, opt-in formula protection | working | unit tests in `src/engines/csv` (57 with subtitles); e2e re-parses the download in Node. Whole file in memory; export is always UTF-8 |
| ID photo | 10 presets, crop with guides, exact-size JPEG, printable PDF sheet | experimental | geometry unit tests; e2e checks 413×531 px at 300 DPI and the sheet page size. **Preset rules were written from memory and not re-checked against official sources** (shown in the tool); source links unverified; head-height guide is a scale, not a position |
| Clean text | Invisible character report and configurable cleanup | working | 17 unit tests (emoji ZWJ, Persian ZWNJ, RTL marks preserved by default); e2e |
| Video | Local trim to MP4/WebM by stream copy (cuts land on keyframes), duration re-verified, cancel | working | 26 unit tests; e2e trims a generated WebM, re-opens the download at 2.00 s, and records zero external requests |
| Video | Trim by re-encoding | experimental | implemented, not exercised by any browser test |
| Video | Save a direct media link (CORS permitting) | working | e2e with routed responses, including the CORS-blocked message |
| Video | HLS VOD: remux MPEG-TS to MP4, or joined .ts fallback; live, encrypted, byte-range and fMP4 refused | experimental | e2e on one real single-segment H.264 stream; multi-segment remux untested |
| Video | Platform pages, DRM | unsupported | refused with a message |
| Keep awake | Screen Wake Lock, timer, stop key, re-acquire on return | experimental | 17 unit tests with a fake wake lock; e2e accepts Active or a clear error, so a real lock has not been observed in headless Chromium |

## Known gaps on working features
- Image size cap (100 MP / 16384 px) is enforced after decode, not from the header.
- Alpha detection samples the image; a very small transparent area can be missed.
- No accessibility scan (axe), contrast measurement, or non-Chromium run yet.

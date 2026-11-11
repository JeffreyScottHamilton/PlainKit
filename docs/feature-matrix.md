# Feature matrix

Status: **planned** (not built) · **experimental** (built, unproven) · **working** (built, automated checks pass) · **verified** (also manually checked on real devices) · **unsupported**.

Source of scope: the written brief. The reference site (jeffrey-hamilton-tools.vercel.app) could not be reached from the build container, so **no reference behaviour was observed**; nothing below is claimed to match it.

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
| Cutout | Background removal | planned | needs model host access |
| Dev tools | 40 utilities | working | 197 unit tests in `src/tools/dev-tools/logic`; `e2e/dev-tools.spec.ts` (43): every utility renders and loads its example without page errors; Markdown sanitised; regex time limit checked in browser by the agent only |
| Metadata | Inspect / remove EXIF, GPS | planned | — |
| Clean links | Tracker removal, signed-link guard, per-parameter restore | working | 15 unit tests; `e2e/small-tools.spec.ts`. Signed-link detection is by parameter name and can false-positive on short names |
| Send files | WebRTC transfer, manual pairing | planned | — |
| Redact | Solid / pixelate / blur | planned | — |
| PDF | Merge, keyboard reorder, rotate, remove, extract, undo/redo; pages copied not rasterised; export re-verified | working | 34 unit tests (mixed sizes, pre-rotated, blank, 20-page, corrupt, encrypted); `e2e/pdf.spec.ts` reloads the download and checks page order and rotation. No drag-and-drop reorder; thumbnails not visually checked |
| Audio stems | Audio extraction | planned | — |
| Audio stems | Stem separation | planned | needs a verified licensed model |
| Subtitles | SRT/VTT edit, shift, convert | planned | — |
| QR code | Text/URL, Wi-Fi, vCard; PNG/SVG; colors, margin, logo; read-back check | working | 14 unit tests (jsQR round trip); e2e decodes the downloaded PNG in Node. SVG export omits the logo |
| CSV | Clean, dedupe, export | planned | — |
| ID photo | Presets, guides, print sheet | planned | — |
| Clean text | Invisible character report and configurable cleanup | working | 17 unit tests (emoji ZWJ, Persian ZWNJ, RTL marks preserved by default); e2e |
| Video | Local trim; direct link / HLS | planned | — |
| Keep awake | Screen Wake Lock, timer, stop key, re-acquire on return | experimental | 17 unit tests with a fake wake lock; e2e accepts Active or a clear error, so a real lock has not been observed in headless Chromium |

## Known gaps on working features
- Image size cap (100 MP / 16384 px) is enforced after decode, not from the header.
- Alpha detection samples the image; a very small transparent area can be missed.
- No accessibility scan (axe), contrast measurement, or non-Chromium run yet.

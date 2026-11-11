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
| Dev tools | 40 utilities | planned | in progress |
| Metadata | Inspect / remove EXIF, GPS | planned | — |
| Clean links | Tracker removal | planned | — |
| Send files | WebRTC transfer, manual pairing | planned | — |
| Redact | Solid / pixelate / blur | planned | — |
| PDF | Merge, reorder, rotate, remove, extract | planned | — |
| Audio stems | Audio extraction | planned | — |
| Audio stems | Stem separation | planned | needs a verified licensed model |
| Subtitles | SRT/VTT edit, shift, convert | planned | — |
| QR code | PNG/SVG, colors, logo | planned | — |
| CSV | Clean, dedupe, export | planned | — |
| ID photo | Presets, guides, print sheet | planned | — |
| Clean text | Invisible characters | planned | — |
| Video | Local trim; direct link / HLS | planned | — |
| Keep awake | Screen Wake Lock | planned | — |

## Known gaps on working features
- Image size cap (100 MP / 16384 px) is enforced after decode, not from the header.
- Alpha detection samples the image; a very small transparent area can be missed.
- No accessibility scan (axe), contrast measurement, or non-Chromium run yet.

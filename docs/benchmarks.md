# Benchmarks

2026-11-12 · headless Chromium (Playwright 1.63) · Linux build container, 4 vCPU Intel Xeon 2.10 GHz, 15 GB RAM · production build · `PK_BENCH=1 npx playwright test e2e/bench.spec.ts --workers=1`

Times are wall-clock from the click to the visible result, so they include UI and test-harness overhead. "Cold" is the first run after page load (engine chunk and worker fetched); "warm" is a second run after a reload. Fixtures are generated in the test, not real photographs or documents. This is a server-class CPU: **a phone will be slower, and no phone was measured.**

| Fixture | Size | Action | Cold | Warm |
|---|---|---|---|---|
| Generated JPEG, 4000×3000, quality 90 | 5.0 MB | Compress, quality mode, defaults | 0.7–2.7 s | 0.6–1.2 s |
| Generated transparent PNG, 1500×1500 | 15 KB | Convert to WebP | 1.0 s | 1.0 s |
| Generated 20-page PDF, three page sizes, text only | 11 KB | Export (copy pages + verify) | 0.2–0.4 s | 0.1–0.2 s |
| Generated CSV, 5,000 rows, quoted commas, newlines, quotes, CJK | 288 KB | Import, parse, preview | 0.2 s | 0.1–0.2 s |
| Synthetic 640×480 image | — | Cutout, including 19 MB model + engine download from localhost | 3.4 s | 2.5–3.1 s |

Ranges are the spread across the three runs made; variance is high and three runs is not a statistical sample.

**Not measured**: peak memory, video trim, audio extraction, real photographs, large real PDFs, any phone or low-end device, first-load transfer over a real network. No performance budget is set from these numbers yet.

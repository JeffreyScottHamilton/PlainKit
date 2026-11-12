# Network-boundary audit

2026-11-12 · headless Chromium (Playwright 1.63) · production build served by `vite preview`, with its Content-Security-Policy and service worker · `npx playwright test e2e/network.spec.ts e2e/offline.spec.ts e2e/cutout.spec.ts`

Method: record every request from the page, its workers and the service worker, from page load to the end of a real transform. Input filenames and text carry the marker `PKMARKER7731`. Assert that every request is same-origin and that the marker (plain, hex or Base64) never appears in a URL, query string or request body.

| Flow | Requests | External | Marker hits |
|---|---|---|---|
| Compress, Convert, Metadata, Redact, PDF, CSV, QR code, Clean links, Clean text, Subtitles, ID photo, Audio extraction, Dev tools (hash, Base64) | 23–31 each | 0 | 0 |
| Cutout (real model; dev server run) | same-origin only | 0 | 0 |
| Video local trim (dev server run) | same-origin only | 0 | not marker-tested |

Offline (production build):
- The shell reloads offline after one visit.
- A tool that has been used once works offline after a reload, including its worker (tested with Compress).
- A tool never opened shows an error with "Reload tool" when offline; after "Save all tools for offline use" in Settings it opens offline (tested with PDF and Dev tools).
- Cutout processed a second image with the network off using the model already in memory (dev server run).
- No Content-Security-Policy violation was logged on home or during a Compress run.

**Not audited**: Send files and Video "Save from a link" (they use the network by design), Keep awake, Cutout and Video on the production build, real hosting on Vercel, browsers other than Chromium. `connect-src` allows `https:` for the Video tool, so the policy alone does not prove local tools stay local: this audit is the evidence.

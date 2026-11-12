# Plainkit

Free, local-first browser tools in one app: 17 tool families, no account, no ads, no analytics. Files are processed in your browser. "Plainkit" is a working name and has not been cleared for use.

## Run it

```bash
npm install
npm run dev        # development server
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build on http://localhost:4173
npm test           # unit tests (Vitest)
npm run e2e        # browser tests (Playwright, against the production build)
```

Node 22. Some browser tests use a dev-only fixture: run them with `npx vite --port 5190` and `PK_BASE_URL=http://localhost:5190 npx playwright test`.

## Host it

It is a static site: any static host works. `vercel.json` is included (Vite build, single-page rewrite, basic headers). Connect the repository in Vercel and deploy; no environment variables or server functions are needed. A deploy on Vercel has not been tested from this repository yet.

Bandwidth: the app shell is about 100 KB of JavaScript (gzipped). Cutout downloads a 4.6 MB model and a 14.8 MB engine the first time it is used. Free hosting tiers have bandwidth limits and may restrict commercial use.

## What works

See [`docs/feature-matrix.md`](docs/feature-matrix.md) for every capability, its status and the evidence. Short version:

- **Working** (automated checks on exported files): Compress, Convert, Dev tools (40), Metadata, Clean links, Redact (solid, pixelate), PDF, Subtitles, QR code, CSV, Clean text, Video (local trim, direct links), Audio extraction.
- **Experimental** (built, with a stated gap): Cutout, Send files, ID photo, Keep awake, Redact blur, Video re-encode and HLS.
- **Not offered**: stem separation, speech transcription, face detection, subtitle extraction from video, audio/video/document/3D conversion, PDF compression, platform video pages, DRM.

Everything was tested in headless Chromium only. No real phone, Safari or Firefox run has been done.

## Privacy

Local tools make no request to any other host: see [`docs/audits/network.md`](docs/audits/network.md). Two tools use the network by design and say so: Send files (connects to the other device) and Video's "Save from a link" (contacts the site in the link). Your host still receives ordinary page and asset requests. Details: [`docs/network-boundaries.md`](docs/network-boundaries.md).

## More

[`docs/release-notes.md`](docs/release-notes.md) · [`docs/licenses.md`](docs/licenses.md) · [`docs/models.md`](docs/models.md) · [`docs/audits/a11y.md`](docs/audits/a11y.md) · [`docs/decisions.md`](docs/decisions.md) · [`docs/skills-manifest.md`](docs/skills-manifest.md)

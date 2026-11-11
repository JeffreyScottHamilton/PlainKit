---
name: plainkit-privacy-network
description: Privacy modes and network-boundary verification for Plainkit. Use when adding any fetch/WebSocket/WebRTC/service-worker code, writing privacy copy, setting CSP, or auditing a tool's network behavior.
metadata: {origin: project-authored, revision: 1}
---
# Privacy and network boundaries (project-authored)

## Modes (must match real behavior)
- **On this device** — no file bytes, text, filenames, previews, or derived content leave the browser.
- **Connects to another device** — WebRTC; signaling/STUN see connection metadata; TURN relays encrypted bytes through a server.
- **Needs network access** — contacts a host the user named (e.g. a direct media URL).
Hosting always sees ordinary page/asset requests. Never write "nothing ever leaves your device".

## Rules
- Every network call is declared in `src/privacy/` and listed in `docs/network-boundaries.md`. Undeclared call = bug.
- No hidden fallback uploads, no undisclosed proxy, no remote inference, no analytics/beacons/remote scripts/CDN runtime deps. Engine and model assets are same-origin by default.
- Clean links never fetches the URL. QR never calls a QR API.
- Keep user content out of error reports, logs, URLs, and fixtures.
- CSP: `default-src 'self'`; allow `blob:`/`data:` only where needed; `wasm-unsafe-eval` only if WASM is used; `connect-src` widened only for network-mode tools and documented. Test CSP together with workers, WASM, PWA, and cross-origin isolation.
- Service worker caches shell/engine/model assets by explicit list — never a broad rule that could capture user files.

## Audit method (per local-only tool)
With Playwright, record all requests, WebSockets, beacons, worker and service-worker traffic while processing a fixture, cold then warm. Assert: zero non-same-origin requests; no fixture bytes, filename, or text marker in any URL, query, or body. Then repeat warm with the context offline. A grep for `fetch` is not an audit. Record results in `docs/network-boundaries.md`.

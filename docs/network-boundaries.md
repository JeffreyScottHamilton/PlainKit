# Network boundaries

What the app is designed to contact. "Audited" means a recorded browser network trace during a real transform; until then a row is a design statement, not proof.

| Tool | Mode | Contacts | Sends user content? | Audited |
|---|---|---|---|---|
| Shell and 13 local tools (Compress, Convert, Metadata, Redact, PDF, CSV, QR code, Clean links, Clean text, Subtitles, ID photo, Audio extraction, Dev tools) | On this device | Own origin for page and assets only | No | Yes: `docs/audits/network.md`, 0 external requests, 0 marker hits |
| Keep awake | On this device | Own origin only | No | No |
| Cutout | On this device | Own origin only: model (4.6 MB) and ONNX runtime (14.8 MB) are self-hosted | No | e2e: all requests same-origin, marker absent, second image processed offline |
| Subtitles (transcription), Redact (face detection), Audio stems (separation) | — | Not built; no model evaluated | — | — |
| Send files | Connects to another device | The other device; a public STUN server only if the user turns it on (sees IP addresses, not files). Manual pairing: no signalling server. No TURN relay. | File bytes go to the paired device only | No (tested between two tabs only) |
| Video: local trim | On this device | Own origin only | No | e2e: 0 external requests |
| Video: save from a link | Needs network access | The host in the URL the user pastes, directly from the browser. No proxy. | The URL request itself | By design |

- The host (Vercel) receives ordinary page and asset requests, like any website.
- No analytics, remote fonts, CDNs or third-party scripts.
- Production CSP is in `vite.config.ts`. `connect-src` allows `https:` for the Video tool, so CSP alone does not prove local tools stay local; the network audit does.
- Session files live in tab memory only. "Clear session" releases references; it is not forensic erasure. Sessions are tab-scoped.

## Caches and lifecycle
- **Service worker** (`plainkit-app-<version>`): the app's own static files only. Shell on install; tool files the first time they load, or all at once from Settings. Never user files, models or the ONNX wasm. Old versions are deleted when a new one activates. A new version waits until the user clicks "Reload to update", which is disabled while jobs run.
- **Model cache** (`plainkit-model-u2netp-v1`): only if the user ticks "Keep the model on this device" in Cutout. Deleted from Cutout or Settings. Quota errors fall back to memory-only with a warning.
- **Preferences** (`localStorage` key `plainkit:prefs`): theme, favourites, recent tools. No file names or content.
- **Session**: tab memory only. "Clear session" does not touch either cache.

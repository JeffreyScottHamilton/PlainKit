# Network boundaries

What the app is designed to contact. "Audited" means a recorded browser network trace during a real transform; until then a row is a design statement, not proof.

| Tool | Mode | Contacts | Sends user content? | Audited |
|---|---|---|---|---|
| Shell, Compress, Convert | On this device | Own origin for page and assets only | No | Not yet |
| All other local tools | On this device | Own origin only | No | Not built |
| Cutout, Subtitles (transcription), Redact (face detection) | On this device | One-time model download; host to be decided (self-hosted preferred) | No (download only) | Not built |
| Send files | Connects to another device | The other device; a public STUN server if enabled (sees IP addresses, not files). Manual pairing: no signalling server. No TURN relay. | File bytes go to the paired device only | Not built |
| Video (link download) | Needs network access | The host in the URL the user pastes | The URL request itself | Not built |

- The host (Vercel) receives ordinary page and asset requests, like any website.
- No analytics, remote fonts, CDNs or third-party scripts.
- Production CSP is in `vite.config.ts`. `connect-src` allows `https:` for the Video tool, so CSP alone does not prove local tools stay local; the network audit does.
- Session files live in tab memory only. "Clear session" releases references; it is not forensic erasure. Sessions are tab-scoped.

# Independent review

2026-11-13 · read-only review of the whole codebase by a separate agent with no prior context, focused on the privacy boundary, unsafe rendering, engine bugs, UI claims and accessibility of the newer panels. No tests were run by the reviewer.

## Found and fixed

| Severity | Finding | Fix | Regression test |
|---|---|---|---|
| Medium | **Redact blur leaked the original on transparent images**: the blur was drawn over the untouched original, so partly transparent pictures (text on a transparent background) still showed it sharply. | The region is cleared (and filled for JPEG) before the blur is drawn. | `e2e/metadata-redact.spec.ts` (transparent image) |
| Medium | The service worker answered every navigation with the app shell, so licence links such as `/models/u2netp/LICENSE` showed the app instead of the licence. | Real files (`/assets`, `/models`, `/engines`, anything with an extension) are served as themselves. | `e2e/offline.spec.ts` |
| Medium | Licence links in the stem and transcription panels opened in the same tab, which would discard the session. | Open in a new tab. | — |
| Medium | An HLS playlist could send requests to hosts other than the one shown to the user. | Every host is listed before download; credentials in playlist links are refused; a chosen quality may not pull segments from a host that was not shown. | `hls.test.ts` |
| Low | A PLY header could claim billions of vertices and exhaust memory; triangle limits were checked only after parsing. | Counts are checked against the data size, and limits during parsing. | `mesh.test.ts` |
| Low | Live-recorded WebM/MKV (clusters without a stored size): only the first cluster's subtitles were read. | Such clusters are walked in place. | `mkv.test.ts` |
| Low | The job queue could stall if a heavy job was cancelled at the instant it started. | The slot is released on that path. | — |
| Low | Convert claimed to accept SVG and then refused it. | Removed from the accepted types. | — |
| Low | "Verified" wording overstated mesh and media checks; a 0% change rendered as "−0%". | Wording says what is checked; sign fixed. | — |
| Low | A code comment said the security policy limited connections to the site itself. | Comment corrected: it allows any https host because of the Video link tool. | — |

## Not fixed
- The streamed model download and cache code is duplicated across Cutout, face detection, stems and transcription. It works; merging it is cleanup.
- The security policy still allows `https:` connections app-wide. Tightening it per tool would need separate pages or a server-set header.

## Checked and found clean
No off-origin request, remote import or CDN reference in the app's own code. One `dangerouslySetInnerHTML` (Markdown preview), fed only by a sanitiser that fails closed. No `eval`, `new Function` or `innerHTML`. Pasted URLs are shown as text. Send files validates control messages, file names and sizes. CSV formula protection and its re-read check are real. Session clear, queue cancel and worker transfers behave as documented.

## Not reviewed
Accessibility of the newer panels beyond two of them, ID photo geometry, the Cutout/face/stems/HEIC pipelines, object-URL leaks in depth, and the built `dist/` for stray remote references.

## Found later by looking at real inputs (2026-11-13)

Automated tests had passed over all of these, because they checked exported files and not what the screen showed.

| Finding | Fix |
|---|---|
| **Redact did not show the photo** in its editing area: only the boxes were drawn. | The photo is painted once the canvas exists; a test now reads a pixel from it. |
| **Cutout showed the original underneath the result**, so a removed background looked untouched until the divider was moved. | The original is clipped to the left of the divider; a test checks it. |
| ID photo's export buttons were below the visible area. | Moved above the preview. |
| HEIC thumbnails showed a broken-image icon in Chromium. | Thumbnails fall back to a file icon. |
| In Subtitles, an open file's editor was pushed below two optional sections. | The optional sections moved below the editor. |

| Compress offered "M4A (AAC)" and wrote Opus audio into the file when the browser had no AAC encoder. | Formats whose name promises a codec are offered only when that codec can be written. |
| QR code's first setting had no visible label; Keep awake said "released by the system" for a request that was refused; 3D results showed a meaningless size change. | Label added; wording fixed; line removed. |

Twenty tools and panels were looked at on desktop and eight at phone width (no overflow found). Earlier note: twelve tools were looked at in a loaded state with real or realistic inputs. Still not looked at: most of the 40 dev utilities individually, the Documents panel, light theme beyond home, and tablet widths.

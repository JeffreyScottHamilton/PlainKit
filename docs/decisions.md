# Decisions

1. **Stack**: React 19 + TypeScript + Vite, react-router, plain CSS with tokens. No state library: a 20-line external store.
2. **Worker model**: one worker per job, terminate to cancel. Revisit if startup cost is measurable.
3. **Tool state**: `useToolState` keeps per-tool UI state in memory across routes; cleared with the session.
4. **Handoff**: `sendTo(toolId, assetIds)` links existing in-memory assets as another tool's inputs. No download round trip.
5. **CSP**: production-only meta tag. `connect-src` allows `https:` because the Video tool fetches user-supplied media URLs; local tools are verified by network audit rather than by CSP alone.
6. **Third-party skills**: only reviewed `SKILL.md` files, pinned in `docs/skills-manifest.md`.
7. **Reference site**: not reachable from the build container (network policy). Feature scope comes from the written brief and is marked "from brief" in the feature matrix.
8. **Hosting**: static build, host-agnostic. Vercel is the intended host (`vercel.json`: SPA rewrite + basic headers). No serverless functions. Cross-origin isolation headers (COOP/COEP) are not set until a multithreaded WASM engine is actually adopted and tested with them.
9. **Send files signalling**: manual pairing (copy/paste or QR of the offer/answer) so no signalling server is required on a static host.
10. **Concurrency**: two implementer agents at a time. Six at once exhausted the account's 5-hour usage limit on 2026-11-11.
11. **HEIC needs an LGPL library.** Every browser HEIC decoder is libheif (LGPL-3.0); there is no permissive alternative. It is used unmodified as a separate file that is not bundled into the app's own code, with its licence text and source links shipped beside it, which is the usual way to meet LGPL terms for a library. HEVC, the codec inside HEIC, is also covered by patents in some countries. This was adopted on the owner's request for HEIC support (2026-11-13); removing `scripts/copy-heif.mjs` and the `image/heic` rows turns it off.
12. **Model-heavy browser tests run in a second pass with one worker** (`npm run e2e`), because they time out when competing for CPU.

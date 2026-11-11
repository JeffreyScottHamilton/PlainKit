---
name: plainkit-architecture
description: Plainkit product architecture, typed tool registry, module boundaries, and engine/job contracts. Use when adding or changing a tool, route, registry entry, engine, or shared module.
metadata: {origin: project-authored, revision: 1}
---
# Plainkit architecture (project-authored)

One static React + TypeScript + Vite app, one origin, persistent shell, internal routes `/tools/<id>`. No iframes, no outbound tool links, no accounts/analytics/third-party fonts. Gift Cards/CardTally is permanently out of scope.

## Registry is the source of truth
Sidebar, search, routing metadata, handoff compatibility, formats, and privacy labels all derive from `src/registry/`. Exactly 17 entries, in this order:
compress, convert, cutout, dev-tools, metadata, clean-links, send-files, redact, pdf, audio-stems, subtitles, qr-code, csv, id-photo, clean-text, video, keep-awake.

Each entry: `id`, plain `name`, `aliases` (old reference names, hidden search only), `category` (internal, never accordion UI), `accepts`/`produces` formats, lazy `load()`, `capabilities` required, `network` mode (`on-device` | `peer` | `network`), `assetDownloadBytes`, `maturity` (`planned|experimental|working|verified|unsupported`), `limitations[]`.

## Module boundaries
`src/app` shell/router · `components` shared primitives · `tools/<id>` UI per family · `engines` pure transforms · `workers` typed entry points · `session` assets/ownership · `jobs` queue/cancel/progress · `capabilities` runtime checks · `privacy` network declarations · `registry`.
- UI never contains transform logic; a tool never imports another tool's screen to reuse an engine.
- Strict TypeScript; no untyped worker messages; brand strings centralized in one module.
- Share an abstraction only after a second real use.

## Contracts
See [contracts.md](contracts.md) for `SessionAsset`, `JobProgress`, `ToolResult`, the engine signature, and the file-tool state list. Read it before touching `session/`, `jobs/`, or any engine.

## Rules
- Shell must not eagerly import PDF/media/inference engines; every tool is a lazy chunk. Initial JS budget: 250KB compressed (provisional).
- Outputs get explicit suffixes (`photo-compressed.webp`); originals are never mutated.
- Unsupported modes are shown as unsupported, never as working-looking buttons.

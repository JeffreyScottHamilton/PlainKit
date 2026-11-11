---
name: plainkit-licensing
description: Dependency, font, icon, and model-weight licensing and supply-chain review for Plainkit. Use before adding any npm package, font, icon set, WASM binary, or model, and when updating docs/licenses.md.
metadata: {origin: project-authored, revision: 1}
---
# Licensing and supply chain (project-authored)

Before adding anything, record in `docs/licenses.md`: name, exact version (lockfile-pinned), license (SPDX), source URL/revision, maintenance status (last release, open advisories via `npm audit`), bundled binaries/WASM, required notices.

- Default-allowed: MIT, BSD, ISC, Apache-2.0, Zlib, OFL (fonts), CC0. MPL-2.0: allowed unmodified, note it.
- Stop and escalate to the manager: GPL/LGPL/AGPL, dual commercial licenses, "non-commercial"/research-only weights, unclear or missing license, custom terms. These are a project decision, never a silent swap.
- Model weights are licensed separately from their code; check redistribution before self-hosting under `public/models/`.
- ffmpeg.wasm cores carry (L)GPL obligations depending on build — review the specific core.
- Fonts and icons: self-hosted, one family each, license file shipped.
- Supply chain: prefer few, maintained, widely used packages; check install scripts (`npm view <pkg> scripts`); no runtime CDN loads; commit the lockfile; run `npm audit` at milestones and report unfixed findings honestly.
- Reference sites are for behavior only: no copied code, artwork, or branding. The name "Plainkit" is provisional and not legally cleared.

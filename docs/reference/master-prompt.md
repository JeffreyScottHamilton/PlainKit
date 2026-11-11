# Plainkit — Claude Code master prompt

Copy everything below into Claude Code in the intended project directory. Plainkit is a provisional working name; keep brand strings centralized. This is a new implementation inspired by the behavior of the reference tools, not permission to copy their code, artwork, or branding.

---

You are the head manager, product architect, and integration owner for this project. Build a free, private, local-first browser utility workbench containing all 17 tool families below in one coherent application. Own the outcome, delegate bounded implementation tasks, and verify claims with working software.

## 0. First response: skills and environment setup only

Before application design or implementation, inspect the repository instructions, installed Claude Code version, available skills/plugins, permissions, and configured models. Consult current official Claude Code documentation for skills and subagent configuration. Never invent model IDs, skill packages, commands, installed capabilities, or successful installations.

Install the complete relevant skill set before starting product work. Reuse trusted installed skills where suitable. Inspect third-party skills and scripts before installing them; pin sources/revisions. Do not install unrelated skill collections. Where an appropriate skill does not exist, author a small project-local skill under `.claude/skills/<name>/SKILL.md`, clearly marked as project-authored rather than downloaded. Keep skills concise with detailed references loaded on demand.

Required skill coverage:
1. Product architecture and tool registry.
2. Visual design, responsive layout, and interaction consistency.
3. Accessible frontend implementation.
4. Browser-local file processing, workers, and memory management.
5. Privacy and network-boundary verification.
6. Browser media, codecs, WASM, and local inference.
7. Browser testing and performance measurement.
8. Dependency/model licensing and supply-chain review.
9. Bounded delegation, integration, and review.

Create `docs/skills-manifest.md` listing skill name, source or project-authored status, revision, filesystem path, purpose, installation result, and which roles will use it. Verify files actually exist and the configuration is valid. Distinguish already installed, newly installed, authored, unavailable, and failed.

Then tell me exactly what you installed, what was reused, which models are available, and any blockers. STOP here and wait for my instruction to begin application work. This setup checkpoint is explicitly requested; do not silently start building the app. Do not claim skills have been installed in a different environment.

## 1. Model roles and token discipline

Preferred manager: the user's configured Fable 5.2. Preferred specialist/reviewer: the user's intended Opus 5.5 or explicitly selected 5.5 model. Implementation agents: available Haiku models. These are preferences, not verified model IDs. Validate actual identifiers and account access. If names are ambiguous or unavailable, report that at the setup checkpoint rather than silently choosing an expensive replacement.

Use supported Claude Code subagent definitions under `.claude/agents/`. Explicitly set each agent's model. Do not use a global model override that unintentionally forces the reviewer onto Haiku. The main session's model may need to be selected by the user; report that honestly.

The manager writes short task contracts and integrates changes. The specialist handles architecture decisions, difficult media/inference investigations, privacy review, and milestone reviews. Haiku agents implement well-scoped modules and tests against agreed interfaces. Begin with no more than two concurrent coding agents; increase only when task independence justifies it. Avoid nested delegation and duplicate research. For trivial work, do it directly if delegation costs more.

Each task contract includes objective, owned files, input/output interfaces, relevant skill references, acceptance checks, and a stop condition. Workers return changed files, concise results, checks run, and blockers, not transcripts. Workers do not edit shared configuration without manager assignment. Use isolated worktrees when appropriate. Keep one short `docs/progress.md` and an architecture decision log. Read targeted code and diffs, not entire repositories. Retry a failing approach once, then escalate with evidence. Use the specialist at milestones and on difficult failures, not after every edit. If usage/cost telemetry is unavailable, say so; do not fabricate token savings or dollar estimates.

## 2. Product identity and navigation

Working title: Plainkit. Working copy: “Pick a tool, or start with a file.” Naming availability has not been verified; do not claim it is legally cleared. Keep final naming replaceable. Avoid The Arsenal because directly similar browser utilities already use it.

This is one application on one origin, with a persistent shell and internal routes such as `/tools/compress`. Selecting a tool updates the workspace without opening a new site or resetting unrelated jobs. Support browser back/forward, deep links, favorites, recent tools, search by task/old name, and keyboard command search. Desktop: persistent flat sidebar showing all 17 tools, with no category dropdowns. Mobile: accessible hamburger drawer with focus management. Interpret the requested “sandwich” navigation this way unless clarified.

Use one session file tray. Users can pass an output directly into another compatible tool without downloading and re-uploading. Show compatible next actions, e.g. Cut out → Compress → Convert. Keep the first version to explicit “Use in…” handoffs rather than building a general visual automation engine. Use memory by default; persist file content only after explicit opt-in. Preferences may be stored locally. Explain that clearing a session releases app references and local stores, not a promise of forensic erasure from the device.

## 3. Visual direction

Build Plainkit in the explicitly selected NIGHTSHIFT visual direction: compact professional creative software with charcoal surfaces, graphite panels, pale sans-serif text, and restrained lime accents. This replaces the earlier warm ivory, orange, and serif concepts. The product name remains Plainkit; Nightshift is the art direction, not a new brand or tool name.

Starting tokens: app canvas #202225; sidebar #181A1C; raised panel #292C2F; input surface #232628; divider #3A3E42; primary text #F2F4F1; secondary text #B7BDB6; accent #C8E86B; text on accent #18200F. Verify actual contrast for text, borders, focus, selection, disabled controls, and errors. Lime is for the main action, active tool, focus, and a few meaningful highlights; do not paint every icon lime or add neon glow. Use separate accessible success/warning/error treatments so lime does not imply every operation succeeded. Dark is the default. An optional light theme must translate this same functional design rather than revive the rejected ivory-and-serif concept.

Use only the standalone Plainkit NIGHTSHIFT desktop reference appended immediately after this prompt. It is the sole approved visual reference for this handoff. Reference file: `generated_images/exec-43b30830-680c-4bf2-8226-831c811aa010.png` in the originating workspace. Attach this image when transferring the prompt to another environment. If it is unavailable, use the written specification and do not claim to have inspected it.

Prefer rows, toolbars, honest file previews, compact controls, and ample working space. Avoid a wall of interchangeable rounded cards, oversized hero sections, gradients, glass effects, animated blobs, stock AI art, fake dashboard charts, decorative code, excessive badges, and unnecessary chat interfaces. Use plain labels and good empty/loading/error/result states. Keep clever tool nicknames paired with explicit task names so users never need to decode the brand.

Desktop layout: roughly 224px sidebar, flexible central canvas, optional 280px settings panel. Top bar has breadcrumb, task status, and theme control. Main workspace contains title, file intake, actual editing area, and a single clear primary action. Bottom tray contains session files and clear-session action. On small screens, settings move into a labeled sheet and the tray collapses. Respect reduced motion and keyboard use; provide text alternatives to drag operations. Include useful batch handling and cancellation where supported.

## 4. Complete tool scope and provisional internal names

All 17 families remain in the roadmap. The working labels below are historical brainstorming aliases only. Use plain functional names in the actual navigation, as shown in the latest Plainkit wireframe. Do not introduce another layer of branded tool names.

| Reference | Working label | Functional scope and limits |
|---|---|---|
| ShrinkRay | Press | Compress images, audio, video, PDFs; distinguish quality from target size and report when targets cannot be achieved. PDF optimization is a separate engineering task; rewriting a PDF is not proof of meaningful compression. |
| ConvertIt | Recast | Supported image/audio/video/document/3D conversions. Publish an explicit tested input/output matrix. Do not imply universal Office, CAD, or document layout fidelity. |
| Cutout | Silhouette | Local background removal, transparent PNG, manual corrections; show model download and device compatibility. |
| DevToys | Gauge | All 40 reference utilities, inventoried below. Safe local processing; JWT decoding is not signature verification. |
| ExifErase | Scrub | Inspect and remove supported photo metadata, including GPS. Verify output metadata and warn about lossy re-encoding or unsupported fields. |
| LinkClean | Untrail | Remove recognized trackers; preserve meaningful query parameters and preview changes. Warn before changing signed URLs. |
| FileBeam | Relay | Pair devices, transfer with WebRTC, integrity check and cancellation. Explain direct/relayed connection state and signaling infrastructure. |
| BlurIt | Veil | Manual privacy redaction plus optional local face detection. Offer opaque redaction as well as blur, and export flattened results. Never claim automatic detection catches everything. |
| MergePDF | Bind | Merge, extract, reorder, rotate PDF pages; thumbnails and export verification. Clearly handle encrypted or unsupported PDFs. |
| VoiceRip | Stems | Local audio extraction and experimental stem separation. Validate a licensed model, browser memory, output quality, and realistic runtimes before claiming support. |
| SubtitleLab | Caption | Import/edit SRT/VTT, timing shifts, supported embedded-track extraction, optional local transcription; distinguish extraction, transcription, and burned-in subtitles. |
| QRForge | Imprint | Local static QR generation with colors, optional logo, error correction, PNG/SVG export; validate readability. |
| Cleansheet | Sift | CSV/TSV parsing, encoding/delimiter selection, dedupe, split/rename columns, cleanup, CSV/TSV/JSON export; undo and formula-injection-aware export. |
| IDPhoto | Frame | Country-specific crop/head/eye guides, background tools and printable sheets. Maintain sourced rules with checked dates; never guarantee official acceptance. |
| Unmark | Reveal | Inspect/remove invisible Unicode and supported file metadata. Preserve meaningful language characters by default; preview every cleanup rule. No claims of universal watermark removal or AI-origin detection. |
| VidGrab | Reel | Direct media and compatible HLS downloads, trim/export; explain CORS, unsupported codecs and DRM limits. Platform extraction requires a separately evaluated network service or optional local companion; never bypass limits silently through a proxy. |
| NoDoze | Watch | Screen Wake Lock with timer/stop key, visibility/release handling. A website cannot promise mouse movement, chat presence, or overriding OS security policies. |

DevToys inventory: JSON formatter/minifier/validator; Base64; URL encoding; JWT; regex; UUID; timestamp; hash; color; lorem ipsum; cron; diff; Markdown; JSON-to-TypeScript; password generator; case conversion; HTML entities; numeric bases; text statistics; slug; URL parser; HTTP status codes; escaping; image-to-Base64; JSON/CSV; line sorting; hex/ASCII; Unicode; tabs/spaces; whitespace; reverse; CSS units; date calculation; chmod; MIME types; time zones; Caesar/ROT13; passphrases; subnet; hash identification. Use cryptographic randomness for secrets. Label hash identification as heuristic.

## 5. Architecture and free/private/local approach

Default to a static React + TypeScript application with Vite, unless the existing repository gives a concrete reason to reuse another stack. Use internal routing, lazy tool modules, shared components, shared worker/job APIs, and a typed registry. Do not create 17 separately deployed apps or embed the old sites in iframes. No accounts, subscriptions, paid processing APIs, ads, analytics, or third-party fonts by default.

Each registry entry specifies id, plain name, aliases, category, supported formats, lazy importer, capability requirements, network behavior, asset download size, maturity, and limitations. Implement an engine contract with progress, cancellation, structured errors, input/output ownership, and disposal. Keep heavy work off the main thread. Enforce a memory-aware queue; do not run multiple heavy models by default. Stream large files where supported, release buffers/object URLs, and offer graceful recovery after a failed job.

Prefer native browser APIs for simple image operations, cryptography, URL handling, camera access, and wake lock. Evaluate pdf-lib/PDF.js for editing/previews, Papa Parse for delimited data, maintained QR libraries, WebCodecs with compatible demux/mux libraries for media, and ffmpeg.wasm as a heavier fallback. Native codecs are not universally available; test support at runtime. WASM is not automatically fast. Multithreaded WASM may need cross-origin isolation headers; verify hosting/header behavior and third-party resource compatibility.

For inference, evaluate ONNX Runtime Web / Transformers.js or a model-specific browser runtime. Verify each model's actual task support, license, weights size, accuracy, and CPU/WebGPU compatibility. A framework's existence does not prove good stem separation or transcription on phones. Use quantized models where quality permits, lazy download with visible size, opt-in cache, and a clear cache-delete control. Self-host assets where licensing and bandwidth allow; distinguish engine downloads from uploading user files.

PWA: cache the shell and chosen engines/models; report offline readiness per tool. Do not label the entire suite offline-ready after caching the landing page. Keep app-update and model-cache versions explicit. Offer local development/self-host instructions. “Free to use” does not mean unlimited free hosting/bandwidth; document sustainable static-hosting options and model-download costs without paid dependencies.

Privacy modes must reflect actual behavior: “On this device”, “Connects to another device”, or “Needs network access”. Display these only where useful to a user decision. Local-only tools must never transmit file bytes, pasted text, filenames, previews, or derived content. Hosting still receives ordinary page/asset requests; avoid an absolute “nothing ever leaves your device” slogan.

Network exceptions: WebRTC needs signaling and often STUN; TURN relays consume bandwidth and cost money. Offer manual pairing/direct-only mode if appropriate, with honest reliability limits. A relay is encrypted transport, not evidence that a file never touches server infrastructure. Video sites may require an extraction/relay service; direct links still contact the source server. Keep optional network features isolated from the local core, with no hidden fallback uploads.

Dependency selection: record current maintenance, version, license, model-weight license, redistribution rights, notices, and security issues. AGPL/commercial dual-licensed packages are not interchangeable with permissive ones. Do not adopt a license incompatible with the intended distribution without a deliberate project decision. Sanitize Markdown/SVG previews and exported names; never evaluate pasted code. Keep sensitive content out of telemetry, errors, and fixtures.

## 6. Implementation after the setup checkpoint

First inspect the 17 reference applications at https://jeffrey-hamilton-tools.vercel.app/ and create a feature matrix that separates observed behavior from assumptions. Reuse concepts, not proprietary assets. Keep a clear status for every capability: planned, experimental, working, verified, or unsupported.

Milestone A: design tokens, responsive shell, routes, registry, search, favorites, file tray, job interface, workers, error handling and one complete vertical slice. Prove image compression → conversion → export, retaining originals and transferring output in memory.

Milestone B: reliable everyday functions: image compression/conversion, PDF editing, link cleaning, manual redaction, metadata inspection/removal, CSV cleanup, QR generation, text cleanup, developer utilities and wake lock. Integrate each in the universal shell. Do not fake unsupported modes behind working-looking buttons.

Milestone C: locally downloaded inference, background removal, optional face detection, transcription, passport guides, and tested additional media/document/3D conversions. Start with explicit supported format pairs and add only verified ones.

Milestone D: feasibility spikes for stem separation, platform video download, peer transfer across networks. Keep every family represented in the roadmap, but gate unverified capabilities with honest states rather than invented results. Recommend an optional local companion only if a browser limitation truly warrants it; do not make it mandatory for the normal tools.

## 7. Acceptance and evidence

Test meaningful end-to-end outputs, not only rendered components: inspect exported metadata; open edited PDFs and verify page order; decode generated QR images; round-trip supported conversions; verify CSV row counts/escaping; exercise worker cancellation and large-file recovery. Use non-sensitive fixtures. Check keyboard navigation, focus, contrast, mobile/touch, reduced motion and browser differences.

For each local-only workflow, record browser network requests while processing a fixture, with assets both cold and warm. Verify no content-dependent external requests. Test a warmed tool offline. Check WebGPU-unavailable, unsupported codec, denied permission, exhausted storage, corrupted input, and insufficient-memory states. Report measured first-load bytes, warmed processing time on named fixtures/devices, and what was not measured. Establish realistic budgets after a baseline; never invent universal speed guarantees.

Done means a working function, verified export, truthful privacy label, documented limitations, accessibility checks, and passing relevant tests. Report failures and incomplete capability explicitly. Maintain `docs/feature-matrix.md`, `docs/network-boundaries.md`, `docs/licenses.md`, and concise release notes. At each milestone give a short reviewable result and the next step. Stop for the initial skill checkpoint; after I say begin, progress through the agreed build without repeated routine permission questions. Do not publish a public deployment unless I request it.

## Reference documentation to verify at execution time

- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- ffmpeg.wasm limitations: https://ffmpegwasm.netlify.app/docs/faq/
- Browser inference: https://huggingface.co/docs/transformers.js/index
- PDF editing: https://pdf-lib.js.org/docs/api/classes/pdfdocument
- CSV processing: https://www.papaparse.com/docs
- WebRTC connectivity: https://webrtc.org/getting-started/peer-connections
- Screen Wake Lock: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API




## 8. Accepted decisions: treat these as requirements

The current brand is Plainkit. The accepted aesthetic is NIGHTSHIFT: charcoal, graphite, pale sans-serif text, restrained lime, compact controls, large working previews, and a bottom file queue. This supersedes every earlier ivory, orange, and serif concept. The desktop sidebar is a flat list of exactly 17 tool families. There are no Images/Documents/Audio accordion groups. Gift Cards/CardTally is removed from the product: no route, sidebar row, implementation task, balance-checking service, or placeholder. Do not quietly bring it back because it appears in a reference site.

The references are for capabilities and general usability, not an instruction to reproduce the original site. Every tool belongs inside the same application. Do not use outbound links as the normal tool navigation. Do not embed external tools in iframes. Tool engines may be separate lazy chunks or workers but the user experiences one product.

The phrase “does not look AI-generated” means deliberate typography, useful content, consistent spacing, restrained decoration, good interaction states, and visible craft. Do not interpret it as adding random asymmetry, excessive textures, fake handwriting, or ornamental illustrations. No AI chat box is needed to use these tools.

## 9. Exact home-screen composition

Treat the standalone NIGHTSHIFT reference appended after this prompt as visual guidance; do not implement the older ivory home-screen styling. If the image is unavailable in this session, use this written specification rather than claiming to have seen it. Create an implementation-ready screenshot of your own build for comparison.

Desktop shell:
- Sidebar: 208–240px depending on viewport. A restrained pale or lime geometric mark plus a clean sans-serif PLAINKIT wordmark at the top; a compact “Find a tool…” search input; 17 rows with consistent outline icons; Settings and “Free. No account.” near the bottom. No nested category controls. On shorter screens, scroll the tool list while keeping essential controls reachable; never compress text below comfortable reading size just to fit.
- Sidebar order: Compress, Convert, Cutout, Dev tools, Metadata, Clean links, Send files, Redact, PDF, Audio stems, Subtitles, QR code, CSV, ID photo, Clean text, Video, Keep awake.
- Main top bar: “Workspace” on home; breadcrumb on tool routes. Right side has a factual processing-mode label when relevant and a labeled theme control. A global “On this device” indicator must change appropriately for network features.
- Home heading: “What are we working on?” Supporting sentence: “Pick a tool, or start with a file.” Keep this compact; it is an app workspace, not a marketing landing page.
- File intake: one broad, shallow drop area. Copy: “Drop files here, or choose files.” For local intake, “Files are processed in this browser.” Only show paste affordances for formats that actually support them.
- Everyday tools: a flat two-column directory of six common tasks, with an icon, functional name, one short description, and a small arrow. Left: Compress, Convert, PDF. Right: Redact, Cutout, CSV. Thin separators, no oversized tile grid.
- Session area: heading “This session”, “Clear session” action, files with meaningful previews, name/type/size, and compatible “Use this file with” actions. An image can offer Compress, Convert, Redact, Cutout. A PDF should offer PDF and other genuinely supported actions. Do not show irrelevant actions just to fill space.
- Files selected on home are added to the session; they do not begin CPU-heavy work automatically. The user chooses an operation. Text-only tools remain directly accessible without importing any files.

Suggested spacing scale: 4, 8, 12, 16, 24, 32, 48px. Base interface text around 14–16px; smaller metadata only where legible. Main headings approximately 28–36px desktop and 24–28px mobile; keep working controls and previews visually primary. Use 1px dividers and modest 4–8px control radii. Keep interactive targets at least 24px with sufficient spacing, preferably around 44px for touch. Icons should come from a single consistent licensed family. Decorative images in the wireframe are sample content, not required shipped assets.

Typography: use a self-hosted licensed modern sans serif throughout, with compact, readable semibold headings. Small monospace text is appropriate only for byte counts, dimensions, timestamps, hashes, and other technical values. No editorial serif headings. Keep body/control labels around 14–16px, with secondary metadata readable at its actual rendered size. Avoid terminal styling, all-caps paragraphs, hacker imagery, neon outlines, decorative code, and excessive contrast between black and glowing green.

Active-tool layout takes priority over the home directory: compact top toolbar; flat 17-tool sidebar; a large central image/page/waveform/editor preview appropriate to the tool; a compact settings panel alongside it where width allows; shared file queue at the bottom. For Compress, show an actual before/after preview with a usable comparison control, input/output byte counts, quality OR target-size mode, supported output-format selection, and one lime primary action. Do not imply quality and exact target size are independent simultaneous guarantees. Before execution use “Compress”; after a real result exists offer “Download” or “Export file”. Example byte counts in the concept are illustrative, never fabricated live results. The queue shows real job states and supports moving completed output to another compatible tool. Keep it compact and collapse it on mobile instead of covering the preview.

Use graphite settings/queue surfaces with subtle separation and roughly 6–8px radii. Controls should feel like a focused desktop editor, not a dashboard of marketing cards. Empty states can use the home intake/directory composition above, restyled in Nightshift; once a file is selected, the actual editing canvas should dominate. Do not reproduce account/profile icons from the generated concept: this product requires no account. Before completing the visual milestone, compare actual desktop and mobile screenshots against the standalone Nightshift reference for palette, typography, density, preview emphasis, sidebar, queue, and restrained accent usage.

## 10. Responsive and accessibility behavior

Define breakpoints based on content pressure, not device brand. Start by checking around 1440, 1024, 768, 390, and 320 CSS pixels. On narrow screens, replace the sidebar with a hamburger button opening the same flat 17-tool list. Keep the brand, active tool name, and primary action visible. Collapse the two-column directory to one column. File rows wrap sensibly and long filenames truncate visually while remaining available to assistive technology. Tool settings move below the canvas or into an accessible sheet.

Do not put all 17 tools into a horizontally scrolling strip on mobile. Do not hide necessary actions behind hover. Drawers and dialogs must have labels, Escape handling, sensible focus return, focus containment where modal, and correct background inertness. Closing a drawer must not cancel a job. Preserve native browser zoom.

Aim for WCAG 2.2 AA. Use semantic buttons and links, input labels, descriptive errors, visible focus, and meaningful headings. Announce job completion and important errors with restrained live regions; do not announce every percentage update. Provide keyboard alternatives for PDF reorder, redaction selection, and crop adjustments. Maintain state when a user moves focus between controls. Honor reduced motion and system theme while allowing a stored local preference.

## 11. State and interaction specification

Every file tool needs explicit states: idle, input selected, inspecting, ready to configure, engine downloading if needed, processing, complete, canceled, failed, unsupported. Distinguish engine download progress from file-processing progress. Do not fake percentages when an engine only exposes indeterminate progress. Error messages state what failed and the next useful action. Retrying must not duplicate the original file or silently lose edits.

Every result shows filename, format, size, and relevant output details. Compression shows original size, result size, and actual percentage reduction; a larger output must not be presented as a success in reducing size. Offer Download, Use in another tool, and Remove. Keep original bytes untouched. Use explicit output suffixes such as photo-compressed.webp or report-extracted.pdf and avoid overwriting names implicitly.

A queued job is distinct from a running job. Navigation between tools preserves job state but does not assume the browser can run indefinitely after tab closure, suspension, or backgrounding. Never promise persistence across reload unless actually implemented and enabled. A before-unload prompt should be limited to genuinely unsaved work and respect browser restrictions.

“Clear session” cancels active jobs, disposes owned previews and object URLs, releases file references, and clears opted-in session persistence. If processing or edited results would be lost, show a concise confirmation naming the impact. Engine/model caches are a separate control, not silently deleted whenever a user clears files. Avoid destructive cross-tab surprises; document whether sessions are tab-scoped.

Undo/redo is required for destructive editing operations where practical, especially CSV transformations, redaction edits, crop edits, and PDF page manipulation. A bounded operation history is preferable to repeatedly copying huge file buffers. Explain any irreversible export flattening before export, not through a generic modal on every click.

## 12. Module boundaries and data contracts

Use a modest architecture that can grow without becoming a framework project. Suggested structure, adjusted to the existing repository:

```text
src/
  app/                 # shell, router, providers, global styles
  components/          # genuinely shared UI primitives
  tools/               # one folder per tool family
  engines/             # shared image, PDF, media, inference adapters
  workers/             # worker entry points and typed messaging
  session/             # file registry, ownership, ephemeral state
  jobs/                # queue, lifecycle, cancellation, progress
  capabilities/        # runtime feature checks
  privacy/             # network policy declarations and controls
  registry/            # tool definitions and compatibility matching
  test-fixtures/       # small, non-sensitive development samples
public/
  fonts/
  engines/             # only redistributable local assets
  models/              # only verified licensed weights, if appropriate
```

Keep UI modules separate from transform functions. A tool should not import another tool's entire screen to reuse an engine. Share an abstraction only after it has a clear use; do not build a universal editor that makes simple tools hard to implement. Use strict TypeScript and avoid untyped worker messages.

Conceptual file record:

```ts
type SessionAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  origin: 'imported' | 'generated';
  parentIds: string[];
  createdAt: number;
};
```

Conceptual job contract:

```ts
type JobProgress = {
  stage: 'loading-engine' | 'inspecting' | 'processing' | 'exporting';
  fraction?: number; // 0..1 only when genuinely known
  message?: string;
};
type ToolResult = { assets: SessionAsset[]; warnings: string[] };
// Engine execution accepts validated options, input references,
// AbortSignal, and an onProgress callback, returning ToolResult.
```

These snippets are interface guidance, not a demand to serialize Blob references through JSON. Use structured cloning and transferable buffers appropriately. Transferring a buffer detaches it from its previous owner; do not destroy originals accidentally. Track ownership and disposal. Ensure worker initialization, cancellation, termination, and error recovery are tested. If an engine cannot cancel cooperatively, terminate/recreate its worker and clean its temporary state.

The registry is the source of truth for sidebar entries, search, routing metadata, compatibility matching, supported formats, and privacy declarations. Categories may exist internally for search/filter logic; they do not justify accordion navigation. Keep user-facing labels and brand strings centralized. Add old reference names as hidden search aliases for familiarity.

## 13. Detailed tool acceptance requirements

### Compress

Start with JPEG, PNG, and WebP where the browser supports required encoders. Confirm actual output MIME and file signatures. Respect EXIF orientation and preserve aspect ratio. Distinguish lossless format-specific optimization from lossy re-encoding. Do not claim a PNG quality slider works like JPEG. Provide quality, maximum dimensions, and target size modes where achievable. Target-size search must be bounded and return the best achievable output with an honest explanation. Support batch processing with per-file results and a memory-aware queue. Clearly state whether metadata is preserved or removed. Audio/video/PDF support expands only with tested engines and format limits.

### Convert

Begin with a tested format matrix, not a giant speculative dropdown. Infer likely input format but validate content. Warn about lost transparency, animation, extra document pages, layers, or metadata when applicable. White/selected backgrounds for alpha-to-JPEG conversions must be deliberate. Preserve filenames appropriately and preview options before processing. Document/3D conversions require explicit fidelity and feature limitations; do not implement them as filename-extension changes.

### Cutout

Show first-use model size before downloading. Offer image preview, checkerboard transparency, before/after, restore/erase refinements where feasible, and PNG export. Allow cancel during inference. Handle portraits and objects with example-based verification. Avoid promising perfect hair, glass, or fine edges. Keep the input image local and avoid remote inference fallbacks.

### Dev tools

Use an internal searchable list for the 40 utilities without expanding the main sidebar to 40 more entries. Provide input/output panes, copy, clear, useful examples, and correct validation errors. Do not retain secrets in history by default. Use safe parsing for JSON and browser cryptography for hashes/password randomness. Large regex evaluation needs a worker and time limit to avoid freezing the app. Password/passphrase generators need clear length/character or word-count controls. Markdown preview must be sanitized. Hex, Unicode, byte length, and text character count must be labeled precisely; grapheme count differs from JavaScript string length.

### Metadata

Separate inspection from removal. Show supported EXIF/GPS/IPTC/XMP fields when available and record which formats can actually be cleaned. Verify the exported file with an independent parsing path or known fixture. A visual re-encode can alter quality/color/orientation; explain this when relevant. Do not promise removal of every possible hidden datum or visible identifying detail.

### Clean links

Display original and cleaned URL, removed parameters, and copy action. Parse using URL-safe routines. Keep fragments and essential parameters unless a known rule requires otherwise. Signed/authenticated URLs can break when modified: preview and allow restoring parameters. Do not fetch URLs merely to clean their query strings. Avoid embedding potentially dangerous pasted URLs into executable preview markup.

### Send files

Separate send and receive flows. Provide pairing expiry, explicit peer acceptance, progress, cancellation, error recovery, and transfer integrity checks. Short pairing codes require rate limiting and sufficient underlying session entropy if a signaling service is used. Never equate a six-digit code alone with strong authentication. Reveal only the minimum necessary metadata during pairing. Document peer IP exposure, signaling data, direct-vs-relayed behavior, practical size limits, and hosted infrastructure costs. Do not promise guaranteed any-size transfers on mobile browsers. Manual exchange mode is acceptable if clearly explained.

### Redact

Manual rectangle/brush tools are the reliable baseline. Add optional on-device face detection later. Offer solid redaction, pixelation, and blur with clear strengths. Solid redaction is preferable for sensitive text. Allow selecting/moving/deleting regions and undo. Flatten edits into exported pixels and avoid exporting an editable original layer or embedded thumbnail that reveals the source. Verify orientation, scaling, and preview-to-export coordinate mapping. Do not rely on blur for a guarantee of secrecy.

### PDF

Import multiple supported PDFs, display thumbnails with page numbers, keyboard-accessible reorder, select ranges, rotate, remove, extract, and merge. Distinguish changing page order from rewriting page content. Explain that edits may invalidate digital signatures. Test multi-file order, rotated pages, blank pages, mixed dimensions, corrupt inputs, and encrypted documents. Never silently rasterize every page just to merge. PDF compression, OCR, and editing existing text are separate capabilities, not automatically included.

### Audio stems

Start with reliable audio extraction from supported video files. Stem separation is an experimental capability until a real local model works end to end. Specify stems actually supported by the chosen model, not a menu of invented options. Provide waveform/time information if practical, progress, preview playback, individual outputs, and supported sample-rate details. Handle chunk boundaries and reconstruction artifacts. Benchmark memory/runtime on named fixtures. Long tracks may need an explicit limit or an optional local companion; never silently upload audio.

### Subtitles

Support SRT/VTT import, table/timeline editing, search, offset adjustment, cue validation, and export. Preserve Unicode, line breaks, and time precision. Validate nonnegative timings and end-after-start; flag overlaps without assuming all overlaps are invalid. Extract only supported embedded tracks. Local speech recognition needs a separate model download and language/device compatibility reporting. Burned-in subtitles cannot simply be extracted as text; any OCR capability is a separate verified feature. Optional burn-in export is codec-dependent and must be labeled accordingly.

### QR code

Support text/URL initially, then correctly encoded Wi-Fi/contact content where tested. Foreground/background, margin, size, correction level, optional logo, PNG/SVG downloads. Warn about inadequate contrast or excessive logo coverage. Validate exports with an independent QR decoder. Generated static codes must encode user content directly, without a tracking redirect or forced expiry. Do not send the content to a third-party QR API.

### CSV

Show delimiter, encoding, header, quote-handling, and preview settings. Preserve raw import until the user applies transformations. Support trim, remove empty rows, dedupe with selected columns, rename/reorder/split columns, find/replace, and CSV/TSV/JSON export. Distinguish exact duplicates from normalized matches. Preview changes and counts; provide undo. Handle quoted delimiters, newlines, BOMs, empty fields, duplicate headers, and non-Latin text. Do not assume every CSV fits in memory; use bounded preview and streaming where appropriate. Formula-safe export must be an explicit policy with visible effects, not silent corruption of user data.

### ID photo

Provide country/document presets with official source links and last-checked dates. Keep image dimensions, physical print dimensions, DPI, head-size range, eye-line guides, and background requirements distinct. Allow manual crop and guide adjustment without claiming automated compliance. Export a single photo and printable sheet with actual physical dimensions. Verify PDF/print scaling assumptions. Tell users official acceptance depends on the issuing authority; never invent a compliance score.

### Clean text

Show invisible characters with positions and names, inspect before/after, configurable cleanup, copy/download. Preserve ZWJ/ZWNJ, bidirectional controls, nonbreaking spaces, and combining marks by default unless the user chooses a rule and understands the impact. These can be meaningful in real languages and emoji. Do not claim the tool can prove AI authorship or remove all watermarks. Reuse verified metadata engines for supported file inspection without presenting a second inconsistent metadata implementation.

### Video

Paste direct URLs or supported HLS manifests, show supported capability before download, and allow local trim/export. Requests contact the source host. Respect CORS and explain it plainly rather than creating an undisclosed proxy. Handle live-vs-VOD, segmented streams, unsupported codecs, unavailable resources, and output assembly limits. DRM-protected services are unsupported. Platform-page extraction is a separately reviewed optional feature; keep it out of the default static site's privacy promise. Local file trimming should work independently of external download support.

### Keep awake

Use the supported Screen Wake Lock API, request only after user action, show actual active/released state, timer, stop button, and configurable stop key. Do not intercept that key while typing in inputs or editors. Handle tab visibility changes and OS/browser release events honestly. Reacquire only in accordance with the user's ongoing intent and browser restrictions. Do not promise cursor movement, Teams/Slack presence, or a permanent override of OS lock/security behavior.

## 14. Performance, privacy, and offline verification plan

The app shell must not import FFmpeg, PDF engines, AI runtimes, or model weights eagerly. Inspect production bundle output to prove separation. Start with a provisional compressed initial-JavaScript budget of 250KB, excluding lazy tools, fonts, and user-selected model downloads; measure actual transfer bytes and explain any exception before relaxing it. This is an engineering target, not a claim that a build already meets it. Keep the UI responsive during representative jobs and report long tasks where measurable.

Create named benchmark fixtures rather than sweeping speed claims: a medium phone JPEG, a transparent PNG, a 20-page mixed PDF, a CSV with quoted fields and thousands of rows, a short supported video, and a short audio clip. Record device/browser, fixture size, cold engine download, warm run time, result size, peak-memory estimates only where measurable, and failures. Test on a constrained configuration when possible. If no physical phone is available, distinguish viewport emulation from real-device performance.

Network audit methodology: inspect requests, WebSockets, beacons, worker behavior, service-worker traffic, and content-derived URLs during actual transforms. Compare cold loads to warmed offline runs. Assert local tool inputs never appear in request paths, bodies, query parameters, errors, or logs. A passing test that merely checks no fetch call in one source file is insufficient. Keep integration fixtures non-sensitive. Documentation-only privacy promises do not replace network verification.

For PWA caching, define what is cached, eviction behavior, storage estimates, update behavior, and delete controls. Avoid caching user's files through a broad service-worker rule. Fail safely if model caching exceeds storage quota. Never interrupt an active transform with an automatic app reload. Prompt to activate an update when appropriate. Test first load without network, warm load offline, engine missing offline, stale asset versions, and cache deletion.

Security baseline: parse untrusted files defensively; cap unreasonable dimensions/decompression sizes where possible; isolate expensive work; escape filenames; sanitize HTML/SVG/Markdown previews; restrict object/embed behavior with a tested CSP; revoke object URLs. Keep secrets and file content out of crash reports. No remote scripts, analytics pixels, or arbitrary CDN runtime dependencies by default. Cross-origin isolation, CSP, WASM, workers, and PWA behavior must be tested together rather than enabled by cargo-cult headers.

## 15. Delivery sequence, review gates, and concrete artifacts

After the initial skill/setup checkpoint and my instruction to begin, use these gates:

1. Foundation: verified model/skill config, concise CLAUDE.md, tool inventory, network boundary table, architecture sketch, design tokens, registry and ownership contracts.
2. Visual shell: home screen faithful to the latest Plainkit direction, flat 17-tool navigation, responsive mobile drawer, theme, search, session tray, routing/back-forward behavior. Show real desktop/mobile screenshots. A visual shell is not a completed tool suite.
3. First real workflow: import an image, compress, pass result to conversion without a disk round trip, download and independently inspect output. Demonstrate cancellation and original preservation.
4. Everyday tools: integrate tested PDF, links, manual redaction, metadata, QR, CSV, text, dev tools, wake lock. Match per-tool requirements, not just menu presence.
5. Advanced local engines: background removal, transcription, additional media conversions, passport presets, stem-separation feasibility. Each capability requires task-specific proof and measured constraints.
6. Network features: peer transfer and optional video extraction; preserve a usable local-only core and describe any required hosting. No hidden backend dependency for normal file operations.
7. Release readiness: production build, relevant tests, export checks, accessibility and privacy checks, licensing inventory, offline checks, screenshots, self-host instructions, and honest unsupported-feature list.

Keep gates reviewable and report progress without asking me to reapprove every reversible step. Only the initial setup checkpoint is a mandatory pause in this prompt. Do not spend days polishing documentation before proving a functioning vertical slice. Do not declare the project complete while the 17 entries are mostly placeholders. If a feature cannot be implemented within browser/privacy constraints, present a concrete limitation and best supported alternative rather than inventing success.

Required deliverables, kept concise and maintained as work proceeds:
- A runnable project with a lockfile and documented development/build commands.
- A compact CLAUDE.md with durable decisions and links to detailed references.
- Project-local skills and valid subagent definitions using actual available models.
- A skills manifest distinguishing downloaded, reused, and project-authored instructions.
- A feature/format support matrix with evidence and maturity status.
- Dependency and model licenses, attribution notices, and source revisions.
- A network boundary table, privacy explanation, and cache/session lifecycle description.
- Meaningful automated checks and non-sensitive fixtures.
- Desktop/mobile screenshots of the actual implementation.
- Short release notes and remaining limitations.

Suggested task handoff format:

```text
Task:
Owned files:
Required context: [specific files or skill references only]
Inputs / outputs:
Acceptance checks:
Do not change:
Stop and escalate if:
Return: changed files, checks, limitations; keep it concise.
```

Suggested milestone report:

```text
Working now:
Evidence: [tests, screenshots, exported fixture checks]
Limitations:
Next:
```

Do not attach long chain-of-thought explanations, repeat the entire product brief, or return full logs unless needed to diagnose a failure. Keep working notes brief enough that future sessions can resume without rereading every agent transcript.

## 16. First action reminder

Begin with skill and environment setup only. Verify or install the relevant skills, create the setup manifest, validate model availability and subagent configuration, and report the result. Do not implement the application until I tell you to begin. After that instruction, build Plainkit as specified: one cohesive workspace, 17 tool families, no Gift Cards, local processing wherever feasible, and honest exceptions wherever network access is necessary.


---

## Approved visual reference — Plainkit Nightshift only

The image below is a design concept, not a screenshot of an implemented application. Its example files, byte counts, and dimensions are illustrative. Follow its charcoal/graphite palette, restrained lime, sans-serif typography, flat tool list, large working preview, compact settings, and bottom file queue. Use the written requirements for accessibility, honest states, and functional behavior.

![Plainkit Nightshift desktop reference](generated_images/exec-43b30830-680c-4bf2-8226-831c811aa010.png)

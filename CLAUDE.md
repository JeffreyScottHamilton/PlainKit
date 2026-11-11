# Plainkit

Free, local-first browser utility workbench. One static React + TypeScript + Vite app, 17 tool families, NIGHTSHIFT dark design. Full brief: `docs/reference/master-prompt.md`. Visual reference: `docs/reference/nightshift-desktop.png`.

## Commands
`npm run dev` · `npm run build` (typecheck + build) · `npm run typecheck` · `npm test` (Vitest) · `npm run e2e` (Playwright against `npm run preview`; set `PK_BASE_URL` to use another server). Chromium is preinstalled: never run `playwright install`.

## Durable decisions
- Registry (`src/registry/tools.ts`) is the source of truth: 17 tools, fixed order, no Gift Cards, no category accordions.
- No accounts, analytics, remote fonts, CDNs, iframes. Local tools never send user content anywhere.
- Session is tab-scoped and memory-only. Originals are never mutated; outputs get suffixed names via `outputName()`.
- One worker per job (`callWorker`); cancel = terminate. Heavy jobs run one at a time.
- Never fake a capability or a number. Unsupported = explicit unsupported state. Raise `maturity` in the registry only with evidence in `docs/feature-matrix.md`.
- Brand strings only in `src/app/brand.ts`.

## Shared API (read the file before use)
- `@/registry` — `TOOLS`, `getTool`, `mustTool`, `toolsFor(mime)`, `searchTools(q)`, `NETWORK_LABEL`.
- `@/session/store` — `addFiles(files, toolId?)`, `addGenerated`, `removeAsset`, `sendTo(toolId, ids)`, `setInputs`, `removeInput`, `assetUrl(asset)`, `useAssets()`, `useToolInputs(toolId)`.
- `@/session/toolState` — `useToolState(key, initial)`: tool UI state that survives route changes.
- `@/session/clear` — `clearSession()`, `clearImpact()`.
- `@/jobs/queue` — `enqueue({toolId,label,inputIds,heavy,run})`, `cancelJob`, `useJobs(toolId?)`, `isActive`. `run` returns `{outputs:[{name,mime,blob}], warnings}`; the queue adds outputs to the session.
- `@/workers/rpc` — `callWorker(create, req, {signal,onProgress,transfer})`, `serve(handler)`.
- `@/lib/errors` — `ToolError(code, message, nextAction)`. `@/lib/format` — `formatBytes`, `percentChange`, `outputName`, `uid`.
- `@/components/ui` — `Button`, `Field`, `Segmented`, `Notice`, `Progress`, `CopyButton`. Also `ToolPage`, `DropZone`, `AssetList`/`AssetRow`/`UseInMenu`/`downloadAsset`, `JobStatus`/`JobBadge`.
- CSS: tokens in `src/app/tokens.css`, primitives `pk-*` in `src/components/components.css`. Tool CSS lives in the tool folder.

## Process
Skills in `.claude/skills/`, agents in `.claude/agents/`. Progress: `docs/progress.md`. Decisions: `docs/decisions.md`.
Parallel agents share this working tree: edit only owned files, and do not run `npm run build` or `npm run e2e` (they write `dist/` and bind port 4173). Use `npx tsc --noEmit`, `npx vitest run <paths>`, and your own dev server port.

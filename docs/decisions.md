# Decisions

1. **Stack**: React 19 + TypeScript + Vite, react-router, plain CSS with tokens. No state library: a 20-line external store.
2. **Worker model**: one worker per job, terminate to cancel. Revisit if startup cost is measurable.
3. **Tool state**: `useToolState` keeps per-tool UI state in memory across routes; cleared with the session.
4. **Handoff**: `sendTo(toolId, assetIds)` links existing in-memory assets as another tool's inputs. No download round trip.
5. **CSP**: production-only meta tag. `connect-src` allows `https:` because the Video tool fetches user-supplied media URLs; local tools are verified by network audit rather than by CSP alone.
6. **Third-party skills**: only reviewed `SKILL.md` files, pinned in `docs/skills-manifest.md`.
7. **Reference site**: not reachable from the build container (network policy). Feature scope comes from the written brief and is marked "from brief" in the feature matrix.

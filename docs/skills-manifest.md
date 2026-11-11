# Skills manifest

Checked 2026-11-11 in a Claude Code cloud session (Claude Code 2.1.322, Node 22.23.4, npm 10.9.9). This describes this repository and this container only; nothing was installed in any other environment.

Status values: **authored** (written in this repo), **reused** (already installed, not modified), **newly installed** (downloaded), **unavailable**, **failed**.

No third-party skills were downloaded: **newly installed = none, failed = none**. Project-specific guidance was authored instead, which avoids unreviewed third-party scripts. All authored skills are revision 1 (see git history for the commit).

## Project-authored skills (`.claude/skills/`)

| # | Coverage | Skill | Path | Status | Used by |
|---|---|---|---|---|---|
| 1 | Product architecture, tool registry | plainkit-architecture | `.claude/skills/plainkit-architecture/SKILL.md` (+ `contracts.md`) | authored | manager, specialist, implementer |
| 2 | Visual design, responsive layout | plainkit-nightshift-design | `.claude/skills/plainkit-nightshift-design/SKILL.md` | authored | manager, implementer |
| 3 | Accessible frontend | plainkit-accessible-frontend | `.claude/skills/plainkit-accessible-frontend/SKILL.md` | authored | implementer, verifier |
| 4 | Local file processing, workers, memory | plainkit-local-processing | `.claude/skills/plainkit-local-processing/SKILL.md` | authored | implementer |
| 5 | Privacy, network-boundary verification | plainkit-privacy-network | `.claude/skills/plainkit-privacy-network/SKILL.md` | authored | specialist, verifier |
| 6 | Media, codecs, WASM, local inference | plainkit-media-inference | `.claude/skills/plainkit-media-inference/SKILL.md` | authored | specialist |
| 7 | Browser testing, performance | plainkit-testing-perf | `.claude/skills/plainkit-testing-perf/SKILL.md` | authored | implementer, verifier |
| 8 | Licensing, supply chain | plainkit-licensing | `.claude/skills/plainkit-licensing/SKILL.md` | authored | manager, specialist |
| 9 | Delegation, integration, review | plainkit-delegation | `.claude/skills/plainkit-delegation/SKILL.md` | authored | manager |

Validation performed: every file exists, starts with YAML frontmatter that parses, and has `name` + `description`. Not yet verified: that the running session lists them (project skills and agents created mid-session may only be picked up by a new session).

## Reused (already installed in this session, unmodified)

| Skill | Source | Purpose here |
|---|---|---|
| code-review | Claude Code built-in | milestone diff review |
| security-review | Claude Code built-in | security pass before release |
| simplify | Claude Code built-in | cleanup after integration |
| run | Claude Code built-in | launching the app for verification |

Other installed skills (document/office, dataviz, artifact, API, config skills) are unrelated to this build and not used.

## Subagents (`.claude/agents/`)

| Agent | Model field | Resolved in this session | Preloaded skills | Role |
|---|---|---|---|---|
| plainkit-specialist | `opus` | `claude-opus-5-5` (probe) | 1, 5, 6, 8 | architecture, hard investigations, privacy/milestone review |
| plainkit-implementer | `haiku` | `claude-haiku-5-5` (probe) | 1, 2, 3, 4, 7 | scoped modules and tests |
| plainkit-verifier | `haiku` | `claude-haiku-5-5` (probe) | 3, 5, 7 | builds, tests, audits, screenshots |

Manager: main session, configured and last served as `claude-fable-5-2` (from session metadata).

Model probes: one subagent was spawned per alias and reported the model ID from its own system prompt. That is self-reported, not billing-level proof. Aliases are used instead of pinned IDs so the definitions keep working if IDs change; pin IDs if exact versions matter.

Nested delegation is disabled in this environment (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`) and all three agents also disallow the Agent tool.

## Known limits

- Usage/cost telemetry is not available to the session; no token or dollar figures will be reported.
- The reference image is stored at `docs/reference/nightshift-desktop.png`; the brief at `docs/reference/master-prompt.md`.

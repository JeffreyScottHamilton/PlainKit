---
name: plainkit-delegation
description: Bounded delegation, task contracts, integration, and milestone review for Plainkit. Use when the manager assigns work to subagents, integrates their output, or runs a review gate.
metadata: {origin: project-authored, revision: 1}
---
# Delegation, integration, review (project-authored)

Roles: manager (main session) plans, writes contracts, integrates, verifies. `plainkit-specialist` handles architecture decisions, hard media/inference problems, privacy and milestone reviews. `plainkit-implementer` builds scoped modules + tests. `plainkit-verifier` runs builds/tests/audits and reports evidence.

- Max two concurrent coding agents unless tasks touch disjoint files. No nested delegation. Trivial work: manager does it directly.
- Workers never edit shared config (`package.json`, `vite.config`, registry index, tokens, router) unless the contract assigns it.
- Retry a failing approach once, then escalate with evidence.
- Specialist at milestones and hard failures only, not after every edit.
- Manager reads diffs and runs checks before accepting; a worker's "done" is a claim, not evidence.
- Keep `docs/progress.md` short; decisions go in `docs/decisions.md`.

## Task contract
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

## Milestone report
```text
Working now:
Evidence: [tests, screenshots, exported fixture checks]
Limitations:
Next:
```
No transcripts, no invented token or cost figures.

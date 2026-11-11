---
name: plainkit-accessible-frontend
description: Accessibility requirements (WCAG 2.2 AA) for Plainkit React components — semantics, focus, drawers/dialogs, live regions, keyboard alternatives. Use when writing or reviewing any interactive component.
metadata: {origin: project-authored, revision: 1}
---
# Accessible frontend (project-authored)

Target WCAG 2.2 AA. Verify with tests and a real keyboard pass, not by assertion.

- Semantics: real `<button>`/`<a>`, labeled inputs, one `h1` per route, ordered headings, landmarks (`nav`, `main`, `aside`).
- Focus: visible ring (≥3:1 against adjacent colors) on every interactive element; never `outline: none` without replacement; focus not obscured by the tray.
- Targets: ≥24px with spacing, ~44px for touch. Nothing essential behind hover.
- Drawer/dialog/sheet: accessible name, Escape closes, focus moves in and returns to the opener, focus contained when modal, background `inert`. Closing never cancels a job.
- Live regions: polite announcement for job completion and important errors only; never per-percent progress. Use `role="progressbar"` with `aria-valuenow` only when the fraction is real; otherwise indeterminate.
- Keyboard alternatives are mandatory for drag operations: PDF reorder (move up/down), redaction regions (arrow move/resize, Delete), crop (arrow nudges), compare slider (`role="slider"`).
- Truncated filenames keep the full name available (`title` + accessible text).
- Errors: say what failed and the next useful action; associate with the field via `aria-describedby`.
- Respect `prefers-reduced-motion`, `prefers-color-scheme` (with stored override), and native zoom (no `user-scalable=no`; layout works at 320px / 200% zoom).
- Color is never the only signal for state.
- State survives focus moves and route changes.

Checks: axe on each route (dark and light), tab-order walk, drawer focus-trap test, contrast measured from computed styles.

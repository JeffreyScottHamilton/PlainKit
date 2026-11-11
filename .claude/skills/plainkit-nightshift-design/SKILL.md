---
name: plainkit-nightshift-design
description: Plainkit NIGHTSHIFT visual direction — tokens, layout, typography, density, responsive rules. Use when building or reviewing any UI, styles, layout, or screenshots.
metadata: {origin: project-authored, revision: 1}
---
# NIGHTSHIFT design (project-authored)

Compact professional creative software: charcoal surfaces, graphite panels, pale sans text, restrained lime. Never the old ivory/orange/serif concept.

## Tokens (dark default; light theme translates the same roles)
canvas `#202225` · sidebar `#181A1C` · panel `#292C2F` · input `#232628` · divider `#3A3E42` · text `#F2F4F1` · text-2 `#B7BDB6` · accent `#C8E86B` · on-accent `#18200F`.
Separate success/warning/error colors — lime never means "succeeded". Measure contrast for text, borders, focus, disabled, errors; do not assume.
Spacing: 4, 8, 12, 16, 24, 32, 48. Radii 4–8px. 1px dividers. Body/controls 14–16px; headings 28–36 desktop, 24–28 mobile, semibold. Self-hosted sans only; monospace only for bytes, dimensions, timestamps, hashes. One licensed outline icon family.

## Layout
Desktop: sidebar 208–240px (mark + PLAINKIT, "Find a tool…", flat 17 rows, Settings, "Free. No account.") · flexible canvas · optional 280px settings panel · top bar (breadcrumb, processing-mode label, labeled theme control) · bottom file queue.
Active tool: large real preview dominates; compact settings beside it; one lime primary action.
Home: "What are we working on?" / "Pick a tool, or start with a file." · one broad shallow drop area · flat two-column directory (Compress, Convert, PDF | Redact, Cutout, CSV) · "This session".
Check at 1440, 1024, 768, 390, 320. Narrow: hamburger drawer with the same flat list, one-column directory, settings in a sheet, tray collapses. Never a horizontal 17-tool strip.

## Lime budget
Primary action, active tool, focus, a few meaningful highlights. Not every icon. No glow.

## Banned
Card walls, hero sections, gradients, glass, blobs, stock AI art, fake charts, decorative code, badge spam, chat boxes, account/profile icons, terminal/hacker styling, all-caps paragraphs.

## Done check
Compare real desktop + mobile screenshots to the reference for palette, type, density, preview emphasis, sidebar, queue, accent restraint.

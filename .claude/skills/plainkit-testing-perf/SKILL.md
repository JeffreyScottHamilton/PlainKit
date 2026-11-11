---
name: plainkit-testing-perf
description: Testing and performance measurement for Plainkit — Vitest unit tests, Playwright end-to-end with real exported-output verification, bundle budgets, benchmarks. Use when writing tests, verifying a tool, or reporting measurements.
metadata: {origin: project-authored, revision: 1}
---
# Testing and performance (project-authored)

## Environment
Chromium and Playwright are preinstalled in the cloud container: do not run `playwright install`. If the project pins another version, use `executablePath: '/opt/pw-browsers/chromium'`. Run suites with `--trace off` unless debugging.

## What counts as a test
Verify the exported artifact, not that a component rendered:
- Images: magic bytes, decoded dimensions, orientation, size vs original.
- Metadata: re-parse output with an independent path; GPS absent.
- PDF: reopen output, check page count/order/rotation; encrypted and corrupt inputs.
- QR: decode the exported PNG/SVG with an independent decoder.
- CSV: row counts, quoted delimiters/newlines, BOM, formula-safe policy.
- Conversions: round trip. Workers: cancel mid-run, retry, original hash unchanged.
- Handoff: output of tool A used in tool B with no download event.
Pure engines get Vitest unit tests; flows get Playwright. Fixtures are small, generated or public-domain, non-sensitive, in `src/test-fixtures/`.

## Also check
Keyboard-only flow, focus return, axe, 320–1440 viewports, reduced motion, denied permission, unsupported codec, corrupted input.

## Performance
- After `vite build`, inspect chunks: shell must not contain PDF/media/inference code. Initial JS ≤ 250KB compressed (provisional); report measured gzip/brotli bytes.
- Benchmarks: name fixture, device, browser; cold vs warm; result size. Report what was not measured. Never invent numbers or universal speed claims.

## Reporting
Paste the failing output when something fails. "Verified" requires a passing check that exists in the repo.

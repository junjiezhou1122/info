# Screenpipe Non-Browser Surface

GitHub issue: https://github.com/junjiezhou1122/info/issues/9

## Problem

Browser context is strong through Chrome ACP, but non-browser context still needs productized Screenpipe integration: active app/window, OCR/accessibility text, screenshot, vision summary, and project routing.

## Scope

- Strengthen `state.surface` for non-browser apps.
- Use Screenpipe OCR/screenshot as evidence.
- Invoke vision model only when text evidence is insufficient and policy allows.
- Route non-browser context into work/project lanes.

## Acceptance Criteria

- [ ] `state.surface` can represent active non-browser app/window context.
- [ ] OCR/accessibility text is preferred before screenshot vision.
- [ ] Screenshot vision uses configured `VISION_LLM_*` only when policy allows.
- [ ] Non-browser context can attach to active project lanes.
- [ ] Screenpipe recorder/self-observation noise is filtered.
- [ ] Dry-run does not persist generated visual summaries.
- [ ] Tests cover no-Screenpipe fallback.

## Verification

- Add tests, suggested: `tests/screenpipe-surface.test.ts`.
- Include OCR-only, screenshot-needed, no-Screenpipe, and privacy-denied fixtures.
- Required commands:
  - `pnpm typecheck`
  - `node --experimental-sqlite --import tsx --test tests/screenpipe-surface.test.ts tests/processor-runtime.test.ts tests/runtime-tick.test.ts`

## PR Done When

- Non-browser current context can be summarized and traced without relying on browser DOM.

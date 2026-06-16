# View Memory Processor UI

GitHub issue: https://github.com/junjiezhou1122/info/issues/11

## Problem

CLI inspection exists, but UI still lacks first-class exploration of Views, memory candidates, project current state, processor runs, and proactive inbox items.

## Scope

- Add or improve UI surfaces for View explorer, memory review inbox, project dashboard, processor traces, and proactive inbox.
- Keep UI dense and operational, not a marketing/landing page.

## Acceptance Criteria

- [ ] UI can list and inspect latest Views.
- [ ] UI can review memory candidates and show provenance.
- [ ] UI can show project.current and related tasks/decisions when available.
- [ ] UI can show processor run/report diagnostics.
- [ ] UI supports accept/reject/promote memory actions where policy allows.
- [ ] Empty/loading/error states are handled.
- [ ] Layout is readable on common side-panel widths.

## Verification

- Add UI/component tests or browser smoke tests, suggested: `tests/ui-view-memory-processor.test.ts` plus app-specific tests.
- Capture screenshots if visual changes are substantial.
- Required commands:
  - `pnpm typecheck`
  - `pnpm test`
  - UI build command if available.

## PR Done When

- A user can inspect and act on Views/memory without CLI.

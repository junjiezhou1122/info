# Chrome ACP Ambient UX

GitHub issue: https://github.com/junjiezhou1122/Metaflow/issues/7

## Problem

Chrome ACP has page capture, selection toolbar, writing suggestions, and side panel features, but ambient UX is not yet coherent enough. Suggestions need better layering, custom buttons, readable output, and feedback loops.

## Scope

- Refine ambient suggestion surfaces.
- Add custom prompt buttons for selection toolbar.
- Improve explain/translate/save/writing flows.
- Ensure feedback writes into the memory/view system.

## Acceptance Criteria

- [ ] Selection toolbar supports explain, translate, save, and user-configurable prompt buttons.
- [ ] Inline writing suggestions are non-intrusive and insert only on explicit user action.
- [ ] Dismiss/insert/edit feedback is recorded.
- [ ] Suggestions can be routed to side-panel inbox instead of popups.
- [ ] UI text is readable and does not overflow.
- [ ] No suggestion appears on sensitive/secret inputs.
- [ ] Chrome ACP tests cover content script and side panel paths.

## Verification

- Add/extend tests under `apps/chrome-acp/...` and root tests, suggested: `tests/chrome-acp-ambient-ux.test.ts`.
- Use screenshot/manual smoke evidence if needed.
- Required commands:
  - `pnpm typecheck`
  - `pnpm test`
  - Chrome ACP build command if available in package scripts.

## PR Done When

- The ambient flow is usable in Chrome and writes feedback into Info.

# Current Page Automation Router

GitHub issue: https://github.com/junjiezhou1122/Metaflow/issues/10

## Problem

Current-page automation has DOM/browser tools, vision fallback, Midscene experiments, and optional CDP/debugger mode, but there is no unified router that chooses the safest and most reliable tool for a requested action.

## Scope

- Implement a current-page automation planner/router.
- Prefer DOM/current-page tools.
- Use vision fallback only when DOM is insufficient.
- Keep CDP/debugger as opt-in advanced mode.
- Prevent opening new browser sessions when current-page operation is requested.

## Acceptance Criteria

- [ ] Router selects DOM/browser tools before vision.
- [ ] Vision fallback is used only with explicit need and configured model.
- [ ] CDP/debugger actions require advanced mode.
- [ ] Action attempts and outcomes are recorded.
- [ ] The router refuses sensitive domains/actions by policy.
- [ ] It does not open a new browser when current-page mode is requested.
- [ ] Tests cover DOM success, vision fallback, CDP disabled, and refusal.

## Verification

- Add tests, suggested: `tests/current-page-automation-router.test.ts`.
- Add Chrome ACP/proxy tests if router lives there.
- Required commands:
  - `pnpm typecheck`
  - `node --experimental-sqlite --import tsx --test tests/current-page-automation-router.test.ts`
  - Chrome ACP package tests/build if touched.

## PR Done When

- A current-page action can be traced from request -> selected tool -> result observation.

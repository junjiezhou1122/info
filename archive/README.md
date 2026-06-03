# Archive

This folder is for local legacy artifacts that are useful as historical
reference but are outside the active runtime/package boundary.

Archived code or prototypes must not be imported by `src/`, `packages/`,
`scripts/`, or `tests/`. If an archived artifact becomes active again, move it
back into the appropriate package first and add tests around the new boundary.

Current archive:

- `craft-reference/` — old static UI concepts and screenshots. These are kept
  as visual history only and are ignored by git because they are local reference
  assets, not runtime source.
- `dead-code/2026-05-package-view-shims/` — obsolete package-level
  `visual-views.ts` re-export shims. Active imports now use
  `packages/views/visual-frame/index.ts` and
  `packages/views/activity-block/index.ts` directly.
- `dead-code/2026-05-src-package-shims/` — obsolete `src/connectors/*` and
  package-backed `src/runtime/*` re-export shims. Active code imports connector
  and View packages from `packages/` directly.

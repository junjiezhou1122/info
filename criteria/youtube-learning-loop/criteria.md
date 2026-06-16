# YouTube Learning Loop

GitHub issue: https://github.com/junjiezhou1122/info/issues/8

## Problem

YouTube caption state and fragment ideas exist, but there is no complete learning loop from caption on/off, pause fragments, timestamps, difficult segments, and review queue.

## Scope

- Capture caption on/off intervals.
- Segment playback pauses into learning fragments.
- Align caption text with timestamps.
- Write difficult segments and review queue views.
- Keep Learn UI synchronized.

## Acceptance Criteria

- [ ] Caption open/close state is captured with timestamps.
- [ ] Pause/resume creates bounded fragments instead of one giant session.
- [ ] Caption text is aligned to video time.
- [ ] Difficult segments become `memory.language.difficult_segments`.
- [ ] Review queue views are generated and queryable.
- [ ] Learn tab displays the same state as stored Views.
- [ ] Duplicate fragments are deduped.

## Verification

- Add tests, suggested: `tests/youtube-learning-loop.test.ts`.
- Include caption toggle, pause fragment, duplicate, and review queue fixtures.
- Required commands:
  - `pnpm typecheck`
  - `node --experimental-sqlite --import tsx --test tests/youtube-learning-loop.test.ts tests/program-runtime.test.ts`
  - Chrome ACP relevant tests if touching extension code.

## PR Done When

- A YouTube learning session can be reconstructed from stored Views and observations.

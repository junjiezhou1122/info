#!/usr/bin/env bash
# evo benchmark: score = passing tests (max), outputs JSON
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_ROOT="$(pwd)"
TARGET_ROOT="${EVO_WORKTREE:-${EVO_BENCHMARK_ROOT:-}}"

if [ -z "$TARGET_ROOT" ]; then
  if [ -f "$CALLER_ROOT/package.json" ] && [ -d "$CALLER_ROOT/tests" ]; then
    TARGET_ROOT="$CALLER_ROOT"
  else
    TARGET_ROOT="$SCRIPT_ROOT"
  fi
fi

cd "$TARGET_ROOT"

shopt -s nullglob
TEST_FILES=(tests/*.test.ts)
shopt -u nullglob

OUTPUT=$(node --experimental-sqlite --import tsx --test "${TEST_FILES[@]}" 2>&1 || true)

PASS=$(echo "$OUTPUT" | awk '/^ℹ pass/ {sum+=$3} END {print sum+0}')
FAIL=$(echo "$OUTPUT" | awk '/^ℹ fail/ {sum+=$3} END {print sum+0}')

RESULT=$(printf '{"score": %s, "pass": %s, "fail": %s}' "$PASS" "$PASS" "$FAIL")

if [ -n "${EVO_RESULT_PATH:-}" ]; then
  ( set -o noclobber; : > "$EVO_RESULT_PATH" ) || { echo "result already claimed" >&2; exit 1; }
  printf '%s' "$RESULT" > "$EVO_RESULT_PATH.tmp"
  mv "$EVO_RESULT_PATH.tmp" "$EVO_RESULT_PATH"
else
  echo "$RESULT"
fi

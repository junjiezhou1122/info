#!/usr/bin/env bash
# evo benchmark: score = passing tests (max), outputs JSON
cd "$(dirname "$0")/.."

OUTPUT=$(node --experimental-sqlite --import tsx --test $(ls tests/*.test.ts | tr '\n' ' ') 2>&1 || true)

PASS=$(echo "$OUTPUT" | awk '/^ℹ pass/ {sum+=$3} END {print sum+0}')
FAIL=$(echo "$OUTPUT" | awk '/^ℹ fail/ {sum+=$3} END {print sum+0}')

RESULT="{\"score\": $PASS, \"pass\": $PASS, \"fail\": $FAIL}"

if [ -n "$EVO_RESULT_PATH" ]; then
  ( set -o noclobber; : > "$EVO_RESULT_PATH" ) || { echo "result already claimed" >&2; exit 1; }
  printf '%s' "$RESULT" > "$EVO_RESULT_PATH.tmp"
  mv "$EVO_RESULT_PATH.tmp" "$EVO_RESULT_PATH"
else
  echo "$RESULT"
fi

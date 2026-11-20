#!/usr/bin/env bash
# Stop hook: run the TypeScript typecheck; if it fails, block the stop so Claude fixes it.
input=$(cat)
# Avoid loops: if we already blocked once this stop cycle, let Claude stop.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -d node_modules ] || exit 0
if ! out=$(npm run -s typecheck 2>&1); then
  jq -n --arg r "$out" '{decision: "block", reason: ("npm run typecheck failed — fix these errors before finishing:\n" + $r)}'
fi
exit 0

#!/usr/bin/env bash
# PostToolUse | Edit|Write|NotebookEdit
#
# Blocking typecheck, but only for edits that can actually change types.
# The previous version of this hook ran a full `tsc --noEmit` after EVERY
# edit, including .md, .sql, .css and .json — several seconds of blocking
# work on a 400-file project for a file tsc never reads.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

case "$file" in
  *.ts|*.tsx|*.mts|*.cts) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$(npx --no-install tsc --noEmit 2>&1)
[ $? -eq 0 ] && exit 0

printf '%s' "$out" | python3 -c '
import json, sys
print(json.dumps({
    "decision": "block",
    "reason": "TypeScript errors detected (fix before continuing):\n" + sys.stdin.read(),
}))'

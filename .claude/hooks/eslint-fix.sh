#!/usr/bin/env bash
# PostToolUse | Edit|Write
#
# Auto-fix the ONE file that just changed. Never blocks: lint findings that
# --fix cannot repair are surfaced by `npm run lint`, not by interrupting a
# turn mid-edit. Silent on success by design.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
npx --no-install eslint --fix "$file" >/dev/null 2>&1 || true
exit 0

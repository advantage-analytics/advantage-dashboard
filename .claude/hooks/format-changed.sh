#!/usr/bin/env bash
# PostToolUse | Edit|Write|NotebookEdit
#
# Auto-fix and format the ONE file that just changed. Never blocks: findings
# --fix cannot repair are surfaced by `npm run lint`, not by interrupting a
# turn mid-edit. Silent on success by design.
#
# This is a CONVENIENCE, not the enforcement. It only runs inside Claude Code,
# so it does nothing for a Codex or Gemini teammate or a plain `git commit`.
# The enforcing copy is .githooks/pre-commit, which calls the same dispatcher.
# Keep them calling scripts/format-file.sh rather than duplicating its routing.
#
# Order matters: eslint --fix FIRST, then the formatter. `eslint --fix` can
# emit unformatted output (it rewrites nodes without reflowing them), so
# Prettier must have the last word. eslint-config-prettier is wired in as the
# final ESLint config, so the two never disagree about formatting anyway.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    npx --no-install eslint --fix "$file" >/dev/null 2>&1 || true ;;
esac

# Routing for every other language lives in one place, shared with the git
# hook. .sql and .toml are deliberately not formatted — see that script.
"$CLAUDE_PROJECT_DIR/scripts/format-file.sh" "$file" || true
exit 0

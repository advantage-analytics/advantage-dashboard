#!/usr/bin/env bash
# Two modes, one purpose: dashboard widgets never ship without their loading
# and empty states checked (.claude/skills/widget-states/SKILL.md).
#
#   PostToolUse | Edit|Write  — first edit of a dashboard .tsx per session
#                               injects a pointer to the widget-states skill.
#   PreToolUse  | Bash        — `git commit` / `git push` with dashboard .tsx
#                               changes is blocked until the skill has been run
#                               for the current diff (`mark` records that).
#   widget-states-gate.sh mark — called by the skill when its checklist passes.
#
# The receipt is keyed on a hash of the dashboard diff, so any widget edit
# after the check invalidates it.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
paths=(-- 'src/components/dashboard/*.tsx' 'src/app/dashboard/*.tsx')
receipt_dir="$root/.git"
[ -f "$receipt_dir" ] && receipt_dir=$(git rev-parse --git-dir)

diff_hash() {
  # Everything not yet on the upstream (or main): committed-unpushed + staged + unstaged.
  local base
  base=$(git merge-base HEAD '@{upstream}' 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || echo HEAD)
  git diff "$base" "${paths[@]}" | shasum | cut -d' ' -f1
}
has_widget_changes() {
  local base
  base=$(git merge-base HEAD '@{upstream}' 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || echo HEAD)
  [ -n "$(git diff --name-only "$base" "${paths[@]}")" ]
}
receipt="$receipt_dir/widget-states-receipt"

if [ "${1:-}" = "mark" ]; then
  diff_hash > "$receipt"
  echo "widget-states: recorded check for current dashboard diff"
  exit 0
fi

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
  printf '%s' "$cmd" | grep -Eq '(^|[;&| ])git( -C [^ ]+)? (commit|push)( |$)' || exit 0
  has_widget_changes || exit 0
  [ -f "$receipt" ] && [ "$(cat "$receipt")" = "$(diff_hash)" ] && exit 0
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Dashboard widget files changed since the last loading/empty-state check. Load the `widget-states` skill (.claude/skills/widget-states/SKILL.md), run its checklist on every touched widget, then run `.claude/hooks/widget-states-gate.sh mark` and retry."
    }
  }'
  exit 0
fi

file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
case "$file" in
  */src/components/dashboard/*.tsx|*/src/app/dashboard/*.tsx) ;;
  *) exit 0 ;;
esac
session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')
sentinel="${TMPDIR:-/tmp}/claude-widget-states-${session}"
[ -e "$sentinel" ] && exit 0
: > "$sentinel"
jq -n '{
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: "You edited a dashboard widget. Before committing, load the `widget-states` skill and confirm its loading (skeleton, no null Suspense fallback, streams settle) and empty (honest zero, no silent return null) states. git commit/push is gated on it. (Shown once per session.)"
  }
}'

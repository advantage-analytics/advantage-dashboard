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
#
# Every git call names its checkout with `-C "$dir"`. The hook process's own
# cwd is the session's project dir, which for a `.claude/worktrees/<name>`
# session is the MAIN checkout — another branch, with another session's
# uncommitted edits. Judging that diff blocks commits that touch no widget.
# So `$dir` comes from the payload's `cwd`, then from the command's own
# `cd <path> &&` / `git -C <path>` when it has one. `mark` has no payload and
# is run by hand, so there the caller's cwd is the checkout.
set -uo pipefail

paths=(-- 'src/components/dashboard/*.tsx' 'src/app/dashboard/*.tsx')
dir=$PWD

g() { git -C "$dir" "$@"; }

# Point $dir at a path named in the command, resolved against the current
# $dir. A path that is not a directory here (an unexpanded $VAR, a typo) is
# ignored rather than guessed at.
enter() {
  local p=$1
  case "$p" in \"*\" | \'*\') p=${p:1:${#p}-2} ;; esac
  case "$p" in
    '~') p=$HOME ;;
    '~/'*) p=$HOME/${p:2} ;;
    /*) ;;
    *) p=$dir/$p ;;
  esac
  [ -d "$p" ] && dir=$p
}

# Pathspecs are relative to where git runs, so settle on the checkout's root.
# Not a repository: nothing to gate.
settle() { dir=$(g rev-parse --show-toplevel 2>/dev/null) || exit 0; }

base() {
  g merge-base HEAD '@{upstream}' 2>/dev/null || g merge-base HEAD origin/main 2>/dev/null || echo HEAD
}
diff_hash() {
  # Everything not yet on the upstream (or main): committed-unpushed + staged + unstaged.
  g diff "$(base)" "${paths[@]}" | shasum | cut -d' ' -f1
}
has_widget_changes() {
  [ -n "$(g diff --name-only "$(base)" "${paths[@]}")" ]
}
# Per checkout: `.git` for the main one, `.git/worktrees/<name>` for a worktree.
receipt() { echo "$(g rev-parse --absolute-git-dir)/widget-states-receipt"; }

if [ "${1:-}" = "mark" ]; then
  settle
  diff_hash > "$(receipt)"
  echo "widget-states: recorded check for current dashboard diff"
  exit 0
fi

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
  path_re="(\"[^\"]+\"|'[^']+'|[^[:space:];&|]+)"
  git_re="(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+$path_re)?[[:space:]]+(commit|push)([[:space:]]|$)"
  cd_re="^[[:space:]]*cd[[:space:]]+$path_re[[:space:]]*(&&|;)"
  [[ $cmd =~ $git_re ]] || exit 0
  git_c=${BASH_REMATCH[3]:-}

  cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty')
  [ -n "$cwd" ] && [ -d "$cwd" ] && dir=$cwd
  [[ $cmd =~ $cd_re ]] && enter "${BASH_REMATCH[1]}"
  [ -n "$git_c" ] && enter "$git_c"
  settle

  has_widget_changes || exit 0
  r=$(receipt)
  [ -f "$r" ] && [ "$(cat "$r")" = "$(diff_hash)" ] && exit 0
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

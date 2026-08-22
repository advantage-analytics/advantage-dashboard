#!/usr/bin/env bash
# PostToolUse | Edit|Write
#
# Fires ONCE per session, the first time a React component under src/app or
# src/components is touched, and points Claude at the two skills that carry
# this project's React and design rules. A prose rule in CLAUDE.md is
# something Claude may or may not notice; injected context arrives at the
# moment the relevant file is open.
#
# Once per session, not once per edit: repeating this on every .tsx write
# would burn context and train Claude to ignore it.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')

case "$file" in
  *.tsx) ;;
  *) exit 0 ;;
esac
case "$file" in
  */src/app/*|*/src/components/*) ;;
  *) exit 0 ;;
esac

sentinel="${TMPDIR:-/tmp}/claude-react-nudge-${session}"
[ -e "$sentinel" ] && exit 0
: > "$sentinel"

python3 -c '
import json
print(json.dumps({
    "suppressOutput": True,
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": (
            "You are editing React components in this project. Before continuing:\n"
            "- Load the `vercel-react-best-practices` skill for React 19 / Next 16 "
            "performance rules (Server vs Client Components, data fetching, bundle cost).\n"
            "- `.skills/advantage-analytics-design/SKILL.md` is the authoritative design "
            "reference; primary buttons come from `advButton()` in src/lib/ui/adv-button.ts.\n"
            "- If this touches the dashboard, `docs/ui-revamp-guardrails.md` lists what the "
            "video pipeline needs from the UI and must not have changed.\n"
            "(Shown once per session.)"
        ),
    },
}))'

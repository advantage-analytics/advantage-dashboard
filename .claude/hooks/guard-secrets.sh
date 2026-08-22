#!/usr/bin/env bash
# PreToolUse | Read|Edit|Write|NotebookEdit|Bash
#
# .env.local holds SUPABASE_SERVICE_ROLE_KEY, AZURE_STORAGE_KEY,
# SPLITSTEP_WEBHOOK_SECRET and RESEND_API_KEY. .gitignore keeps them out of
# the repo; nothing kept them out of a transcript until this hook. Reading one
# is what leaks it, so this denies the read, not just the write.
#
# .env.example is the documented, committed template — always allowed.
set -uo pipefail

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')

deny() {
  python3 -c '
import json, sys
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": sys.argv[1],
}}))' "$1"
  exit 0
}

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
  # Strip every .env.example mention, then look for any remaining .env reference.
  stripped=${cmd//.env.example/}
  case "$stripped" in
    *.env.local*|*.env.production*|*.env.development*|*/.env*|*\ .env*|.env*)
      deny "Blocked: this command reads or writes a .env file holding live secrets (service-role key, Azure storage key, webhook secret). Use .env.example for anything about which variables exist. If you truly need a value, ask the user to supply it directly."
      ;;
  esac
  exit 0
fi

file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
base=$(basename -- "$file" 2>/dev/null || printf '')
case "$base" in
  .env.example) exit 0 ;;
  .env|.env.*)
    deny "Blocked: $base holds live secrets (service-role key, Azure storage key, webhook secret) and must not enter the transcript. .env.example documents every variable and is safe to read."
    ;;
esac
exit 0

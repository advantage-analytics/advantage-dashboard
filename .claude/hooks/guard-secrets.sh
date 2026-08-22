#!/usr/bin/env bash
# PreToolUse | Read|Edit|Write|NotebookEdit|Bash
#
# Keeps live credentials out of the transcript. Two classes of file:
#
#   .env*        — nothing but secrets. Always denied (.env.example excepted:
#                  it is the committed template and holds no values).
#   .mcp.json    — a config file that HAPPENS to hold credentials inline
#                  (the Figma server embeds its API key as a CLI arg). Denying
#                  it outright would block legitimate configuration work, so
#                  this asks instead, and only when the file really does
#                  contain something that looks like a key.
#
# The Bash branch is segment-aware on purpose. An earlier version matched the
# whole command string, so `[ -e .env.local ]` — an existence check that reads
# nothing — was refused the same as `cat .env.local`. It now splits the
# command on pipeline separators and only objects when a segment pairs a
# content-reading verb with a secret path.
set -uo pipefail

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // empty')

# Verbs that put file CONTENT somewhere it can be seen. Deliberately excludes
# ls/test/[/stat/find/rm/touch/mv, which reveal only that a path exists.
READERS='cat|head|tail|less|more|bat|nl|od|xxd|strings|grep|egrep|fgrep|rg|ag|awk|sed|cut|tr|sort|uniq|tee|base64|xargs|diff|cmp|cp|scp|rsync|curl|wget|source|python|python3|node|ruby|perl|php|jq|dotenv|printenv|export'

decide() { # decision, reason
  python3 -c '
import json, sys
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": sys.argv[1],
    "permissionDecisionReason": sys.argv[2],
}}))' "$1" "$2"
  exit 0
}

ENV_DENY="Blocked: this reads a .env file holding live secrets (service-role key, Azure storage key, webhook secret). .env.example documents every variable and is safe. If you need an actual value, ask the user for it directly."
MCP_ASK="\`.mcp.json\` contains an inline credential (an API key embedded in a server's arguments). Reading it puts that key in the transcript. To list configured servers without exposing anything, use: jq -r '.mcpServers | keys[]' .mcp.json — approve only if you need the full contents."

# Does .mcp.json actually hold a credential right now? A clean one is harmless.
mcp_has_secret() {
  local f=$1
  [ -f "$f" ] || return 1
  grep -qE '(figd_|sk_live_|sk_test_|rk_live_|ghp_|gho_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{16}|sbp_|eyJ[A-Za-z0-9_-]{20,})' "$f" 2>/dev/null && return 0
  # Generic: an api-key/token/secret/password assigned a long opaque value.
  grep -qEi '(api[_-]?key|token|secret|password)[^,}]{0,12}[:=][[:space:]]*"?[A-Za-z0-9_\-]{24,}' "$f" 2>/dev/null
}

# ---------------------------------------------------------------- Bash branch
if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')

  # Split on pipeline/list separators so each segment is judged on its own.
  # Only the segment that names the secret file decides the outcome.
  #
  # The trailing newline matters: `read` discards a final line that has none,
  # which silently skipped every single-segment command — `cat .env.local`
  # was allowed while `cat .env.local | base64` was denied.
  printf '%s\n' "$cmd" | tr '|;&\n' '\n\n\n\n' | while IFS= read -r seg; do
    stripped=${seg//.env.example/}
    if printf '%s' "$stripped" | grep -qE '(^|[[:space:]/"'"'"'=])\.env([.][A-Za-z0-9_]+)?([[:space:]"'"'"']|$)'; then
      if printf '%s' "$seg" | grep -qE "(^|[[:space:]|(])($READERS)([[:space:]]|$)"; then
        echo "DENY_ENV"
        break
      fi
    fi
    if printf '%s' "$seg" | grep -q '\.mcp\.json'; then
      if printf '%s' "$seg" | grep -qE "(^|[[:space:]|(])($READERS)([[:space:]]|$)"; then
        echo "ASK_MCP"
        break
      fi
    fi
  done > /tmp/.claude-guard-verdict.$$ 2>/dev/null

  verdict=$(cat /tmp/.claude-guard-verdict.$$ 2>/dev/null)
  rm -f /tmp/.claude-guard-verdict.$$

  case "$verdict" in
    *DENY_ENV*) decide deny "$ENV_DENY" ;;
    *ASK_MCP*)
      root=$(printf '%s' "$payload" | jq -r '.cwd // empty')
      mcp_has_secret "${root:-.}/.mcp.json" && decide ask "$MCP_ASK"
      ;;
  esac
  exit 0
fi

# ------------------------------------------------- File-tool branch (by path)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
base=$(basename -- "$file" 2>/dev/null || printf '')

case "$base" in
  .env.example) exit 0 ;;
  .env|.env.*) decide deny "Blocked: $base holds live secrets and must not enter the transcript. .env.example documents every variable and is safe to read." ;;
  .mcp.json) mcp_has_secret "$file" && decide ask "$MCP_ASK" ;;
esac
exit 0

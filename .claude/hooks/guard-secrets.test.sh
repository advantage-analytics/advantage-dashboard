#!/usr/bin/env bash
# Test cases for guard-secrets.sh. Run: bash .claude/hooks/guard-secrets.test.sh
#
# Lives beside the hook because the hook's failure modes are subtle in both
# directions: too loose leaks a key, too tight blocks an existence check and
# the agent starts working around its own guard.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
GUARD=.claude/hooks/guard-secrets.sh

pass=0; fail=0

# check <expected: allow|deny|ask> <label> <payload-json>
check() {
  local want=$1 label=$2 payload=$3 out got
  out=$(printf '%s' "$payload" | "$GUARD" 2>/dev/null)
  if [ -z "$out" ]; then
    got=allow
  else
    got=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "malformed"')
  fi
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); printf '  ok    %-52s -> %s\n' "$label" "$got"
  else
    fail=$((fail+1)); printf '  FAIL  %-52s -> %s (wanted %s)\n' "$label" "$got" "$want"
  fi
}

# Second arg overrides cwd, so .mcp.json cases can point at a fixture instead
# of depending on whatever the real repo happens to contain today.
bash_payload() { jq -nc --arg c "$1" --arg cwd "${2:-$PWD}" '{tool_name:"Bash",tool_input:{command:$c},cwd:$cwd}'; }
file_payload() { jq -nc --arg t "$1" --arg f "$2" '{tool_name:$t,tool_input:{file_path:$f}}'; }

echo "-- env files: reads must be denied --"
check deny  'cat .env.local'            "$(bash_payload 'cat .env.local')"
check deny  'head -5 .env.local'        "$(bash_payload 'head -5 .env.local')"
check deny  'grep KEY .env.local'       "$(bash_payload 'grep SUPABASE .env.local')"
check deny  'source .env'               "$(bash_payload 'source .env')"
check deny  'cp .env.local /tmp/x'      "$(bash_payload 'cp .env.local /tmp/x')"
check deny  'cat .env.production'       "$(bash_payload 'cat .env.production')"
check deny  'reader later in pipeline'  "$(bash_payload 'cat .env.local | base64')"

echo "-- env files: non-reads must be allowed (the old false positive) --"
check allow 'test -e .env.local'        "$(bash_payload '[ -e .env.local ] && echo yes')"
check allow 'ls -la .env.local'         "$(bash_payload 'ls -la .env.local')"
check allow 'for-loop listing the path' "$(bash_payload 'for f in a.md .env.local; do [ -e "$f" ] && echo "$f"; done')"
check allow 'reader in a SEPARATE seg'  "$(bash_payload '[ -e .env.local ] && echo hi; diff -q a b')"

echo "-- .env.example is always fine --"
check allow 'cat .env.example'          "$(bash_payload 'cat .env.example')"
check allow 'grep .env.example'         "$(bash_payload 'grep -n STRIPE .env.example')"

echo "-- unrelated commands --"
check allow 'ls src'                    "$(bash_payload 'ls src')"
check allow 'npm run lint'              "$(bash_payload 'npm run lint')"
check allow 'git status'                "$(bash_payload 'git status --short')"

echo "-- file tools --"
check deny  'Read .env.local'           "$(file_payload Read  "$PWD/.env.local")"
check deny  'Write .env.production'     "$(file_payload Write "$PWD/.env.production")"
check allow 'Read .env.example'         "$(file_payload Read  "$PWD/.env.example")"
check allow 'Edit src/proxy.ts'         "$(file_payload Edit  "$PWD/src/proxy.ts")"

echo "-- .mcp.json: depends on whether it holds a credential --"
tmp=$(mktemp -d)
printf '{"mcpServers":{"a":{"type":"http","url":"https://example.com/mcp"}}}\n' > "$tmp/clean.json"
printf '{"mcpServers":{"a":{"args":["--figma-api-key=figd_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]}}}\n' > "$tmp/dirty.json"
cp "$tmp/clean.json" "$tmp/.mcp.json"
check allow 'Read a CLEAN .mcp.json'    "$(file_payload Read "$tmp/.mcp.json")"
cp "$tmp/dirty.json" "$tmp/.mcp.json"
check ask   'Read a .mcp.json with key' "$(file_payload Read "$tmp/.mcp.json")"
check ask   'cat a .mcp.json with key'  "$(bash_payload 'cat .mcp.json' "$tmp")"
check allow 'jq keys, even when dirty'  "$(bash_payload "jq -r '.mcpServers | keys[]' .mcp.json" "$tmp")"
cp "$tmp/clean.json" "$tmp/.mcp.json"
check allow 'cat a CLEAN .mcp.json'     "$(bash_payload 'cat .mcp.json' "$tmp")"
rm -rf "$tmp"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

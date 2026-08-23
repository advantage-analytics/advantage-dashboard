#!/usr/bin/env bash
# Test cases for bootstrap-worktree.sh. Run: bash .claude/hooks/bootstrap-worktree.test.sh
#
# Every fixture is a throwaway repo under mktemp. The real .env.local is never
# read, linked, or touched — a test for a secrets-adjacent hook that used the
# live file would be worse than no test at all.
set -uo pipefail
HOOK=$(cd "$(dirname "$0")" && pwd)/bootstrap-worktree.sh
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

pass=0; fail=0
n=0

ok() { # <exit-status> <label>
  if [ "$1" = 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$2"
  else fail=$((fail+1)); printf '  FAIL  %s\n' "$2"; fi
}

# Builds a main checkout plus one nested worktree, mirroring the real layout
# where worktrees live under .claude/worktrees/ inside the main checkout.
# Echoes "<main-root> <worktree-root>".
#
# Takes the fixture number as $1 rather than incrementing a global counter
# itself: every call site invokes this via `$(fixture ...)`, and command
# substitution always forks a subshell, so a plain `n=$((n+1))` inside the
# function would never be visible to the caller — every call would silently
# reuse f1, leaking state (like a symlink from an earlier section) between
# fixtures that are meant to be independent.
fixture() {
  local n="$1"
  local root="$TMPROOT/f$n"
  mkdir -p "$root"
  # Physical path: on macOS mktemp -d returns /var/..., a symlink to
  # /private/var/..., while git rev-parse returns the resolved path. Without
  # this the symlink-target assertion compares the two and fails.
  root=$(cd "$root" && pwd -P)
  git init -q "$root/main"
  git -C "$root/main" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  git -C "$root/main" worktree add -q "$root/main/wt" -b "wt-$n" >/dev/null 2>&1
  printf '%s %s\n' "$root/main" "$root/main/wt"
}

echo "-- main checkout: no-op --"
n=$((n+1)); read -r MAIN WT <<<"$(fixture "$n")"
printf 'TOKEN=canary-value\n' > "$MAIN/.env.local"
out=$(cd "$MAIN" && printf '{}' | "$HOOK" 2>/dev/null); rc=$?
[ "$rc" -eq 0 ] && [ -z "$out" ]; ok $? "silent, exit 0, in the main checkout"

echo "-- worktree without .env.local: symlinked --"
out=$(cd "$WT" && printf '{}' | "$HOOK" 2>/dev/null); rc=$?
[ "$rc" -eq 0 ]; ok $? "exits 0"
[ -L "$WT/.env.local" ]; ok $? "creates a symlink"
[ "$(readlink "$WT/.env.local")" = "$MAIN/.env.local" ]; ok $? "points at the main checkout"
printf '%s' "$out" | grep -q 'symlinked'; ok $? "reports what it did"
printf '%s' "$out" | grep -q 'npm ci'; ok $? "flags the missing node_modules"
! printf '%s' "$out" | grep -q 'canary-value'; ok $? "never echoes file contents"

echo "-- worktree with its own real file: left alone --"
n=$((n+1)); read -r MAIN WT <<<"$(fixture "$n")"
printf 'FROM_MAIN=1\n' > "$MAIN/.env.local"
printf 'FROM_WORKTREE=1\n' > "$WT/.env.local"
out=$(cd "$WT" && printf '{}' | "$HOOK" 2>/dev/null)
[ ! -L "$WT/.env.local" ]; ok $? "does not replace a real file with a link"
[ "$(sed -n 1p "$WT/.env.local")" = "FROM_WORKTREE=1" ]; ok $? "leaves contents unchanged"
printf '%s' "$out" | grep -q 'already present'; ok $? "says it left it alone"

echo "-- worktree, main checkout has nothing to link --"
n=$((n+1)); read -r MAIN WT <<<"$(fixture "$n")"
out=$(cd "$WT" && printf '{}' | "$HOOK" 2>/dev/null); rc=$?
[ "$rc" -eq 0 ]; ok $? "exits 0"
[ ! -e "$WT/.env.local" ]; ok $? "creates nothing"

echo "-- outside a git repo --"
mkdir -p "$TMPROOT/bare"
out=$(cd "$TMPROOT/bare" && printf '{}' | "$HOOK" 2>/dev/null); rc=$?
[ "$rc" -eq 0 ] && [ -z "$out" ]; ok $? "silent, exit 0"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

#!/usr/bin/env bash
# Test cases for pr-check-receipt.sh. Run: bash .claude/hooks/pr-check-receipt.test.sh
#
# Every fixture is a throwaway repo under mktemp with a hermetic git config.
# The real receipts file at <git-common-dir>/claude/ is never read or written —
# a test for the thing that records whether the gate ran must not be able to
# forge a receipt for this repo.
set -uo pipefail
BIN=$(cd "$(dirname "$0")" && pwd)/pr-check-receipt.sh
TMPROOT=$(mktemp -d)
TMPROOT=$(cd "$TMPROOT" && pwd -P)
trap 'rm -rf "$TMPROOT"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t
export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

pass=0; fail=0
ok() { # <exit-status> <label>
  if [ "$1" = 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$2"
  else fail=$((fail+1)); printf '  FAIL  %s\n' "$2"; fi
}

# The index is a PARAMETER, not a global counter. fixture() is called as
# $(fixture "$n"), which forks a subshell — an increment inside it would never
# reach the caller, and every test group would silently share one directory.
# (bootstrap-worktree.test.sh carries the same note for the same reason.)
# The increment must be its own statement in the PARENT shell —
# wrapping it in a helper called as $(helper) just moves the bug.
n=0
fixture() { # $1 = index; echoes the repo path
  local root="$TMPROOT/f$1"
  mkdir -p "$root"
  git init -q -b main "$root/repo" 2>/dev/null
  git -C "$root/repo" commit -q --allow-empty -m init
  printf '%s\n' "$root/repo"
}
receipts() { printf '%s\n' "$1/.git/claude/pr-check-receipts.json"; }
jqf() { python3 -c 'import json,sys; print(eval("d"+sys.argv[2], {"d": json.load(open(sys.argv[1]))}))' "$1" "$2"; }

echo "-- record: creates the file, keyed on the real HEAD --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note "first" >/dev/null 2>&1 )
ok $? "exits 0"
[ -f "$(receipts "$R")" ]; ok $? "creates <git-common-dir>/claude/pr-check-receipts.json"
head=$(git -C "$R" rev-parse HEAD)
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['head_sha']")" = "$head" ]; ok $? "head_sha equals git rev-parse HEAD"
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['verdict']")" = "ready" ]; ok $? "verdict round-trips"
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['reviewed']")" = "branch-range" ]; ok $? "reviewed round-trips"
[ "$(jqf "$(receipts "$R")" "['version']")" = "1" ]; ok $? "carries a schema version"

echo "-- record: appends, never truncates --"
( cd "$R" && git commit -q --allow-empty -m second && "$BIN" record --verdict not-ready --reviewed branch-range --note "second" >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" "['receipts'].__len__()")" = "2" ]; ok $? "two entries after a second record"
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['note']")" = "first" ]; ok $? "the first entry is preserved"
[ "$(jqf "$(receipts "$R")" "['receipts'][1]['verdict']")" = "not-ready" ]; ok $? "not-ready round-trips"

echo "-- tree_dirty is derived from git, not passed in --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note clean >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['tree_dirty']")" = "False" ]; ok $? "false on a clean tree"
printf 'x\n' > "$R/dirt.txt"
( cd "$R" && "$BIN" record --verdict ready --reviewed working-tree --note dirty >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" "['receipts'][1]['tree_dirty']")" = "True" ]; ok $? "true when the tree is dirty"

echo "-- ran / skipped are recorded --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note n \
    --ran lint,tsc,test --skipped "rls-boundary-reviewer: no data surface" >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['ran']")" = "['lint', 'tsc', 'test']" ]; ok $? "ran splits on commas"
"$BIN" show 2>/dev/null >/dev/null # smoke: show must not explode outside a fixture
( cd "$R" && "$BIN" show 2>/dev/null ) | grep -q 'rls-boundary-reviewer'; ok $? "show surfaces what was skipped"

echo "-- cross-worktree: written in a worktree, read from the main checkout --"
n=$((n+1)); R=$(fixture "$n")
git -C "$R" worktree add -q "$R/wt" -b feature >/dev/null 2>&1
( cd "$R/wt" && "$BIN" record --verdict ready --reviewed branch-range --note "from the worktree" >/dev/null 2>&1 )
ok $? "record succeeds from a linked worktree"
[ -f "$(receipts "$R")" ]; ok $? "lands in the SHARED git-common-dir, not the worktree"
[ ! -e "$R/wt/.git/claude/pr-check-receipts.json" ]; ok $? "does not create a per-worktree copy"
( cd "$R" && "$BIN" show 2>/dev/null ) | grep -q 'from the worktree'; ok $? "the main checkout can read it"

echo "-- corrupt file: fails loudly, destroys nothing --"
n=$((n+1)); R=$(fixture "$n")
mkdir -p "$R/.git/claude"
printf '{{{garbage' > "$(receipts "$R")"
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note x >/dev/null 2>&1 )
[ $? -ne 0 ]; ok $? "exits non-zero on a corrupt receipts file"
grep -q 'garbage' "$(receipts "$R")"; ok $? "leaves the corrupt file intact rather than overwriting it"

echo "-- cap: keeps the newest 100, drops oldest first --"
n=$((n+1)); R=$(fixture "$n")
for i in $(seq 1 103); do
  ( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note "n$i" >/dev/null 2>&1 )
done
[ "$(jqf "$(receipts "$R")" "['receipts'].__len__()")" = "100" ]; ok $? "caps at 100 entries"
[ "$(jqf "$(receipts "$R")" "['receipts'][0]['note']")" = "n4" ]; ok $? "drops the oldest first"
[ "$(jqf "$(receipts "$R")" "['receipts'][-1]['note']")" = "n103" ]; ok $? "keeps the newest"

echo "-- show: a working-tree receipt must not read as a gated commit --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed working-tree --note wt >/dev/null 2>&1 )
out_wt=$( cd "$R" && "$BIN" show 2>/dev/null )
n=$((n+1)); R2=$(fixture "$n")
( cd "$R2" && "$BIN" record --verdict ready --reviewed branch-range --note br >/dev/null 2>&1 )
out_br=$( cd "$R2" && "$BIN" show 2>/dev/null )
[ "$out_wt" != "$out_br" ]; ok $? "renders differently from a branch-range receipt"
printf '%s' "$out_wt" | grep -qi 'working tree'; ok $? "says the working tree was reviewed, not the commit"

echo "-- argument validation --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict maybe --reviewed branch-range --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "rejects an unknown verdict"
( cd "$R" && "$BIN" record --verdict ready --reviewed sideways --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "rejects an unknown --reviewed"
( cd "$R" && "$BIN" record --verdict ready --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "requires --reviewed"
( cd "$TMPROOT" && "$BIN" record --verdict ready --reviewed branch-range --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "refuses outside a git repo"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

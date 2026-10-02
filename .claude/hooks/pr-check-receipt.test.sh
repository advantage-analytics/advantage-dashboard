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
jqf() { jq -c -r "$2" "$1"; }   # -c so arrays compare on one line, -r so strings come out bare

echo "-- record: creates the file, keyed on the real HEAD --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note "first" >/dev/null 2>&1 )
ok $? "exits 0"
[ -f "$(receipts "$R")" ]; ok $? "creates <git-common-dir>/claude/pr-check-receipts.json"
head=$(git -C "$R" rev-parse HEAD)
[ "$(jqf "$(receipts "$R")" '.receipts[0].head_sha')" = "$head" ]; ok $? "head_sha equals git rev-parse HEAD"
[ "$(jqf "$(receipts "$R")" '.receipts[0].verdict')" = "ready" ]; ok $? "verdict round-trips"
[ "$(jqf "$(receipts "$R")" '.receipts[0].reviewed')" = "branch-range" ]; ok $? "reviewed round-trips"
[ "$(jqf "$(receipts "$R")" '.version')" = "1" ]; ok $? "carries a schema version"

echo "-- record: appends, never truncates --"
( cd "$R" && git commit -q --allow-empty -m second && "$BIN" record --verdict not-ready --reviewed branch-range --note "second" >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts | length')" = "2" ]; ok $? "two entries after a second record"
[ "$(jqf "$(receipts "$R")" '.receipts[0].note')" = "first" ]; ok $? "the first entry is preserved"
[ "$(jqf "$(receipts "$R")" '.receipts[1].verdict')" = "not-ready" ]; ok $? "not-ready round-trips"

echo "-- tree_dirty is derived from git, not passed in --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note clean >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts[0].tree_dirty')" = "false" ]; ok $? "false on a clean tree"
printf 'x\n' > "$R/dirt.txt"
( cd "$R" && "$BIN" record --verdict ready --reviewed working-tree --note dirty >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts[1].tree_dirty')" = "true" ]; ok $? "true when the tree is dirty"

echo "-- ran / skipped are recorded --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note n \
    --ran lint,tsc,test --skipped "rls-boundary-reviewer: no data surface" >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts[0].ran')" = '["lint","tsc","test"]' ]; ok $? "ran splits on commas"
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
mkdir -p "$R/.git/claude"
python3 -c "
import json, sys
json.dump({'version': 1, 'receipts': [
    {'head_sha': '0'*40, 'base_sha': None, 'branch': 'main', 'verdict': 'ready',
     'reviewed': 'branch-range', 'tree_dirty': False, 'at': '2026-01-01T00:00:00Z',
     'ran': [], 'skipped': [], 'note': 'n%d' % i} for i in range(1, 100)]},
    open(sys.argv[1], 'w'))
" "$(receipts "$R")"
for i in 100 101 102 103; do
  ( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note "n$i" >/dev/null 2>&1 )
done
[ "$(jqf "$(receipts "$R")" '.receipts | length')" = "100" ]; ok $? "caps at 100 entries"
[ "$(jqf "$(receipts "$R")" '.receipts[0].note')" = "n4" ]; ok $? "drops the oldest first"
[ "$(jqf "$(receipts "$R")" '.receipts[-1].note')" = "n103" ]; ok $? "keeps the newest"

echo "-- show: a working-tree receipt must not read as a gated commit --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed working-tree --note wt >/dev/null 2>&1 )
out_wt=$( cd "$R" && "$BIN" show 2>/dev/null )
n=$((n+1)); R2=$(fixture "$n")
( cd "$R2" && "$BIN" record --verdict ready --reviewed branch-range --note br >/dev/null 2>&1 )
out_br=$( cd "$R2" && "$BIN" show 2>/dev/null )
[ "$out_wt" != "$out_br" ]; ok $? "renders differently from a branch-range receipt"
printf '%s' "$out_wt" | grep -qi 'working tree'; ok $? "says the working tree was reviewed, not the commit"

echo "-- show: a receipt whose commit is gone must be LOUDER, not quieter --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note gone >/dev/null 2>&1 )
python3 -c "
import json, sys
f = sys.argv[1]
d = json.load(open(f))
d['receipts'][-1]['head_sha'] = 'deadbeef' * 5
json.dump(d, open(f, 'w'), indent=2)
" "$(receipts "$R")"
out=$( cd "$R" && "$BIN" show 2>/dev/null )
printf '%s' "$out" | grep -q 'not in this repository'; ok $? "says the commit is not in this repository"
( cd "$R" && "$BIN" show >/dev/null 2>&1 ); ok $? "still exits 0"

echo "-- --base is a request, not a hint --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note seed >/dev/null 2>&1 )
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note typo --base "orign/main" >/dev/null 2>&1 )
[ $? -ne 0 ]; ok $? "an unresolvable --base fails loudly instead of substituting"
[ "$(jqf "$(receipts "$R")" '.receipts | length')" = "1" ]; ok $? "and records nothing"
git -C "$R" branch -q feature
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note ok --base feature >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts[-1].base_sha')" = "$(git -C "$R" merge-base HEAD feature)" ]; ok $? "a resolvable --base is honoured"

echo "-- --ran is parsed like --skipped --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note w --ran "lint, tsc, test" >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.receipts[0].ran')" = '["lint","tsc","test"]' ]; ok $? "strips whitespace around comma-separated entries"

echo "-- regressions the verifier caught --"
n=$((n+1)); R=$(fixture "$n")
# A versionless file must be repaired, not silently left versionless.
mkdir -p "$R/.git/claude"
printf '{"receipts": []}\n' > "$(receipts "$R")"
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note v >/dev/null 2>&1 )
[ "$(jqf "$(receipts "$R")" '.version')" = "1" ]; ok $? "repairs a receipts file that has no version key"

# An explicitly-passed empty --base is still explicit. A wrapper doing
# --base "$x" with x unset is the shape that hit the original bug.
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note e --base "" >/dev/null 2>&1 )
[ $? -ne 0 ]; ok $? "an explicitly empty --base fails rather than falling back"

# A lone flag used to spin the arg loop forever.
n=$((n+1)); R=$(fixture "$n")
# Job-control notices are suppressed so a killed watchdog cannot leak a
# "Killed: 9" line into the suite's output — the output must stay pristine.
set +m
( cd "$R" && "$BIN" record --verdict ready --reviewed branch-range --note x --base >/dev/null 2>&1 ) &
pid=$!
( sleep 5; kill "$pid" 2>/dev/null ) 2>/dev/null & watchdog=$!
wait "$pid" 2>/dev/null; rc=$?
{ kill "$watchdog"; wait "$watchdog"; } 2>/dev/null
set -m 2>/dev/null || true
[ "$rc" -eq 1 ]; ok $? "a flag with no value exits 1 instead of hanging"

# rev-list count 0 means HEAD is at OR BEHIND the receipt. Only "at" is clean.
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && git commit -q --allow-empty -m second && "$BIN" record --verdict ready --reviewed branch-range --note tip >/dev/null 2>&1 )
git -C "$R" reset -q --hard HEAD~1
out=$( cd "$R" && "$BIN" show 2>/dev/null )
printf '%s' "$out" | grep -q 'HEAD is behind'; ok $? "warns when HEAD is behind the receipt's commit"

echo "-- argument validation --"
n=$((n+1)); R=$(fixture "$n")
( cd "$R" && "$BIN" record --verdict maybe --reviewed branch-range --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "rejects an unknown verdict"
( cd "$R" && "$BIN" record --verdict ready --reviewed sideways --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "rejects an unknown --reviewed"
( cd "$R" && "$BIN" record --verdict ready --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "requires --reviewed"
( cd "$TMPROOT" && "$BIN" record --verdict ready --reviewed branch-range --note x >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "refuses outside a git repo"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

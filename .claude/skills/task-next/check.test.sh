#!/usr/bin/env bash
# Test cases for check.sh. Run: bash .claude/skills/task-next/check.test.sh
#
# Every fixture is a throwaway repo under mktemp with a hermetic git config,
# checked out on a named branch so slug() has something real to derive from.
set -uo pipefail
BIN=$(cd "$(dirname "$0")" && pwd)/check.sh
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

n=0
fixture() { # $1 = index, $2 = branch name; echoes the repo path
  local root="$TMPROOT/f$1"
  mkdir -p "$root/repo"
  git init -q -b "$2" "$root/repo" 2>/dev/null
  git -C "$root/repo" commit -q --allow-empty -m init
  printf '%s\n' "$root/repo"
}

echo "-- slug --"
n=$((n+1)); R=$(fixture "$n" "claude/example-branch-abc123")
out=$( cd "$R" && "$BIN" slug 2>&1 ); [ "$out" = "claude-example-branch-abc123" ]; ok $? "derives slug from branch name, / -> -"

n=$((n+1)); R=$(fixture "$n" "main")
( cd "$R" && git checkout -q --detach >/dev/null 2>&1 )
( cd "$R" && "$BIN" slug >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "fails on detached HEAD"

echo "-- queue-paths --"
n=$((n+1)); R=$(fixture "$n" "my-branch")
out=$( cd "$R" && "$BIN" queue-paths 2>&1 )
[ "$out" = ".claude/tasks/my-branch.md .claude/tasks/my-branch.log.md" ]; ok $? "prints queue and log paths for the slug"

echo "-- lint: no queue file is not an error --"
n=$((n+1)); R=$(fixture "$n" "empty-branch")
( cd "$R" && "$BIN" lint >/dev/null 2>&1 ); ok $? "exits 0 when there is no queue file yet"

echo "-- lint: a well-formed queue+log pair passes --"
n=$((n+1)); R=$(fixture "$n" "good-branch")
mkdir -p "$R/.claude/tasks"
cat >"$R/.claude/tasks/good-branch.md" <<'MD'
# Tasks — good-branch

## T1 · Do a thing

- **status:** todo
- **files:** src/example.ts
- **done when:**
  - [ ] it works
MD
cat >"$R/.claude/tasks/good-branch.log.md" <<'MD'
# Run log — good-branch
MD
( cd "$R" && "$BIN" lint >/dev/null 2>&1 ); ok $? "passes a well-formed queue"

echo "-- lint: queue with no log sibling fails --"
n=$((n+1)); R=$(fixture "$n" "orphan-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks — orphan-branch\n\n## T1 · x\n\n- **status:** todo\n' >"$R/.claude/tasks/orphan-branch.md"
( cd "$R" && "$BIN" lint >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "fails when the log sibling is missing"

echo "-- lint: a heading without the middle dot fails --"
n=$((n+1)); R=$(fixture "$n" "hyphen-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks — hyphen-branch\n\n## T1 - Do a thing\n\n- **status:** todo\n' >"$R/.claude/tasks/hyphen-branch.md"
printf '# Run log\n' >"$R/.claude/tasks/hyphen-branch.log.md"
out=$( cd "$R" && "$BIN" lint 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails on a hyphen instead of a middle dot"
printf '%s' "$out" | grep -q "middle-dot"; ok $? "names the missing middle-dot"

echo "-- lint: an unknown status value fails --"
n=$((n+1)); R=$(fixture "$n" "badstatus-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks\n\n## T1 · x\n\n- **status:** maybe\n' >"$R/.claude/tasks/badstatus-branch.md"
printf '# Run log\n' >"$R/.claude/tasks/badstatus-branch.log.md"
out=$( cd "$R" && "$BIN" lint 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails on an unrecognized status value"
printf '%s' "$out" | grep -q "unknown status"; ok $? "names the bad status"

echo "-- lint: a done task's id in both queue and log is NOT a duplicate --"
n=$((n+1)); R=$(fixture "$n" "done-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks\n\n## T1 · finished work\n\n- **status:** done\n' >"$R/.claude/tasks/done-branch.md"
printf '# Run log\n\n## T1 · finished work — done\n' >"$R/.claude/tasks/done-branch.log.md"
( cd "$R" && "$BIN" lint >/dev/null 2>&1 ); ok $? "passes — a done task legitimately keeps its heading in both files"

echo "-- lint: a blocked-then-retried id appearing twice in the log is NOT a duplicate --"
n=$((n+1)); R=$(fixture "$n" "retry-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks\n\n## T1 · retried work\n\n- **status:** done\n' >"$R/.claude/tasks/retry-branch.md"
printf '# Run log\n\n## T1 · retried work — blocked\n\n## T1 · retried work — done (unblocked)\n' >"$R/.claude/tasks/retry-branch.log.md"
( cd "$R" && "$BIN" lint >/dev/null 2>&1 ); ok $? "passes — the log may record the same id twice across a blocked-then-retried run"

echo "-- lint: the same id appearing twice WITHIN the queue file fails --"
n=$((n+1)); R=$(fixture "$n" "realdupe-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks\n\n## T1 · first copy\n\n- **status:** todo\n\n## T1 · second copy\n\n- **status:** todo\n' >"$R/.claude/tasks/realdupe-branch.md"
printf '# Run log\n' >"$R/.claude/tasks/realdupe-branch.log.md"
out=$( cd "$R" && "$BIN" lint 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails when the same id appears twice in the queue file itself"
printf '%s' "$out" | grep -q "duplicate task id"; ok $? "names the duplicate"

echo "-- lint: a needs: id that resolves nowhere is a note, not a failure --"
n=$((n+1)); R=$(fixture "$n" "dangling-branch")
mkdir -p "$R/.claude/tasks"
printf '# Tasks\n\n## T2 · waits on a typo\n\n- **status:** todo\n- **needs:** T99\n' >"$R/.claude/tasks/dangling-branch.md"
printf '# Run log\n' >"$R/.claude/tasks/dangling-branch.log.md"
out=$( cd "$R" && "$BIN" lint 2>&1 ); rc=$?
[ "$rc" -eq 0 ]; ok $? "still exits 0 (a dangling needs: is a note, task-next itself just waits)"
printf '%s' "$out" | grep -q "does not resolve"; ok $? "surfaces the dangling needs: as a note"

echo "-- preflight --"
n=$((n+1)); R=$(fixture "$n" "preflight-branch")
mkdir -p "$R/node_modules"
out=$( cd "$R" && "$BIN" preflight 2>&1 ); [ "$out" = "ok    node_modules present" ]; ok $? "reports present node_modules without running npm ci"

echo "-- surfaces --"
n=$((n+1)); R=$(fixture "$n" "surfaces-branch")
mkdir -p "$R/src/app/dashboard/matches" "$R/supabase/migrations"
: >"$R/src/app/dashboard/matches/page.tsx"
: >"$R/supabase/migrations/20260101000000_x.sql"
( cd "$R" && git add -A )
out=$( cd "$R" && "$BIN" surfaces 2>&1 )
printf '%s' "$out" | grep -q "pipeline-guardrails-reviewer: needed"; ok $? "flags the dashboard surface from a staged new file"
printf '%s' "$out" | grep -q "rls-boundary-reviewer: needed"; ok $? "flags the supabase surface from a staged new file"

n=$((n+1)); R=$(fixture "$n" "no-surfaces-branch")
mkdir -p "$R/src/lib/other"
: >"$R/src/lib/other/util.ts"
( cd "$R" && git add -A )
out=$( cd "$R" && "$BIN" surfaces 2>&1 )
printf '%s' "$out" | grep -q "no guardrail surface touched"; ok $? "reports no surface when nothing sensitive is touched"

echo "-- clean --"
n=$((n+1)); R=$(fixture "$n" "clean-branch")
( cd "$R" && "$BIN" clean >/dev/null 2>&1 ); ok $? "exits 0 on a clean tree"

n=$((n+1)); R=$(fixture "$n" "dirty-branch")
: >"$R/untracked.txt"
( cd "$R" && "$BIN" clean >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "exits non-zero when the tree has an untracked file"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

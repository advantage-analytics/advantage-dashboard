#!/usr/bin/env bash
# NOT a hook — a helper the task-next skill shells out to at specific steps.
# It lives beside SKILL.md rather than in .claude/hooks/ because it is
# specific to this one skill's mechanics, not a session-wide concern;
# .gitignore:70-71 already re-includes this whole skill directory
# recursively, so nothing extra is needed to track it.
#
# Wraps the deterministic half of task-next's steps 1, 2, 3, 5a and 6 — the
# parts that are pure mechanics, not judgment. Everything that needs
# judgment (which subagent to dispatch, how to interpret a reviewer's prose
# findings, what to write in a log entry) stays in SKILL.md.
#
# `surfaces` is the exception: its caller is /pr-check, not task-next. It
# stayed here because it is tested here and shares the slug/queue plumbing.
#
# Subcommands:
#   slug                 print the branch-derived queue slug, or fail loudly
#                        on detached HEAD
#   queue-paths          print "<queue-file> <log-file>" for this branch
#   lint                 validate the queue+log task-block grammar
#   preflight            ensure node_modules exists (npm ci if not)
#   gate                 run lint, typecheck, test; handle the stale
#                        .next/types false-failure; print PASS or FAIL
#   surfaces [<range>]   print which guardrail reviewers a change is due —
#                        a git range if given, else the working tree
#   clean                fail if the working tree is not clean
#
# Exit status is always meaningful: 0 for the happy path, 1 otherwise. Every
# subcommand writes a one-line human-readable verdict to stdout.
set -uo pipefail

cmd=${1:-}
shift || true

die() { printf 'check.sh: %s\n' "$1" >&2; exit 1; }

slug() {
  local branch
  branch=$(git branch --show-current 2>/dev/null)
  [ -n "$branch" ] || die "detached HEAD — cannot derive a queue slug, do not guess one"
  printf '%s\n' "${branch//\//-}"
}

queue_paths() {
  local s
  s=$(slug) || exit 1
  printf '.claude/tasks/%s.md .claude/tasks/%s.log.md\n' "$s" "$s"
}

# ── lint ──────────────────────────────────────────────────────────────────
# Checks the mechanical half of the queue-format contract
# (.claude/skills/task-add/reference/queue-format.md):
#   - status values are in the known set
#   - headings use the middle dot separator (U+00B7), not a hyphen
#   - no duplicate task ids across queue + log
#   - a needs: id that resolves to nothing anywhere is flagged (it would
#     wait forever, which task-next's own step 2 treats as normal — this
#     just surfaces it so a mistyped id gets noticed sooner than "never")
lint() {
  local s qfile lfile
  s=$(slug) || exit 1
  qfile=".claude/tasks/$s.md"
  lfile=".claude/tasks/$s.log.md"

  if [ ! -f "$qfile" ]; then
    printf 'no queue file at %s — nothing to lint\n' "$qfile"
    return 0
  fi
  if [ -f "$qfile" ] && [ ! -f "$lfile" ]; then
    printf 'FAIL  queue exists with no log sibling: %s\n' "$lfile"
    return 1
  fi

  local fail=0

  # headings: must use U+00B7 (·), not a hyphen or colon
  while IFS= read -r line; do
    case "$line" in
    *"·"*) ;;
    *)
      printf 'FAIL  heading missing the middle-dot (·) separator: %s\n' "$line"
      fail=1
      ;;
    esac
  done < <(grep -h '^## T[0-9]' "$qfile" "$lfile" 2>/dev/null || true)

  # status values, queue only (the log records history, not live status)
  while IFS= read -r line; do
    val=$(printf '%s\n' "$line" | sed -E 's/^- \*\*status:\*\* *//')
    case "$val" in
    todo | next | doing | done | blocked | later) ;;
    *)
      printf 'FAIL  unknown status value %s\n' "$line"
      fail=1
      ;;
    esac
  done < <(grep '^- \*\*status:\*\*' "$qfile" 2>/dev/null || true)

  # duplicate ids WITHIN the queue file — two live task blocks sharing a
  # number is ambiguous for the picker. This is not checked against the log:
  # a done task's block legitimately stays in the queue with status: done
  # while the same id also has a completion entry in the log, and a
  # blocked-then-retried task legitimately appears twice in the log (once
  # "blocked", once "done (unblocked)") — neither is a bug.
  dupes=$(grep -ho '^## T[0-9]*' "$qfile" 2>/dev/null | sort | uniq -d)
  if [ -n "$dupes" ]; then
    printf 'FAIL  duplicate task id(s) within the queue file itself:\n%s\n' "$dupes"
    fail=1
  fi

  # needs: referential integrity — every named id must exist somewhere
  all_ids=$( { grep -ho '^## T[0-9]*' "$qfile" "$lfile" 2>/dev/null || true; } | grep -o '[0-9]*' | sort -u)
  while IFS= read -r line; do
    ids=$(printf '%s\n' "$line" | sed -E 's/^- \*\*needs:\*\* *//' | tr ',' '\n' | grep -o '[0-9]*')
    for id in $ids; do
      if ! printf '%s\n' "$all_ids" | grep -qx "$id"; then
        printf 'note  needs: T%s does not resolve to any task in queue or log — will wait forever if that is a typo\n' "$id"
      fi
    done
  done < <(grep '^- \*\*needs:\*\*' "$qfile" 2>/dev/null || true)

  if [ "$fail" -eq 0 ]; then
    printf 'ok    queue lint passed: %s\n' "$qfile"
  fi
  return "$fail"
}

# ── preflight ─────────────────────────────────────────────────────────────
preflight() {
  if [ -d node_modules ]; then
    printf 'ok    node_modules present\n'
    return 0
  fi
  printf 'node_modules missing — running npm ci\n'
  npm ci
}

# ── gate ──────────────────────────────────────────────────────────────────
# Mirrors task-next SKILL.md step 5a exactly, including the stale
# .next/types discrimination. Prints PASS or FAIL as the last line so a
# caller can grep it without parsing the whole log.
gate() {
  local g
  g=$(mktemp -d)
  local lint_ok=1 tsc_ok=1 test_ok=1

  npm run lint >"$g/lint.log" 2>&1 && lint_ok=0
  npm run typecheck >"$g/tsc.log" 2>&1 && tsc_ok=0
  npm test >"$g/test.log" 2>&1 && test_ok=0

  if [ "$tsc_ok" -ne 0 ]; then
    # Every error path under .next/ means stale generated route types from a
    # previous build, not a real failure — clear and re-run once.
    if [ -z "$(grep 'error TS' "$g/tsc.log" | grep -v '^\.next/')" ]; then
      printf 'typecheck: all errors under .next/, treating as stale route types — clearing and re-running\n'
      rm -rf .next/types .next/dev/types
      npm run typecheck >"$g/tsc.log" 2>&1 && tsc_ok=0
    fi
  fi

  [ "$lint_ok" -ne 0 ] && { printf 'lint FAILED\n'; tail -40 "$g/lint.log"; }
  [ "$tsc_ok" -ne 0 ] && { printf 'typecheck FAILED\n'; tail -40 "$g/tsc.log"; }
  [ "$test_ok" -ne 0 ] && { printf 'test FAILED\n'; tail -40 "$g/test.log"; }

  rm -rf "$g"

  if [ "$lint_ok" -eq 0 ] && [ "$tsc_ok" -eq 0 ] && [ "$test_ok" -eq 0 ]; then
    printf 'GATE PASS\n'
    return 0
  fi
  printf 'GATE FAIL\n'
  return 1
}

# ── surfaces ──────────────────────────────────────────────────────────────
# Names which guardrail reviewers a change is due. Called from /pr-check
# Stage 3, which is the only place those reviewers run — task-next does not
# dispatch them.
#
# With a range argument ("$base"...HEAD), reads that range. Without one,
# reads the working tree, and there it must combine `git diff HEAD
# --name-only` with `git ls-files --others --exclude-standard`: a change made
# entirely of new files is absent from the first, so consulting it alone would
# report "no surface touched" over a whole new dashboard directory.
#
# `HEAD` is not optional in that first command. Bare `git diff` shows unstaged
# changes only, and `git ls-files --others` stops listing a file the moment it
# is staged — so anything staged-but-uncommitted falls through BOTH halves,
# and the caller reports a skip it believes is legitimate.
surfaces() {
  local range=${1:-} touched dashboard=0 supabase=0
  if [ -n "$range" ]; then
    touched=$(git diff "$range" --name-only 2>/dev/null | sort -u)
  else
    touched=$(
      { git diff HEAD --name-only 2>/dev/null
        git ls-files --others --exclude-standard 2>/dev/null
      } | sort -u
    )
  fi

  if [ -z "$touched" ]; then
    if [ -n "$range" ]; then
      printf 'no files changed in %s\n' "$range"
    else
      printf 'no changes in the working tree\n'
    fi
    return 0
  fi

  while IFS= read -r f; do
    case "$f" in
    src/app/dashboard/* | src/components/dashboard/* | *matches/new-match-wizard/*)
      dashboard=1
      ;;
    esac
    case "$f" in
    src/lib/supabase/* | src/lib/data/* | src/app/api/* | supabase/migrations/*)
      supabase=1
      ;;
    esac
  done <<<"$touched"

  [ "$dashboard" -eq 1 ] && printf 'pipeline-guardrails-reviewer: needed (dashboard/wizard surface touched)\n'
  [ "$supabase" -eq 1 ] && printf 'rls-boundary-reviewer: needed (supabase/data-layer surface touched)\n'
  if [ "$dashboard" -eq 0 ] && [ "$supabase" -eq 0 ]; then
    printf 'no guardrail surface touched\n'
  fi
}

# ── clean ─────────────────────────────────────────────────────────────────
clean() {
  local status
  status=$(git status --short)
  if [ -z "$status" ]; then
    printf 'ok    working tree clean\n'
    return 0
  fi
  printf 'FAIL  working tree not clean:\n%s\n' "$status"
  return 1
}

case "$cmd" in
slug) slug ;;
queue-paths) queue_paths ;;
lint) lint ;;
preflight) preflight ;;
gate) gate ;;
surfaces) surfaces "${1:-}" ;;
clean) clean ;;
*) die "unknown subcommand '$cmd' — one of: slug queue-paths lint preflight gate surfaces clean" ;;
esac

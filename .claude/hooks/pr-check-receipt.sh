#!/usr/bin/env bash
# NOT a hook — a helper. It lives in .claude/hooks/ because that directory is
# already `!`-re-included in .gitignore and already carries executable shell.
#
# Records what /pr-check actually checked, and at which commit.
#
# /pr-check is the only pre-merge gate in this repo — there is no CI, nothing
# runs on push — and until now its verdict went to the screen and nowhere else.
# There was no way to answer "has this branch been gated, and at which commit?"
#
# Storage is <git-common-dir>/claude/pr-check-receipts.json, NOT .claude/.
# That is deliberate: /pr-check runs inside a worktree while the merge happens
# in the main checkout, and .claude/ is per-worktree — a receipt written there
# would be invisible at exactly the moment it is needed. The git common dir is
# shared by every worktree, is never part of a diff, is untouched by
# git clean, and survives `git worktree remove`.
#
# It is local-only and not backed up. A fresh clone has no receipts, so every
# branch reads as ungated — the correct conservative default.
set -uo pipefail

die() { printf 'pr-check-receipt: %s\n' "$1" >&2; exit 1; }

common=$(git rev-parse --git-common-dir 2>/dev/null) || die "not a git repository"
case "$common" in /*) ;; *) common="$(pwd)/$common" ;; esac
common=$(cd "$common" 2>/dev/null && pwd -P) || die "cannot resolve the git common dir"
FILE="$common/claude/pr-check-receipts.json"

sub=${1:-}; shift || true

case "$sub" in
# --------------------------------------------------------------------- record
record)
  verdict=""; reviewed=""; note=""; ran=""; skipped=""; base_ref=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --verdict)  verdict=${2:-}; shift 2 ;;
      --reviewed) reviewed=${2:-}; shift 2 ;;
      --note)     note=${2:-}; shift 2 ;;
      --ran)      ran=${2:-}; shift 2 ;;
      --skipped)  skipped=${2:-}; shift 2 ;;
      --base)     base_ref=${2:-}; shift 2 ;;
      *) die "unknown argument: $1" ;;
    esac
  done

  case "$verdict" in
    ready|not-ready) ;;
    *) die "--verdict must be 'ready' or 'not-ready' (got '${verdict}')" ;;
  esac
  case "$reviewed" in
    branch-range|working-tree) ;;
    *) die "--reviewed must be 'branch-range' or 'working-tree' (got '${reviewed}'). It must match the target /pr-check picked in 'What to review' — a working-tree receipt does not attest that the commit was gated." ;;
  esac

  # Facts are derived here, never passed in. Nothing the caller can get wrong.
  head_sha=$(git rev-parse HEAD 2>/dev/null) || die "no HEAD to record against"
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  [ -n "$(git status --porcelain 2>/dev/null)" ] && dirty=1 || dirty=0

  # Best-effort. A missing integration branch records a null base rather than
  # failing — the receipt's value does not depend on it.
  base_sha=""
  for cand in ${base_ref:-} splitstep-integration main; do
    [ -n "$cand" ] || continue
    base_sha=$(git merge-base HEAD "$cand" 2>/dev/null) && [ -n "$base_sha" ] && break
    base_sha=""
  done

  mkdir -p "$(dirname "$FILE")" || die "cannot create $(dirname "$FILE")"

  python3 - "$FILE" "$head_sha" "$base_sha" "$branch" "$verdict" "$reviewed" \
              "$dirty" "$at" "$ran" "$skipped" "$note" <<'PY' || exit 1
import json, os, sys, tempfile

(path, head, base, branch, verdict, reviewed,
 dirty, at, ran, skipped, note) = sys.argv[1:12]

CAP = 100
data = {"version": 1, "receipts": []}
if os.path.exists(path) and os.path.getsize(path) > 0:
    try:
        with open(path) as fh:
            data = json.load(fh)
        if not isinstance(data.get("receipts"), list):
            raise ValueError("no receipts array")
    except Exception as exc:
        # Never overwrite. A corrupt file may be the only record of a real run,
        # and clobbering it silently is the failure this file exists to prevent.
        sys.stderr.write(
            f"pr-check-receipt: {path} is corrupt ({exc}).\n"
            f"pr-check-receipt: refusing to overwrite it. Inspect it, then "
            f"remove it to start fresh.\n")
        sys.exit(1)

data.setdefault("version", 1)
data["receipts"].append({
    "head_sha": head,
    "base_sha": base or None,
    "branch": branch,
    "verdict": verdict,
    "reviewed": reviewed,
    "tree_dirty": dirty == "1",
    "at": at,
    "ran": [s for s in ran.split(",") if s.strip()],
    "skipped": [s.strip() for s in skipped.split(";") if s.strip()],
    "note": note,
})
data["receipts"] = data["receipts"][-CAP:]

# Atomic: a half-written receipts file is indistinguishable from a corrupt one.
d = os.path.dirname(path)
fd, tmp = tempfile.mkstemp(dir=d)
with os.fdopen(fd, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
os.replace(tmp, path)
print(head[:7])
PY
  ;;

# ----------------------------------------------------------------------- show
show)
  want_branch=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --branch) want_branch=${2:-}; shift 2 ;;
      *) die "unknown argument: $1" ;;
    esac
  done

  [ -f "$FILE" ] || { echo "No /pr-check receipts recorded. Nothing has been gated on this machine."; exit 0; }
  head_now=$(git rev-parse HEAD 2>/dev/null || echo "")

  python3 - "$FILE" "$want_branch" "$head_now" <<'PY'
import json, subprocess, sys

path, want, head_now = sys.argv[1:4]
try:
    data = json.load(open(path))
except Exception as exc:
    sys.stderr.write(f"pr-check-receipt: {path} is corrupt ({exc}). Remove it to start fresh.\n")
    sys.exit(1)

rs = [r for r in data.get("receipts", []) if not want or r.get("branch") == want]
if not rs:
    print("No /pr-check receipts matching that filter.")
    sys.exit(0)

for i, r in enumerate(reversed(rs)):
    sha = (r.get("head_sha") or "")[:7]
    print(f"{sha}  {r.get('verdict','?'):<9}  {r.get('at','?')}  {r.get('branch','?')}")
    if r.get("reviewed") == "working-tree":
        print("    reviewed: THE WORKING TREE at that moment — this receipt does")
        print("              NOT attest that the commit itself was gated")
    else:
        print("    reviewed: the branch range up to that commit")
    if r.get("tree_dirty"):
        print("    tree was dirty when recorded")
    if r.get("note"):    print(f"    note: {r['note']}")
    if r.get("ran"):     print(f"    ran: {', '.join(r['ran'])}")
    for s in r.get("skipped", []):
        print(f"    skipped: {s}")

    if i == 0 and head_now:
        try:
            n = subprocess.run(["git","rev-list","--count",f"{r['head_sha']}..{head_now}"],
                               capture_output=True, text=True).stdout.strip()
            if n and n != "0":
                print(f"    ** {n} commit(s) on HEAD since this receipt — it no longer covers your tip **")
        except Exception:
            pass
    print()
PY
  ;;

*)
  cat >&2 <<'USAGE'
usage:
  pr-check-receipt.sh record --verdict ready|not-ready \
                             --reviewed branch-range|working-tree \
                             --note "<one line>" [--ran a,b,c] [--skipped "r; r"]
  pr-check-receipt.sh show [--branch <ref>]
USAGE
  exit 1 ;;
esac

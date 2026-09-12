#!/usr/bin/env bash
# NOT a hook — a helper, run by hand or from the create-migration skill before
# applying a new migration. It lives beside SKILL.md rather than in
# .claude/hooks/ because it is specific to this one skill, not a session-wide
# concern; .gitignore:70-71 already re-includes this whole skill directory
# recursively, so nothing extra is needed to track it.
#
# Checks four of SKILL.md's rules that are mechanically decidable. Two rules
# stay prose because a script cannot judge them: whether a program-scoped
# predicate is membership (not ownership), and whether a view leaks data
# across accounts.
#
# "Already applied" is not locally knowable — migrations apply via the
# Supabase MCP apply_migration tool, and there is no local ledger, no
# config.toml, no schema dump. The no-edit check below uses "committed to
# git" as a proxy, which is the best available signal, not a proof.
set -uo pipefail

DIR="supabase/migrations"
fail=0

note() { printf '%s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
ok() { printf 'ok    %s\n' "$1"; }

[ -d "$DIR" ] || { printf 'check.sh: %s not found — run from the repo root\n' "$DIR" >&2; exit 1; }

# ── 1. Filename format ───────────────────────────────────────────────────────
bad_names=0
for f in "$DIR"/*.sql; do
  base=$(basename "$f")
  case "$base" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*.sql) ;;
  *)
    bad "filename does not match YYYYMMDDHHMMSS_snake_case_description.sql: $base"
    bad_names=$((bad_names + 1))
    ;;
  esac
done
[ "$bad_names" -eq 0 ] && ok "filename format: all conform"

# ── 2. Ordering — a newly staged migration sorts after the last existing one ─
# Only meaningful for files git considers new (status A); an existing tree
# with nothing staged has nothing to check here.
last_existing=$(ls "$DIR" | sort | tail -1)
new_files=$(git diff --cached --name-only --diff-filter=A -- "$DIR" 2>/dev/null)
order_bad=0
if [ -n "$new_files" ]; then
  while IFS= read -r nf; do
    [ -z "$nf" ] && continue
    base=$(basename "$nf")
    first=$(printf '%s\n%s\n' "$base" "$last_existing" | sort | head -1)
    if [ "$first" = "$base" ] && [ "$base" != "$last_existing" ]; then
      bad "new migration sorts before the latest existing one ($last_existing): $base"
      order_bad=$((order_bad + 1))
    fi
  done <<<"$new_files"
  [ "$order_bad" -eq 0 ] && ok "ordering: staged migration(s) sort after $last_existing"
else
  note "ordering: nothing staged in $DIR, skipping"
fi

# ── 3. No edit to an already-committed migration ─────────────────────────────
# "Applied" is not locally knowable (see header) — this checks "modified
# since it was committed" as the closest available proxy.
modified=$(git diff --name-only --diff-filter=M -- "$DIR" 2>/dev/null)
modified_staged=$(git diff --cached --name-only --diff-filter=M -- "$DIR" 2>/dev/null)
all_modified=$(printf '%s\n%s\n' "$modified" "$modified_staged" | sort -u | grep -v '^$' || true)
if [ -n "$all_modified" ]; then
  while IFS= read -r mf; do
    bad "modifies an already-committed migration (write a new one instead): $mf"
  done <<<"$all_modified"
else
  ok "no-edit: no already-committed migration is modified"
fi

# ── 4 & 5. RLS enabled, and a policy in the same file (with the server-only
# escape hatch this corpus already uses) ────────────────────────────────────
rls_bad=0
policy_bad=0
for f in "$DIR"/*.sql; do
  grep -qi "create table" "$f" || continue
  if ! grep -qi "enable row level security" "$f"; then
    bad "creates a table with no RLS enabled in the same file: $(basename "$f")"
    rls_bad=$((rls_bad + 1))
    continue
  fi
  if ! grep -qi "create policy" "$f" && ! grep -q "Server-only: no RLS policy and no grant" "$f"; then
    bad "enables RLS but adds no policy and no 'Server-only: no RLS policy and no grant' marker: $(basename "$f")"
    policy_bad=$((policy_bad + 1))
  fi
done
[ "$rls_bad" -eq 0 ] && ok "RLS: every CREATE TABLE enables row level security"
[ "$policy_bad" -eq 0 ] && ok "policy: every RLS-enabled table has a policy or the server-only marker"

echo
if [ "$fail" -eq 0 ]; then
  echo "check.sh: all checks passed"
else
  echo "check.sh: one or more checks failed — see FAIL lines above"
fi
exit "$fail"

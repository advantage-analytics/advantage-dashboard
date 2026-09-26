#!/usr/bin/env bash
# Test cases for check.sh. Run: bash .claude/skills/create-migration/check.test.sh
#
# Every fixture is a throwaway repo under mktemp with a hermetic git config,
# so the checker runs against a made-up supabase/migrations tree rather than
# this repo's real one.
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
fixture() { # $1 = index; echoes the repo path, with supabase/migrations created and committed
  local root="$TMPROOT/f$1"
  mkdir -p "$root/repo/supabase/migrations"
  git init -q -b main "$root/repo" 2>/dev/null
  printf '%s\n' "$root/repo"
}

echo "-- a clean, well-formed migration passes --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_add_widgets.sql" <<'SQL'
create table public.widgets (id uuid primary key, owner uuid not null);
alter table public.widgets enable row level security;
create policy "owners read own widgets" on public.widgets for select using (auth.uid() = owner);
SQL
( cd "$R" && git add -A && git commit -q -m init )
( cd "$R" && "$BIN" >/dev/null 2>&1 ); ok $? "exits 0 on a clean tree"

echo "-- the server-only marker is accepted in place of a policy --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_add_secrets.sql" <<'SQL'
create table public.secrets (id uuid primary key);
alter table public.secrets enable row level security;
comment on table public.secrets is 'Server-only: no RLS policy and no grant, so only the service role can read it.';
SQL
( cd "$R" && git add -A && git commit -q -m init )
( cd "$R" && "$BIN" >/dev/null 2>&1 ); ok $? "exits 0 when the server-only marker is present"

echo "-- a bad filename fails --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/add_widgets.sql" <<'SQL'
select 1;
SQL
( cd "$R" && git add -A && git commit -q -m init )
( cd "$R" && "$BIN" >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "fails on a missing timestamp stamp"

echo "-- a table with no RLS fails --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_no_rls.sql" <<'SQL'
create table public.exposed (id uuid primary key);
SQL
( cd "$R" && git add -A && git commit -q -m init )
out=$( cd "$R" && "$BIN" 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails when RLS is never enabled"
printf '%s' "$out" | grep -q "no RLS enabled"; ok $? "names the missing-RLS file"

echo "-- RLS enabled but no policy and no marker fails --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_half_done.sql" <<'SQL'
create table public.half_done (id uuid primary key);
alter table public.half_done enable row level security;
SQL
( cd "$R" && git add -A && git commit -q -m init )
out=$( cd "$R" && "$BIN" 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails when RLS has no policy and no marker"
printf '%s' "$out" | grep -q "adds no policy"; ok $? "names the missing-policy file"

echo "-- editing an already-committed migration fails --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_settled.sql" <<'SQL'
create table public.settled (id uuid primary key);
alter table public.settled enable row level security;
create policy "read" on public.settled for select using (true);
SQL
( cd "$R" && git add -A && git commit -q -m init )
printf '\n-- edited after commit\n' >>"$R/supabase/migrations/20260101120000_settled.sql"
out=$( cd "$R" && "$BIN" 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails when a committed migration is modified"
printf '%s' "$out" | grep -q "already-committed migration"; ok $? "names the modified file"

echo "-- a newly staged migration that sorts before the latest existing one fails --"
n=$((n+1)); R=$(fixture "$n")
cat >"$R/supabase/migrations/20260101120000_first.sql" <<'SQL'
create table public.first (id uuid primary key);
alter table public.first enable row level security;
create policy "read" on public.first for select using (true);
SQL
( cd "$R" && git add -A && git commit -q -m init )
cat >"$R/supabase/migrations/20260101000000_earlier.sql" <<'SQL'
create table public.earlier (id uuid primary key);
alter table public.earlier enable row level security;
create policy "read" on public.earlier for select using (true);
SQL
( cd "$R" && git add -A )
out=$( cd "$R" && "$BIN" 2>&1 ); rc=$?
[ "$rc" -ne 0 ]; ok $? "fails when a staged migration sorts before the latest existing one"
printf '%s' "$out" | grep -q "sorts before"; ok $? "names the ordering violation"

echo "-- refuses to run outside a migrations directory --"
n=$((n+1)); R="$TMPROOT/no-migrations-dir"
mkdir -p "$R"
( cd "$R" && "$BIN" >/dev/null 2>&1 ); [ $? -ne 0 ]; ok $? "exits non-zero with no supabase/migrations"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]

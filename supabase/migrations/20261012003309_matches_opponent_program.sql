-- Give a match's opponent a team: `opponent_program_id` for a program we know,
-- `opponent_school` for free text when we do not (an opponent whose school is
-- not in `programs`). At most one is set — a match either points at a program
-- row or carries a name, never both — so the CHECK below rejects the pair.
-- Both are nullable: existing matches keep neither, and nothing here touches
-- a row. `program_event_entries` already carries the same two columns for the
-- event path; this is their per-match counterpart for the Opponents page
-- (design record: "Giving an opponent a team").
--
-- `on delete set null` matches the other program-shaped FKs on this table
-- (`program_id`, `opponent_player_id`, `event_entry_id`): deleting a program
-- orphans the link, it does not delete the match. The partial index mirrors
-- `matches_opponent_player_idx` — the team page groups a program's matches by
-- opponent, and nulls would dominate a full index for nothing.
--
-- GRANTS. The task expected `matches` to carry per-column privileges, the way
-- `public.users` does since `20260914100000_users_block_admin_self_update`
-- (where every new column must be named in the grant or clients get
-- "permission denied" despite RLS). Verified live 2026-10-11 that it does
-- NOT: `pg_class.relacl` holds a table-wide `authenticated=arwdm` and
-- `service_role=arwdDxtm`, and no `matches` column has an `attacl`. The 32
-- per-column rows `information_schema.column_privileges` shows are that
-- table grant expanded per column, so the two new columns are readable and
-- writable by `authenticated` the moment they exist. The column grants below
-- are therefore redundant today and kept on purpose: they cost nothing, and
-- if `matches` is ever narrowed to column-scoped grants the way `users` was,
-- these two columns stay writable instead of failing silently like the
-- onboarding intake columns did (`20260926201548`).
--
-- POLICIES. None created or altered. The write path T15 relies on is the live
-- UPDATE policy "Users can update own matches", verified 2026-10-11 as
--   using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by)
-- so only the match's creator can set either column from the browser client.
-- A coach fixing a match they did not record is a separate decision, not
-- something this migration opens.
--
-- Applied to the live database via the Supabase MCP as
-- `matches_opponent_program` (version 20261012003309).

alter table public.matches
  add column opponent_program_id uuid null
    references public.programs(id) on delete set null,
  add column opponent_school text null;

alter table public.matches
  add constraint matches_opponent_program_or_school_check
    check (opponent_program_id is null or opponent_school is null);

create index matches_opponent_program_idx
  on public.matches (opponent_program_id)
  where opponent_program_id is not null;

grant select, insert, update (opponent_program_id, opponent_school)
  on public.matches to authenticated;
grant select, insert, update (opponent_program_id, opponent_school)
  on public.matches to service_role;

comment on column public.matches.opponent_program_id is
  'The opponent''s program, when it is one we know. Mutually exclusive with opponent_school.';
comment on column public.matches.opponent_school is
  'The opponent''s school as free text, for a program not in public.programs. Mutually exclusive with opponent_program_id.';

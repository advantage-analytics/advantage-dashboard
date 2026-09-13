-- A program's own clock.
--
-- Team Home's calendar arithmetic -- the weekend dual sheet, the invite
-- countdown, "claimed today" on the roster card -- has been pinned to UTC
-- because there was no per-program zone to read one from
-- (`team-home-server.ts`, `PROGRAM_TIME_ZONE`). UTC is honest, not correct: a
-- program on the Pacific coast loses its weekend dual sheet around 5pm Sunday,
-- hours before the weekend the coach is reading about is actually over.
--
-- `programs.state` was considered and rejected as a substitute: Arizona keeps
-- no DST, and nine states straddle two zones, so a state-to-zone table would
-- be a guess wearing a schema's clothes. This is a real IANA zone name,
-- validated on write against the server's own `pg_timezone_names` -- an
-- offset cannot express DST and would be wrong twice a year.
--
-- Every existing row is backfilled to 'UTC' rather than left null, so a
-- program that has never set a zone keeps rendering exactly what it renders
-- today. The column is `not null`, so nothing downstream needs a second
-- fallback constant beyond the application-side default this migration
-- matches.
--
-- ── Validation: CHECK + STABLE function, not a trigger ──────────────────────
-- The general caveat against a non-IMMUTABLE function in a CHECK constraint
-- is about correctness (Postgres does not guarantee re-evaluation semantics
-- the same way across dumps/restores/plans the way it does for IMMUTABLE
-- functions), not that it is rejected -- verified live against this project
-- (Postgres 17): the constraint below was created without error and, tested
-- against a scratch table before this migration ran, correctly rejected
-- 'Not/A_Zone' and accepted 'America/Los_Angeles'. It was tested again after
-- this migration landed, directly against `programs`, with the same result,
-- then rolled back (the failing UPDATE never commits).
--
-- Worth recording plainly: applying this ADD COLUMN ... CHECK took roughly
-- 100 seconds against the live 1941-row table, because `pg_timezone_names` is
-- a set-returning function over tzdata (~55ms per call, confirmed with
-- EXPLAIN ANALYZE) and the CHECK re-evaluates it once per existing row during
-- validation. That cost is paid once, here, at migration time -- a normal
-- INSERT/UPDATE afterwards validates only the one changed row, at the same
-- ~55ms `pg_timezone_names` scan a trigger body would pay too. A
-- BEFORE INSERT OR UPDATE trigger would have skipped the existing-row
-- validation pass entirely (triggers do not fire for rows already in the
-- table when a column is added), which is the real performance trade-off
-- between the two approaches -- not a portability one, since CHECK worked
-- fine here. Recorded so a future migration touching this column at scale
-- is not surprised by the same ~100s.

create or replace function public.is_iana_time_zone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_timezone_names where name = tz
  );
$$;

comment on function public.is_iana_time_zone(text) is
  'True when tz is a name pg_timezone_names recognizes. Backs the CHECK on programs.time_zone.';

alter table public.programs
  add column if not exists time_zone text not null default 'UTC'
  check (public.is_iana_time_zone(time_zone));

comment on column public.programs.time_zone is
  'IANA zone name (e.g. America/Los_Angeles) the program''s calendar arithmetic runs in -- Team Home''s weekend dual sheet, invite countdown and claimed-today roster pill. Defaults to UTC, which every program backfilled by this migration keeps: today''s shipped behavior, unchanged, until a program sets its own.';

-- Explicit backfill, even though `not null default 'UTC'` already leaves no
-- existing row null (Postgres 11+ does not rewrite the table for a constant
-- default). Stated anyway so "no row is left null" is not an implicit
-- behavior a reader has to know Postgres version history to trust.
update public.programs set time_zone = 'UTC' where time_zone is null;

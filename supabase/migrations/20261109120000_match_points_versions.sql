-- match_points_versions: a counter per match that changes whenever any of
-- the match's points or shots change.
--
-- Why: the team player profile's season (src/lib/data/player-season-server.ts)
-- caches each match's points in process across requests
-- (src/lib/data/season-points-cache.ts), keyed by the viewer, the program,
-- the match and THIS version. No column says when a match's points last
-- changed — points and shots carry no updated_at, and a label publish, a
-- re-derivation, a score-edit rebuild or a one-off repair rewrites them in
-- place or by delete + insert — so the version is kept here by statement
-- triggers, the way ask_point_facts is kept (20261015090038).
--
-- Read by the signed-in viewer through their own client, under RLS: a row is
-- visible exactly when the match's POINTS are — the policy is the points
-- table's own (`match_id in (select visible_match_ids())`), not matches',
-- which reads "created or played in" and could differ — so a cache hit is
-- never looser than the points read it stands in for. A viewer who cannot
-- read a match's points gets no version for it and the app reads that match
-- uncached. Written only by the trigger functions below.
--
-- The app fails open: until this migration is applied, the version read
-- errors and every season is read uncached, as before.

-- ── 1. The table ────────────────────────────────────────────────────────────

create table if not exists public.match_points_versions (
  match_id uuid primary key references public.matches (id) on delete cascade,
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);

comment on table public.match_points_versions is
  'One counter per match, bumped by statement triggers on points and shots on every insert, update and delete. The season points cache (season-points-cache.ts) keys on it; readable wherever the match is.';

alter table public.match_points_versions enable row level security;

revoke all on public.match_points_versions from public, anon, authenticated;
grant select on public.match_points_versions to authenticated;
grant all on public.match_points_versions to service_role;

create policy match_points_versions_select_with_match
  on public.match_points_versions
  for select
  to authenticated
  using (match_id in (select public.visible_match_ids()));

-- ── 2. The bump ─────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER so that whoever writes points or shots — service_role, or
-- a user through RLS — moves a counter nobody else may write. Rows are
-- written in match_id order, so two statements touching several matches
-- each lock their version rows in the same order and cannot deadlock on
-- them. The exists()
-- skips a match that is gone (a cascaded delete from matches: its points'
-- delete fires after the match row is deleted, and the version row goes with
-- it by its own cascade).

create schema if not exists points_version_private;
revoke all on schema points_version_private from public, anon, authenticated;

create or replace function points_version_private.bump(match_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.match_points_versions as v (match_id)
  select distinct u.match_id
    from unnest(match_ids) as u (match_id)
   where u.match_id is not null
     and exists (select 1 from public.matches m where m.id = u.match_id)
   order by u.match_id
  on conflict (match_id) do update
    set version = v.version + 1,
        changed_at = now();
$$;

revoke all on function points_version_private.bump(uuid[]) from public, anon, authenticated;

-- ── 3. Statement triggers with transition tables ────────────────────────────
--
-- One bump per statement for the matches it touched. An UPDATE reads both
-- transition tables, so a row moved from one match (or point) to another
-- bumps both. A shots delete cascaded from its point finds no point here;
-- the points trigger has already bumped that match.

create or replace function points_version_private.points_inserted_or_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform points_version_private.bump(
    (select array_agg(distinct c.match_id) from changed c));
  return null;
end
$$;

create or replace function points_version_private.points_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform points_version_private.bump(
    (select array_agg(distinct m)
       from (select match_id as m from new_rows
             union
             select match_id from old_rows) u));
  return null;
end
$$;

create or replace function points_version_private.shots_inserted_or_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform points_version_private.bump(
    (select array_agg(distinct p.match_id)
       from changed c
       join public.points p on p.id = c.point_id));
  return null;
end
$$;

create or replace function points_version_private.shots_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform points_version_private.bump(
    (select array_agg(distinct p.match_id)
       from (select point_id from new_rows
             union
             select point_id from old_rows) u
       join public.points p on p.id = u.point_id));
  return null;
end
$$;

revoke all on function points_version_private.points_inserted_or_deleted() from public, anon, authenticated;
revoke all on function points_version_private.points_updated() from public, anon, authenticated;
revoke all on function points_version_private.shots_inserted_or_deleted() from public, anon, authenticated;
revoke all on function points_version_private.shots_updated() from public, anon, authenticated;

create or replace trigger match_points_versions_points_insert
  after insert on public.points
  referencing new table as changed
  for each statement execute function points_version_private.points_inserted_or_deleted();

create or replace trigger match_points_versions_points_delete
  after delete on public.points
  referencing old table as changed
  for each statement execute function points_version_private.points_inserted_or_deleted();

create or replace trigger match_points_versions_points_update
  after update on public.points
  referencing new table as new_rows old table as old_rows
  for each statement execute function points_version_private.points_updated();

create or replace trigger match_points_versions_shots_insert
  after insert on public.shots
  referencing new table as changed
  for each statement execute function points_version_private.shots_inserted_or_deleted();

create or replace trigger match_points_versions_shots_delete
  after delete on public.shots
  referencing old table as changed
  for each statement execute function points_version_private.shots_inserted_or_deleted();

create or replace trigger match_points_versions_shots_update
  after update on public.shots
  referencing new table as new_rows old table as old_rows
  for each statement execute function points_version_private.shots_updated();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
--
-- Every match that holds points today starts at version 1. A match with no
-- row is read uncached, so a row missed here costs a cache miss, never a
-- stale answer.

insert into public.match_points_versions (match_id)
select distinct p.match_id
  from public.points p
  join public.matches m on m.id = p.match_id
on conflict (match_id) do nothing;

-- Shots carry their match, so reading them no longer rebuilds every visible
-- point.
--
-- Before: the shots SELECT policy was `point_id IN (SELECT visible_point_ids())`,
-- and `visible_point_ids()` returns EVERY point on every match the viewer can
-- see (2,688 rows for one coach; the whole program for any coach). That set
-- was hashed on every shots request: 12-125 ms per page as `authenticated`
-- against 2.2 ms with RLS off, measured 2026-11-10 on match 19b3cdf6 (1,124
-- shots). It grows with the program, not with the match being read.
--
-- After: `shots.match_id`, denormalised from `points.match_id`, and the policy
-- `match_id IN (SELECT visible_match_ids())` - the same set the points and
-- match_stats policies already use (about a hundred ids, not thousands).
--
-- The column is never trusted from a writer. A BEFORE trigger sets it from the
-- shot's point on every insert and on any update that names `point_id` or
-- `match_id`, so a client cannot widen what it may read by writing a different
-- match id, and every existing writer (process-match, derive-and-publish, the
-- label console, the autofixes) keeps working unchanged. A point that moves
-- to another match carries its shots with it (`points_carry_match_id_to_shots`).
-- No foreign key to matches: the value is a copy of `points.match_id`, which
-- already cascades, so a second cascade path would only add work.
--
-- Also: `visible_match_ids()` called `user_program_role(m.program_id)` once per
-- matches row. The program route is now one membership semi-join; the rule is
-- unchanged (any program_members row for the viewer, whatever its role).
-- CREATE OR REPLACE keeps the function's grants.

-- Re-runnable: every step is IF NOT EXISTS / OR REPLACE / ALTER.

-- 1. The column, backfilled. The table's user triggers are off for the
-- backfill only: it changes no value they read, and leaving them on would bump
-- every match's points version (dropping the season caches) and rebuild the
-- Ask facts for every shot.
alter table public.shots add column if not exists match_id uuid;

alter table public.shots disable trigger user;

update public.shots s
   set match_id = p.match_id
  from public.points p
 where p.id = s.point_id
   and s.match_id is distinct from p.match_id;

alter table public.shots enable trigger user;

alter table public.shots alter column match_id set not null;

-- 2. Kept in step from here on.
create or replace function public.shots_set_match_id()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  select p.match_id into new.match_id
    from public.points p
   where p.id = new.point_id;
  -- An unknown point fails on the point_id foreign key; a null here would
  -- fail NOT NULL first with a less useful message, so say it plainly.
  if new.match_id is null then
    raise exception 'shot % names a point that does not exist', new.id
      using errcode = '23503';
  end if;
  return new;
end;
$function$;

revoke all on function public.shots_set_match_id() from public, anon, authenticated;

-- Named to fire before `zz_shots_guard_verified_match` (triggers run in name
-- order), though the guard reads only point_id.
create or replace trigger shots_set_match_id
  before insert or update of point_id, match_id on public.shots
  for each row execute function public.shots_set_match_id();

create or replace function public.points_carry_match_id_to_shots()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.shots
     set match_id = new.match_id
   where point_id = new.id;
  return null;
end;
$function$;

revoke all on function public.points_carry_match_id_to_shots() from public, anon, authenticated;

create or replace trigger points_carry_match_id_to_shots
  after update of match_id on public.points
  for each row
  when (new.match_id is distinct from old.match_id)
  execute function public.points_carry_match_id_to_shots();

-- 3. The index: the policy's match filter, and the loader's order (point,
-- shot number, id) within a match.
create index if not exists shots_match_point_shot_idx
  on public.shots (match_id, point_id, shot_number, id);

-- 4. Readers may see the column; nobody writes it but the trigger.
grant select (match_id) on public.shots to authenticated;

-- 5. The SELECT policy, on the match. ALTER rather than drop and create, so
-- the policy is never absent and the migration re-runs cleanly.
alter policy "Users can view shots for their own matches"
  on public.shots
  using (match_id in (select public.visible_match_ids()));

-- 6. visible_match_ids(): one membership semi-join instead of a function call
-- per matches row.
create or replace function public.visible_match_ids()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select m.id
    from public.matches m
   where
     -- Personal route. `created_by` stays a plain equality: it is an uploader,
     -- never a player identity, and must not gain profile semantics.
     (select auth.uid()) = m.created_by
     or m.player1_id in (select public.my_player_ids())
     or m.player2_id in (select public.my_player_ids())
     -- Program route: membership-only, matching the matches policy. Any
     -- program_members row counts, whatever its role (as
     -- `user_program_role(...) is not null` did).
     or m.program_id in (
       select pm.program_id
         from public.program_members pm
        where pm.user_id = (select auth.uid())
     );
$function$;

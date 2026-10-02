-- Reconcile who can READ a match, its stats, its points and its shots.
-- Applied live 2026-08-17 as version 20260817074029.
--
-- These four tables disagreed with each other, and had since before the video
-- pipeline existed:
--
--   matches      select: auth.uid() = player1_id OR auth.uid() = player2_id
--   match_stats  select: via matches, player1_id OR player2_id
--   points       select: via matches, created_by
--   shots        select: via points -> matches, created_by
--
-- Two tables scoped by WHO PLAYED, two by WHO UPLOADED. Nobody noticed because
-- so far those have always been the same person.
--
-- The effect is worse than the policy text suggests. A policy's subquery is
-- itself subject to RLS, so the points and shots policies are gated by the
-- matches policy on top of their own `created_by` test — the two AND together.
-- Measured on a reproduction of these exact policies: a user who played in
-- three matches but uploaded none could read all three match rows and all three
-- match_stats rows, and ZERO points and shots. A user who uploaded two matches
-- but played in neither could read nothing at all, including the rows they
-- created. Points are currently visible only to someone who is both.
--
-- Program-scoped visibility is landing next, and layering it on top of a split
-- like this is how one program's data becomes visible to another. So this
-- migration does ONE thing — make the four agree — with no program clause at
-- all, so it can be reviewed and reverted on its own.
--
-- ── Why this is safe ────────────────────────────────────────────────────────
-- The unified predicate is the UNION of the two: creator or either player. That
-- is a superset of both, so no existing access is removed.
--
-- Measured on live data before writing this, 2026-08-16:
--
--   * all 34 matches have `created_by` equal to `player1_id` or `player2_id`,
--     with no nulls on either side; and
--   * ZERO matches have two distinct players — `player1_id` and `player2_id`
--     hold the same value on every row, because the opponent is recorded as a
--     name rather than an account.
--
-- Together those mean `created_by = player1_id = player2_id` on every row that
-- exists. The union therefore selects exactly the same rows as each original
-- predicate, for every user, and NOBODY gains access to anything. Counted
-- directly: 0 users gain points or shots access. This migration changes what
-- happens NEXT, not what anyone can see now.
--
-- Verified end to end against a throwaway Postgres carrying these exact
-- policies and a seeded set covering all four shapes — creator-and-player,
-- player-only, creator-only, and unrelated. Before: 2/2/1/1, 3/3/0/0, 0/0/0/0,
-- 0/0/0/0 (matches/stats/points/shots). After: 2/2/2/2, 3/3/3/3, 2/2/2/2,
-- 0/0/0/0. No count decreased anywhere, and the unrelated user stayed at zero.
--
-- ── Scope ───────────────────────────────────────────────────────────────────
-- SELECT only. Insert, update and delete keep their `created_by` predicates
-- untouched: letting a player edit or delete a match somebody else uploaded
-- would be a genuine widening, and reconciliation is not the place for it.

-- One definition of "which matches may this caller read", used by the three
-- dependent tables.
--
-- SET-RETURNING, not a per-row boolean, and that is a performance decision
-- rather than a stylistic one. The first version of this was
-- `can_read_match(uuid) returns boolean`, called from each policy — which means
-- once per row scanned. Measured at production scale (34 matches, 2992 points,
-- 14960 shots), a single match-detail read went from 0.87 ms to 20.9 ms: a 23x
-- regression that scales with the table.
--
-- As `x IN (SELECT f())` with `f` marked STABLE, Postgres evaluates the set
-- once per statement and hashes it, so the cost stops depending on row count.
--
-- SECURITY DEFINER so the dependent policies do not re-enter `matches`' own RLS.
-- Written once rather than repeated in three policies, because three copies of
-- an authorization predicate is three chances to fix a bug in two of them.
create or replace function public.visible_match_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.matches m
   where (select auth.uid()) in (m.created_by, m.player1_id, m.player2_id);
$$;

-- Shots hang off points, which hang off matches. Resolving that chain inside a
-- policy would run the subquery under the caller's RLS and re-enter the points
-- policy; this collapses it to one definer-side set, hashed like the above.
create or replace function public.visible_point_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pt.id
    from public.points pt
   where pt.match_id in (select public.visible_match_ids());
$$;

revoke all on function public.visible_match_ids() from public;
revoke all on function public.visible_point_ids() from public;
grant execute on function public.visible_match_ids() to authenticated;
grant execute on function public.visible_point_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------

-- Renamed from "Enable read access for all users", which described neither what
-- it did nor who it was for.
drop policy if exists "Enable read access for all users" on public.matches;
drop policy if exists "Users can read matches they created or played in" on public.matches;
create policy "Users can read matches they created or played in"
  on public.matches for select
  using ((select auth.uid()) in (created_by, player1_id, player2_id));

-- ---------------------------------------------------------------------------
-- match_stats
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view stats for their own matches" on public.match_stats;
create policy "Users can view stats for their own matches"
  on public.match_stats for select
  using (match_id in (select public.visible_match_ids()));

-- ---------------------------------------------------------------------------
-- points
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view points for their own matches" on public.points;
create policy "Users can view points for their own matches"
  on public.points for select
  using (match_id in (select public.visible_match_ids()));

-- ---------------------------------------------------------------------------
-- shots
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view shots for their own matches" on public.shots;
create policy "Users can view shots for their own matches"
  on public.shots for select
  using (point_id in (select public.visible_point_ids()));

comment on function public.visible_match_ids() is
  'Every match id the caller may read: creator or either player. Program membership is layered on in a later migration. Set-returning so policies hash it once per statement.';

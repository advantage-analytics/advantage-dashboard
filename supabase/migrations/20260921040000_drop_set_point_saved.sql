-- T6 · drop set_point_saved — the film tab writes point_bookmarks directly.
--
-- Closes the PR #238 stopgap. Since T1 the client has toggled `points.saved`
-- through the SECURITY DEFINER RPC `set_point_saved` while nothing reads the
-- flag any more (T5 derives `MatchPoint.saved` from `point_bookmarks`), so
-- every save made since then is invisible. This migration lands in the SAME
-- commit as the client cut-over to insert/delete on `point_bookmarks`, in
-- this order: backfill → drop → comment. The backfill has to be the last
-- statement to run against a still-current flag, which is why it lives here
-- and nowhere earlier.
--
-- `points.saved` is neither dropped nor altered; that is a separate
-- migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Final backfill from the legacy flag
-- ─────────────────────────────────────────────────────────────────────────────

-- T1's statement, verbatim (`tests/point-bookmarks-db.spec.ts` carries it as
-- `BACKFILL_SQL` and checks this file contains it; change one and change the
-- other). A point saved through `set_point_saved` by a non-creator — a coach
-- or program-mate — is attributed to the match's creator, because the flag
-- never recorded who set it. `on conflict do nothing` keeps it re-runnable.
insert into public.point_bookmarks (user_id, point_id)
select m.created_by, p.id
  from public.points p
  join public.matches m on m.id = p.match_id
 where p.saved and m.created_by is not null
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop the RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- The only signature live, covering both recorded versions 20260921010409
-- (set_point_saved) and 20260921011421 (set_point_saved_strict).
drop function if exists public.set_point_saved(uuid, boolean);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Mark the flag legacy
-- ─────────────────────────────────────────────────────────────────────────────

comment on column public.points.saved is
  'LEGACY — unwritten since 20260921040000_drop_set_point_saved; read nothing from it. Dropping it is a separate migration.';

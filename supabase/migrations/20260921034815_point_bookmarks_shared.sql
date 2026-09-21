-- T4 · point_bookmarks — shared per match.
--
-- Access model. Bookmarks are shared per match: anyone who can see the match
-- (creator, player identity or program membership — `visible_match_ids()`)
-- sees every bookmark row on its points and can remove any of them, matching
-- the one-shared-flag behaviour `points.saved` has always had. INSERT stays
-- own-row (`user_id = auth.uid()`, untouched here) so each row still records
-- who saved the point; a later design reads that for a "who saved it" badge.
-- No UPDATE policy, no `anon` grant, grants unchanged. `points.saved` and
-- `set_point_saved` are left alone — T6 drops the RPC and runs the final
-- backfill immediately before the client stops writing the flag.
--
-- T1's SELECT and DELETE policies carried a `user_id` term and names that now
-- lie; both are dropped and recreated under names that say what they gate.
--
-- Idempotent: every statement is guarded.

drop policy if exists "Users read their own point bookmarks" on public.point_bookmarks;
drop policy if exists "Users read point bookmarks on matches they can see" on public.point_bookmarks;
create policy "Users read point bookmarks on matches they can see"
  on public.point_bookmarks for select to authenticated
  using (
    exists (
      select 1 from public.points p
       where p.id = point_bookmarks.point_id
         and p.match_id in (select public.visible_match_ids())
    )
  );

drop policy if exists "Users remove their own point bookmarks" on public.point_bookmarks;
drop policy if exists "Users remove point bookmarks on matches they can see" on public.point_bookmarks;
create policy "Users remove point bookmarks on matches they can see"
  on public.point_bookmarks for delete to authenticated
  using (
    exists (
      select 1 from public.points p
       where p.id = point_bookmarks.point_id
         and p.match_id in (select public.visible_match_ids())
    )
  );

comment on table public.point_bookmarks is
  'One row per (user, point) bookmark, shared per match: anyone who can see the match reads and may remove every row; INSERT is own-row so rows record who saved. Supersedes the shared points.saved flag, which is kept as legacy.';

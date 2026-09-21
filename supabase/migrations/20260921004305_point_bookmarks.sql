-- T1 · point_bookmarks — per-user point bookmarks.
--
-- `points.saved` is a single flag on the point row, so one athlete's bookmark
-- was every viewer's bookmark: a coach saving a point for review marked it
-- saved for the player, and a program-mate who could see the match could not
-- keep a list of their own. This table moves the bookmark onto the
-- (user, point) pair. `points.saved` is left exactly as it is — `boolean not
-- null`, legacy — and is neither dropped nor altered here; readers migrate
-- to this table in later tasks.
--
-- Access model (three policies, `authenticated` only, no UPDATE):
--   * A row is always the caller's own: `user_id = auth.uid()` on read, write
--     and delete. An insert that names another user's id is refused.
--   * The point's match must be visible to the caller through the same
--     function every match-scoped table uses, `visible_match_ids()` (creator,
--     player identity, or program membership). Losing sight of a match —
--     leaving a program, say — hides the bookmark rather than deleting it;
--     regaining sight brings it back.
--   * A bookmark has no mutable field, so there is no UPDATE policy and no
--     `anon` grant. Toggling is insert / delete.
--
-- Cascades: deleting the auth user or the point removes the bookmark. Points
-- already cascade from their match.
--
-- Backfill: every `saved` point becomes a bookmark for the match's creator —
-- the only user the old flag could have belonged to. `on conflict do nothing`
-- keeps the migration re-runnable.
--
-- Idempotent: every statement is guarded.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.point_bookmarks (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  point_id    uuid not null references public.points (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, point_id)
);

comment on table public.point_bookmarks is
  'One row per (user, point) bookmark. Own rows only, gated by visible_match_ids(). Supersedes the shared points.saved flag, which is kept as legacy.';

-- The PK already serves user-leading reads. The loader looks bookmarks up by
-- point (`point_id in (...)` for a match's points), which needs its own index;
-- it is also the FK column, so the cascade from `points` walks it too.
create index if not exists point_bookmarks_point_id_idx
  on public.point_bookmarks (point_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Privileges and RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.point_bookmarks enable row level security;

revoke all on public.point_bookmarks from public, anon, authenticated;
grant select, insert, delete on public.point_bookmarks to authenticated;
grant all on public.point_bookmarks to service_role;

-- `(select auth.uid())` is evaluated once per statement, not once per row.
-- The `exists` on `points` runs under the points SELECT policy, which is the
-- same `visible_match_ids()` test — the check is written out here anyway so
-- this table's boundary is legible on its own.

drop policy if exists "Users read their own point bookmarks" on public.point_bookmarks;
create policy "Users read their own point bookmarks"
  on public.point_bookmarks for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.points p
       where p.id = point_bookmarks.point_id
         and p.match_id in (select public.visible_match_ids())
    )
  );

drop policy if exists "Users bookmark points on matches they can see" on public.point_bookmarks;
create policy "Users bookmark points on matches they can see"
  on public.point_bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.points p
       where p.id = point_bookmarks.point_id
         and p.match_id in (select public.visible_match_ids())
    )
  );

drop policy if exists "Users remove their own point bookmarks" on public.point_bookmarks;
create policy "Users remove their own point bookmarks"
  on public.point_bookmarks for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.points p
       where p.id = point_bookmarks.point_id
         and p.match_id in (select public.visible_match_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill from the legacy flag
-- ─────────────────────────────────────────────────────────────────────────────

-- `tests/point-bookmarks-db.spec.ts` carries this statement verbatim and
-- re-runs it against its own fixture rows; change one and change the other.
insert into public.point_bookmarks (user_id, point_id)
select m.created_by, p.id
  from public.points p
  join public.matches m on m.id = p.match_id
 where p.saved and m.created_by is not null
on conflict do nothing;

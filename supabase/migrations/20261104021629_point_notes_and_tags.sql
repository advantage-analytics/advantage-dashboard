-- Point notes and point tags — the Video tab's "This point" card.
--
-- Two things a workspace can attach to one point of its own match:
--
--   * point_notes — a short thread per point: who wrote it, the text, when.
--     A coach writes "split-step earlier", the player answers under it.
--   * point_tags + point_tag_links — a workspace's own tag vocabulary
--     ("Pattern to repeat", "Net approach") and which points carry which tag.
--
-- Who counts: the match's WORKSPACE, not everyone who can see the match.
-- `visible_match_ids()` also admits a user who has claimed the OPPONENT's
-- player profile on a team-uploaded match; coaching notes and tags must never
-- reach the other side of the net. So every rule here is
-- `point_in_my_workspace(point)`: the point's match is visible to the caller
-- AND the caller is its creator, or a member of its program on a team match.
-- `point_workspace_id(point)` is that workspace's id — `matches.program_id`
-- for a team match, `matches.created_by` for a personal one — the same value
-- `point_tags.account_id` (and `saved_views.account_id`) holds.
--
-- Access model (every policy `to authenticated`, `(select auth.uid())`):
--
--   point_notes
--     * read:   the match's workspace (`point_in_my_workspace`).
--     * insert: your own row only (`author_id = auth.uid()`), in that
--               workspace.
--     * update: your own row only, and only `body` (column grant). The
--               `edited_at` stamp is the server's fact (trigger).
--     * delete: your own row; on a team match, also the program's staff
--               (owner / coach / staff) — the `saved_views` moderation rule.
--
--   point_tags (vocabulary)
--     * `account_id` is the user's id (personal) or `programs.id` (team).
--       Read and create by the owner of the personal workspace or any member
--       of the program; delete your own tag, or any of the program's if staff.
--     * names are unique per workspace, case- and space-insensitively.
--
--   point_tag_links
--     * read / delete: the match's workspace.
--     * insert: your own row, in the match's workspace, with a tag OF that
--       workspace (`tag.account_id = point_workspace_id(point)`), so a
--       personal tag can never be pinned on a team's point or vice versa.
--
-- Author names: `public.users` only lets a user read their own row, so a
-- teammate's name cannot be joined through RLS. `point_note_authors(match)`
-- (SECURITY DEFINER) returns the display name and avatar path of every
-- author of a note on a match in the caller's workspace — no email.
--
-- Not on the public share page: `/m/[token]` reads through the service role
-- and the film tab never asks for notes or tags when read-only.
--
-- Cascades: deleting the auth user, the point (and so the match), or the tag
-- removes the rows that hang off it. `point_tags.account_id` is polymorphic
-- (no FK), as `saved_views.account_id` is.
--
-- Idempotent: every statement is guarded (policies behind pg_policies checks,
-- the trigger through `create or replace`), so the file re-runs cleanly.
--
-- Rollback, in this order: the function point_note_authors(uuid); the tables
-- point_tag_links, point_tags, point_notes; then the functions
-- point_notes_stamp(), point_in_my_workspace(uuid), point_workspace_id(uuid).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- The workspace a point belongs to: the program on a team match, the creator
-- on a personal one. SECURITY DEFINER so a policy can read it without the
-- caller's own RLS on matches deciding the answer; it says nothing about
-- whether the caller may see the point — `point_in_my_workspace` does.
create or replace function public.point_workspace_id(p_point_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(m.program_id, m.created_by)
    from public.points p
    join public.matches m on m.id = p.match_id
   where p.id = p_point_id;
$$;

-- The point's match is visible to the caller, and the caller is in its
-- workspace: its creator, or a member of its program on a team match.
create or replace function public.point_in_my_workspace(p_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.points p
      join public.matches m on m.id = p.match_id
     where p.id = p_point_id
       and m.id in (select public.visible_match_ids())
       and (
         m.created_by = auth.uid()
         or (m.program_id is not null
             and public.user_program_role(m.program_id) is not null)
       )
  );
$$;

revoke execute on function public.point_workspace_id(uuid) from public, anon;
revoke execute on function public.point_in_my_workspace(uuid) from public, anon;
grant execute on function public.point_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.point_in_my_workspace(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. point_notes
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.point_notes (
  id          uuid primary key default gen_random_uuid(),
  point_id    uuid not null references public.points (id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

comment on table public.point_notes is
  'A short thread per point, shared within the match''s workspace (point_in_my_workspace). Authors write and edit their own; program staff may delete on a team match.';

create index if not exists point_notes_point_id_created_at_idx
  on public.point_notes (point_id, created_at);
create index if not exists point_notes_author_id_idx
  on public.point_notes (author_id);

create or replace function public.point_notes_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.edited_at := now();
    -- Only `body` is updatable by grant; pin the rest for good measure.
    new.id := old.id;
    new.point_id := old.point_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
  else
    new.edited_at := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.point_notes_stamp() from public, anon, authenticated;

create or replace trigger point_notes_stamp
  before insert or update on public.point_notes
  for each row execute function public.point_notes_stamp();

alter table public.point_notes enable row level security;

revoke all on public.point_notes from public, anon, authenticated;
grant select, insert, delete on public.point_notes to authenticated;
grant update (body) on public.point_notes to authenticated;
grant all on public.point_notes to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_notes' and policyname = 'Workspace reads notes on its points') then
    create policy "Workspace reads notes on its points"
  on public.point_notes for select to authenticated
  using (public.point_in_my_workspace(point_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_notes' and policyname = 'Workspace members write their own notes') then
    create policy "Workspace members write their own notes"
  on public.point_notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.point_in_my_workspace(point_id)
  );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_notes' and policyname = 'Authors edit their own notes') then
    create policy "Authors edit their own notes"
  on public.point_notes for update to authenticated
  using (author_id = (select auth.uid()) and public.point_in_my_workspace(point_id))
  with check (author_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_notes' and policyname = 'Authors and program staff delete notes') then
    create policy "Authors and program staff delete notes"
  on public.point_notes for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.point_in_my_workspace(point_id))
    or exists (
      select 1
        from public.points p
        join public.matches m on m.id = p.match_id
       where p.id = point_notes.point_id
         and m.program_id is not null
         and public.is_program_staff(m.program_id)
    )
  );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. point_tags — the workspace's vocabulary
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.point_tags (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.point_tags is
  'A workspace''s point-tag vocabulary. account_id is the user id (personal) or programs.id (team), as in saved_views.';

create unique index if not exists point_tags_account_name_key
  on public.point_tags (account_id, lower(btrim(name)));

alter table public.point_tags enable row level security;

revoke all on public.point_tags from public, anon, authenticated;
grant select, insert, delete on public.point_tags to authenticated;
grant all on public.point_tags to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tags' and policyname = 'Members read their workspace tags') then
    create policy "Members read their workspace tags"
  on public.point_tags for select to authenticated
  using (
    account_id = (select auth.uid())
    or public.user_program_role(account_id) is not null
  );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tags' and policyname = 'Members create tags in their workspace') then
    create policy "Members create tags in their workspace"
  on public.point_tags for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      account_id = (select auth.uid())
      or public.user_program_role(account_id) is not null
    )
  );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tags' and policyname = 'Creators and program staff delete tags') then
    create policy "Creators and program staff delete tags"
  on public.point_tags for delete to authenticated
  using (
    (created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or public.is_program_staff(account_id)
  );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. point_tag_links — which points carry which tag
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.point_tag_links (
  point_id    uuid not null references public.points (id) on delete cascade,
  tag_id      uuid not null references public.point_tags (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (point_id, tag_id)
);

comment on table public.point_tag_links is
  'Point ↔ tag, within the match''s workspace: its members read, add (with the workspace''s own tags) and remove.';

create index if not exists point_tag_links_tag_id_idx
  on public.point_tag_links (tag_id);

alter table public.point_tag_links enable row level security;

revoke all on public.point_tag_links from public, anon, authenticated;
grant select, insert, delete on public.point_tag_links to authenticated;
grant all on public.point_tag_links to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tag_links' and policyname = 'Workspace reads tag links on its points') then
    create policy "Workspace reads tag links on its points"
  on public.point_tag_links for select to authenticated
  using (public.point_in_my_workspace(point_id));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tag_links' and policyname = 'Workspace tags its points with its own tags') then
    create policy "Workspace tags its points with its own tags"
  on public.point_tag_links for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.point_in_my_workspace(point_id)
    -- The tag must be the match's workspace's own (and readable — the
    -- point_tags SELECT policy applies inside this subquery).
    and exists (
      select 1 from public.point_tags t
       where t.id = point_tag_links.tag_id
         and t.account_id = public.point_workspace_id(point_tag_links.point_id)
    )
  );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'point_tag_links' and policyname = 'Workspace untags its points') then
    create policy "Workspace untags its points"
  on public.point_tag_links for delete to authenticated
  using (public.point_in_my_workspace(point_id));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. point_note_authors — names for the thread
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.point_note_authors(p_match_id uuid)
returns table (user_id uuid, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.id,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         u.avatar_path
    from public.point_notes n
    join public.points p on p.id = n.point_id
    join public.users u on u.id = n.author_id
   where p.match_id = p_match_id
     and public.point_in_my_workspace(p.id);
$$;

revoke execute on function public.point_note_authors(uuid) from public, anon;
grant execute on function public.point_note_authors(uuid) to authenticated, service_role;

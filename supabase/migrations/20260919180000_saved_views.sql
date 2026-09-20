create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,              -- Workspace.id: auth uid (personal) or programs.id (team)
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  cut         text not null check (cut in ('serve','returnPlacement','returnContact')),
  chart       text not null check (chart in ('scatter','zones')),
  filters     jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  shared      boolean not null default false, -- false = private to created_by (default); true = its creator shared it team-wide
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Names are unique within what one person can see as a list: the team's shared
-- views, and each person's own private views.
create unique index saved_views_shared_name_key
  on public.saved_views (account_id, lower(btrim(name))) where shared;
create unique index saved_views_private_name_key
  on public.saved_views (account_id, created_by, lower(btrim(name))) where not shared;
create index saved_views_account_order_idx on public.saved_views (account_id, sort_order);

alter table public.saved_views enable row level security;

-- Read: your personal views; a team's shared views if you are a member; your own private team views.
create policy saved_views_select on public.saved_views for select to authenticated
  using (
    account_id = (select auth.uid())
    or (public.user_program_role(account_id) is not null
        and (shared or created_by = (select auth.uid())))
  );

-- Create: always as yourself. Personal views are never shared; any team member
-- (player or staff) may create a view private or shared.
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (account_id = (select auth.uid()) and not shared)
      or public.user_program_role(account_id) is not null
    )
  );

-- Edit / delete: your own rows (including flipping shared on or off in a team);
-- staff may also manage a view once it is shared with the team (moderation).
create policy saved_views_update on public.saved_views for update to authenticated
  using (
    (created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or (shared and public.is_program_staff(account_id))
  )
  with check (
    (created_by = (select auth.uid())
      and ((account_id = (select auth.uid()) and not shared)
           or public.user_program_role(account_id) is not null))
    or public.is_program_staff(account_id)
  );

create policy saved_views_delete on public.saved_views for delete to authenticated
  using (
    (created_by = (select auth.uid())
      and (account_id = (select auth.uid()) or public.user_program_role(account_id) is not null))
    or (shared and public.is_program_staff(account_id))
  );

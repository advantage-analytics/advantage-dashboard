-- Program membership — the only thing that grants access to a team workspace.
-- Applied live 2026-08-17 as version 20260817073930.
--
-- Deliberately NOT `users.role`. That column is nullable free text with no enum
-- and no CHECK constraint, and it already carries 'founder' as a de-facto
-- entitlement; overloading it with program roles would make authorization
-- depend on a field nothing validates. Membership is a relation — one user may
-- belong to several programs, which `users.role` cannot express at all. A coach
-- running both the men's and women's teams is the common case, not the edge.
--
-- Two SECURITY DEFINER helpers come with it. Policies on this table have to ask
-- "is the caller a member of this program?", and asking that with a plain
-- subquery against this same table recurses forever. The helpers read it with
-- RLS bypassed, which is the standard escape and the reason they are `stable`
-- and pinned to an empty search_path.

create table if not exists public.program_members (
  id                        uuid primary key default gen_random_uuid(),
  program_id                uuid not null references public.programs(id) on delete cascade,
  user_id                   uuid not null references public.users(id) on delete cascade,
  role                      text not null,
  -- Off by default. The program's budget is the coach's to spend, so handing
  -- every invited player the ability to spend it is the wrong default even
  -- though it is the friendlier one.
  upload_enabled            boolean not null default false,
  -- Null means "draws from the program pool with no personal ceiling".
  monthly_minutes_allocated integer,
  invited_by                uuid references public.users(id) on delete set null,
  joined_at                 timestamptz not null default now()
);

alter table public.program_members
  drop constraint if exists program_members_role_check;
alter table public.program_members
  add constraint program_members_role_check
  check (role in ('owner', 'coach', 'staff', 'player'));

alter table public.program_members
  drop constraint if exists program_members_allocation_check;
alter table public.program_members
  add constraint program_members_allocation_check
  check (monthly_minutes_allocated is null or monthly_minutes_allocated >= 0);

-- One membership per person per program. Without this, a re-accepted invite
-- silently doubles a user's rows and every role check becomes ambiguous.
create unique index if not exists program_members_program_user_key
  on public.program_members (program_id, user_id);

-- Every RLS predicate below filters on user_id; the workspace switcher reads it
-- on every dashboard request. Unindexed, that policy is a sequential scan on
-- each row of every program-scoped query.
create index if not exists program_members_user_idx
  on public.program_members (user_id);

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

-- Programs the caller belongs to.
--
-- SECURITY DEFINER so it can read program_members without triggering the
-- policies defined on it. `stable` so the planner calls it once per statement
-- rather than once per row.
create or replace function public.user_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pm.program_id
    from public.program_members pm
   where pm.user_id = (select auth.uid());
$$;

-- The caller's role in one program, or null if they are not a member.
create or replace function public.user_program_role(p_program_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pm.role
    from public.program_members pm
   where pm.program_id = p_program_id
     and pm.user_id = (select auth.uid());
$$;

-- Does the caller hold a staff-level seat here? Owner, coach and staff all see
-- the whole program; players do not.
create or replace function public.is_program_staff(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.user_program_role(p_program_id) in ('owner', 'coach', 'staff'),
    false
  );
$$;

revoke all on function public.user_program_ids() from public;
revoke all on function public.user_program_role(uuid) from public;
revoke all on function public.is_program_staff(uuid) from public;
grant execute on function public.user_program_ids() to authenticated;
grant execute on function public.user_program_role(uuid) to authenticated;
grant execute on function public.is_program_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.program_members enable row level security;

grant select on public.program_members to authenticated;

-- Staff see the roster; a player sees only their own row.
--
-- A player who could enumerate the membership table would have the squad list
-- regardless of the owner's roster-visibility setting, which is exactly what
-- that setting exists to control.
drop policy if exists "Members are visible to program staff" on public.program_members;
create policy "Members are visible to program staff"
  on public.program_members for select
  using (
    user_id = (select auth.uid())
    or public.is_program_staff(program_id)
  );

-- No write policies. Invites, role changes and removals all run server-side
-- with the service role, so there is no path by which a member edits their own
-- role or upload permission from the browser.

comment on table public.program_members is
  'Who belongs to which program and what they may do. The only grant of team-workspace access.';
comment on column public.program_members.monthly_minutes_allocated is
  'Per-member ceiling within the program pool. NULL means no personal ceiling.';

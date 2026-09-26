-- What Settings › Team edits, and what Settings › Usage reads.
-- Applied live 2026-08-18 as version 20260818040338.
--
-- Three problems, one migration, because they are the same page's data:
--
--   1. The program row has no place to keep the facts the upload wizard would
--      otherwise ask for on every match — home venue, surface, season.
--   2. `programs` has a public SELECT policy and NO update policy, so team
--      identity is currently unwritable from the app. It stays that way: an
--      UPDATE policy cannot restrict *columns*, so granting staff `update` on
--      this table would also hand them `status` and `owner_user_id` — the two
--      fields the whole claim flow exists to protect. The write goes through a
--      SECURITY DEFINER function that touches only the safe columns instead.
--   3. `processing_usage` is scoped to `created_by = auth.uid()`, so a coach
--      cannot see the program's ledger at all — which is precisely what the
--      Usage page's program card is. Two read functions, membership-gated.

-- ---------------------------------------------------------------------------
-- 1 · Program identity the wizard can prefill from
-- ---------------------------------------------------------------------------

alter table public.programs add column if not exists home_venue      text;
alter table public.programs add column if not exists default_surface text;
alter table public.programs add column if not exists season          text;

-- Off by default, matching `program_members.upload_enabled`: the program's
-- budget is the coach's to spend, and the friendlier default is the wrong one.
alter table public.programs
  add column if not exists players_can_upload boolean not null default false;

alter table public.programs
  drop constraint if exists programs_default_surface_check;
alter table public.programs
  add constraint programs_default_surface_check
  check (default_surface is null or default_surface in ('hard', 'clay', 'grass', 'carpet'));

comment on column public.programs.home_venue is
  'Prefills the upload wizard so players do not retype it per match.';
comment on column public.programs.players_can_upload is
  'Program-wide policy. A member still needs program_members.upload_enabled.';

-- ---------------------------------------------------------------------------
-- 2 · The one writable slice of a program
-- ---------------------------------------------------------------------------

-- Named columns only. `status`, `owner_user_id`, `claimed_at` and every
-- directory/evidence field are unreachable from here by construction, which is
-- the entire reason this is a function and not a policy.
--
-- Null means "leave as is" for the text fields, so the caller can send a patch
-- rather than having to round-trip the whole row first. The two booleans are
-- required precisely because null is a meaningful "unchanged" for text and
-- would be ambiguous for a toggle.
create or replace function public.update_program_settings(
  p_program_id         uuid,
  p_school_name        text,
  p_team               text,
  p_conference         text,
  p_home_venue         text,
  p_default_surface    text,
  p_season             text,
  p_roster_visible     boolean,
  p_players_can_upload boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The authorization. `is_program_staff` is the same helper the members and
  -- invites policies use, so there is one answer to "may this person run the
  -- program" rather than a second definition drifting here.
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_team is not null and p_team not in ('mens', 'womens') then
    raise exception 'unknown squad %', p_team using errcode = '22023';
  end if;

  update public.programs
     set school_name        = coalesce(nullif(trim(p_school_name), ''), school_name),
         team               = coalesce(p_team, team),
         conference         = coalesce(nullif(trim(p_conference), ''), conference),
         home_venue         = coalesce(nullif(trim(p_home_venue), ''), home_venue),
         default_surface    = coalesce(p_default_surface, default_surface),
         season             = coalesce(nullif(trim(p_season), ''), season),
         roster_visible     = p_roster_visible,
         players_can_upload = p_players_can_upload,
         updated_at         = now()
   where id = p_program_id;
end;
$$;

revoke all on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean, boolean
) from public;
grant execute on function public.update_program_settings(
  uuid, text, text, text, text, text, text, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · The roster, with names
-- ---------------------------------------------------------------------------

-- `public.users` RLS is a blanket `auth.uid() = id`, so a coach cannot read a
-- single teammate's name through it. This is the lookup that comment in
-- active-workspace-server.ts anticipates.
--
-- Staff see the roster. A plain player sees it only when the program has opted
-- in via `roster_visible`, and sees themselves either way — the exact rule the
-- Team page states in its own copy.
create or replace function public.program_roster(p_program_id uuid)
returns table (
  user_id        uuid,
  display_name   text,
  email          text,
  role           text,
  upload_enabled boolean,
  joined_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select pm.user_id,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         u.email,
         pm.role,
         pm.upload_enabled,
         pm.joined_at
    from public.program_members pm
    join public.users u on u.id = pm.user_id
   where pm.program_id = p_program_id
     and (
       public.is_program_staff(p_program_id)
       or pm.user_id = (select auth.uid())
       or exists (
         select 1
           from public.programs p
          where p.id = p_program_id
            and p.roster_visible
            and p_program_id in (select public.user_program_ids())
       )
     )
   order by
     case pm.role when 'owner' then 0 when 'coach' then 1 when 'staff' then 2 else 3 end,
     pm.joined_at;
$$;

revoke all on function public.program_roster(uuid) from public;
grant execute on function public.program_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The program's ledger, one month at a time
-- ---------------------------------------------------------------------------

-- "Used" is defined exactly as `reserve_processing_quota` defines it: released
-- rows are refunds and do not count, and where a job has finished
-- `actual_seconds` is the truth. Two readers of one number that disagreed would
-- be worse than no page at all.
create or replace function public.program_usage_by_member(
  p_program_id    uuid,
  p_billing_month date
)
returns table (
  user_id      uuid,
  display_name text,
  used_seconds bigint,
  match_count  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select pu.created_by,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         coalesce(sum(coalesce(pu.actual_seconds, pu.reserved_seconds)), 0),
         count(distinct pj.match_id)
    from public.processing_usage pu
    join public.users u on u.id = pu.created_by
    left join public.processing_jobs pj on pj.id = pu.job_id
   where pu.account_id = p_program_id
     and pu.account_type = 'program'
     and pu.billing_month = p_billing_month
     and not pu.released
     -- A player sees their own line; staff see everyone's. The team total is a
     -- separate function so a player can still be shown what they are part of.
     and (public.is_program_staff(p_program_id) or pu.created_by = (select auth.uid()))
   group by pu.created_by, u.first_name, u.last_name
   order by 3 desc;
$$;

revoke all on function public.program_usage_by_member(uuid, date) from public;
grant execute on function public.program_usage_by_member(uuid, date) to authenticated;

-- The whole program's total for a month. Any member may read it — it is the
-- denominator on their own page and names nobody.
create or replace function public.program_usage_total(
  p_program_id    uuid,
  p_billing_month date
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_program_id in (select public.user_program_ids())
           then coalesce((
             select sum(coalesce(pu.actual_seconds, pu.reserved_seconds))
               from public.processing_usage pu
              where pu.account_id = p_program_id
                and pu.account_type = 'program'
                and pu.billing_month = p_billing_month
                and not pu.released
           ), 0)
           else 0
         end;
$$;

revoke all on function public.program_usage_total(uuid, date) from public;
grant execute on function public.program_usage_total(uuid, date) to authenticated;

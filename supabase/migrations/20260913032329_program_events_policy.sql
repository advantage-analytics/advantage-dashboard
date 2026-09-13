-- Team settings › Policies: who may change the program's schedule.
--
-- A second ladder beside `upload_policy`, over staff rungs only — players stay
-- read-only on the schedule. One rule covers every schedule write: creating,
-- editing and deleting events and lines, recording outcomes, adding opponent
-- players, and attaching a match to a scheduled line. Deleting an event keeps
-- its existing extra requirement of owner or coach on top.
--
-- Defaults to 'staff', which is exactly today's `is_program_staff` gate, so
-- no program's behaviour changes until its owner narrows it.

alter table public.programs
  add column if not exists events_policy text not null default 'staff';

alter table public.programs
  drop constraint if exists programs_events_policy_check;
alter table public.programs
  add constraint programs_events_policy_check
  check (events_policy in ('owner', 'owner_coaches', 'staff'));

-- ── The predicate ──────────────────────────────────────────────────────────
-- The SQL twin of `canManageTeamSchedule()` in `lib/workspace/types.ts`.
create or replace function public.can_manage_program_schedule(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select case p.events_policy
             when 'owner'         then m.role = 'owner'
             when 'owner_coaches' then m.role in ('owner', 'coach')
             else                      m.role in ('owner', 'coach', 'staff')
           end
      from public.program_members m
      join public.programs p on p.id = m.program_id
     where m.program_id = p_program_id
       and m.user_id = (select auth.uid())
  ), false);
$$;

revoke all on function public.can_manage_program_schedule(uuid) from public, anon;
grant execute on function public.can_manage_program_schedule(uuid) to authenticated, service_role;

-- ── RLS: events and entries ────────────────────────────────────────────────
drop policy if exists "Staff create events" on public.program_events;
drop policy if exists "Staff update events" on public.program_events;
drop policy if exists "Staff delete events" on public.program_events;

create policy "Schedule managers create events" on public.program_events
  for insert to authenticated
  with check (public.can_manage_program_schedule(program_id));
create policy "Schedule managers update events" on public.program_events
  for update to authenticated
  using (public.can_manage_program_schedule(program_id))
  with check (public.can_manage_program_schedule(program_id));
create policy "Schedule managers delete events" on public.program_events
  for delete to authenticated
  using (public.can_manage_program_schedule(program_id));

drop policy if exists "Staff create entries" on public.program_event_entries;
drop policy if exists "Staff update entries" on public.program_event_entries;
drop policy if exists "Staff delete entries" on public.program_event_entries;

create policy "Schedule managers create entries" on public.program_event_entries
  for insert to authenticated
  with check (public.can_manage_program_schedule(program_id));
create policy "Schedule managers update entries" on public.program_event_entries
  for update to authenticated
  using (public.can_manage_program_schedule(program_id))
  with check (public.can_manage_program_schedule(program_id));
create policy "Schedule managers delete entries" on public.program_event_entries
  for delete to authenticated
  using (public.can_manage_program_schedule(program_id));

-- ── RLS: outcomes ──────────────────────────────────────────────────────────
drop policy if exists "Staff create schedule outcomes" on public.program_event_outcomes;
drop policy if exists "Staff clear schedule outcomes" on public.program_event_outcomes;

create policy "Schedule managers create outcomes" on public.program_event_outcomes
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and public.can_manage_program_schedule(program_id)
  );
create policy "Schedule managers clear outcomes" on public.program_event_outcomes
  for delete to authenticated
  using (public.can_manage_program_schedule(program_id));

-- ── RPCs ───────────────────────────────────────────────────────────────────
create or replace function public.set_schedule_outcome(
  p_program_id uuid, p_entry_id uuid, p_round text, p_kind text, p_side text)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  line public.program_event_entries%rowtype;
  event_kind text;
begin
  if auth.uid() is null or not public.can_manage_program_schedule(p_program_id) then
    raise exception 'Your program limits schedule changes, so you can''t change outcomes.' using errcode = '42501';
  end if;
  select * into line from public.program_event_entries
    where id = p_entry_id and program_id = p_program_id for update;
  if not found then
    raise exception 'That line is unavailable in your active program.' using errcode = '42501';
  end if;
  select kind into event_kind from public.program_events where id = line.event_id;
  if event_kind = 'dual' and p_round is not null
    or event_kind = 'tournament' and (p_round is null or p_round not in
      ('Q1','Q2','Q3','R128','R64','R32','R16','QF','SF','F','C1','C2','C3'))
      and not (p_round is null and p_kind is null and p_side is null and line.forfeit is not null) then
    raise exception 'Choose a valid round; dual outcomes apply to the whole line.' using errcode = '23514';
  end if;
  if (p_kind is null) <> (p_side is null) then
    raise exception 'Choose both an outcome and its side, or clear both.' using errcode = '23514';
  end if;
  if p_kind is null then
    delete from public.program_event_outcomes where entry_id = line.id
      and round is not distinct from p_round;
    -- A legacy forfeit covers the entire entry. It must be cleared explicitly
    -- with null round (the compatibility action), never as a tournament round.
    if p_round is null then
      update public.program_event_entries set forfeit = null where id = line.id;
    end if;
  else
    if line.forfeit is not null or exists (select 1 from public.program_event_outcomes
      where entry_id = line.id and round is not distinct from p_round) then
      raise exception 'Clear the saved outcome or forfeit before changing it.' using errcode = '23514';
    end if;
    insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side)
      values(line.id,line.event_id,p_program_id,event_kind,p_round,p_kind,p_side);
  end if;
  return line.event_id;
end;
$function$;

create or replace function public.delete_schedule_event(p_program_id uuid, p_event_id uuid)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare deleted_id uuid;
begin
  -- The events policy first, then deleting's own extra rung: owner or coach.
  if auth.uid() is null
     or not public.can_manage_program_schedule(p_program_id)
     or not exists (select 1 from public.program_members m
       where m.program_id = p_program_id and m.user_id = auth.uid()
         and m.role in ('owner','coach')) then
    raise exception 'Only an owner or coach allowed to manage the schedule can delete an event.' using errcode = '42501';
  end if;
  delete from public.program_events where id = p_event_id and program_id = p_program_id
    returning id into deleted_id;
  if deleted_id is null then
    raise exception 'That event is unavailable in your active program.' using errcode = '42501';
  end if;
  return deleted_id;
end;
$function$;

-- Two long functions change by one call each. Swapped in place rather than
-- restated, and asserted, so a body that has drifted fails loudly here.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.contribute_opponent_player(uuid, uuid, text, text, integer)'::regprocedure);
  v_new := replace(v_def,
    'if not public.is_program_staff(p_program_id) then',
    'if not public.can_manage_program_schedule(p_program_id) then');
  if v_new = v_def then
    raise exception 'contribute_opponent_player: staff check not found';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.matches_block_client_regraft()'::regprocedure);
  v_new := replace(v_def,
    'if not public.is_program_staff(new.program_id) then',
    'if not public.can_manage_program_schedule(new.program_id) then');
  if v_new = v_def then
    raise exception 'matches_block_client_regraft: staff check not found';
  end if;
  execute v_new;
end;
$$;

-- ── Settings save ──────────────────────────────────────────────────────────
-- A new trailing parameter. Dropped and recreated rather than overloaded: two
-- signatures differing by one defaulted argument make PostgREST's call
-- ambiguous. Changing the events policy is owner-only — otherwise a coach
-- could lift an owner-only rule off themselves.
drop function if exists public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text);

create function public.update_program_settings(
  p_program_id uuid,
  p_school_name text,
  p_team text,
  p_conference text,
  p_home_venue text,
  p_default_surface text,
  p_season text,
  p_players_can_upload boolean,
  p_upload_policy text default null,
  p_events_policy text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cur record;
  v_policy text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_team is not null and p_team not in ('mens', 'womens') then
    raise exception 'unknown squad %', p_team using errcode = '22023';
  end if;

  if p_upload_policy is not null
     and p_upload_policy not in ('owner', 'owner_coaches', 'staff', 'everyone') then
    raise exception 'unknown upload policy %', p_upload_policy using errcode = '22023';
  end if;

  if p_events_policy is not null
     and p_events_policy not in ('owner', 'owner_coaches', 'staff') then
    raise exception 'unknown events policy %', p_events_policy using errcode = '22023';
  end if;

  select school_name, team, conference, upload_policy, events_policy
    into v_cur
    from public.programs
   where id = p_program_id
     for update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  if not public.is_program_owner(p_program_id) and (
       coalesce(nullif(trim(p_school_name), ''), v_cur.school_name) is distinct from v_cur.school_name
    or coalesce(p_team, v_cur.team)                                   is distinct from v_cur.team
    or coalesce(nullif(trim(p_conference), ''), v_cur.conference)     is distinct from v_cur.conference
  ) then
    raise exception 'Only the owner can change the program''s name, squad or conference.'
      using errcode = '42501';
  end if;

  if not public.is_program_owner(p_program_id)
     and coalesce(p_events_policy, v_cur.events_policy) is distinct from v_cur.events_policy then
    raise exception 'Only the owner can change who manages the schedule.'
      using errcode = '42501';
  end if;

  v_policy := coalesce(
    p_upload_policy,
    case
      when p_players_can_upload then 'everyone'
      when v_cur.upload_policy = 'everyone' then 'staff'
      else v_cur.upload_policy
    end
  );

  update public.programs
     set school_name        = coalesce(nullif(trim(p_school_name), ''), school_name),
         team               = coalesce(p_team, team),
         conference         = coalesce(nullif(trim(p_conference), ''), conference),
         home_venue         = coalesce(nullif(trim(p_home_venue), ''), home_venue),
         default_surface    = coalesce(p_default_surface, default_surface),
         season             = coalesce(nullif(trim(p_season), ''), season),
         upload_policy      = v_policy,
         players_can_upload = (v_policy = 'everyone'),
         events_policy      = coalesce(p_events_policy, events_policy),
         updated_at         = now()
   where id = p_program_id;
end;
$function$;

revoke all on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text, text) to authenticated, service_role;

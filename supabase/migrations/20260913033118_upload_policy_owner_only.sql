-- Team settings › Policies: the upload policy becomes owner-only to change,
-- matching `events_policy` (20260913032329). Staff could previously move the
-- ladder, which let a coach undo an owner-only rule for themselves. Every other
-- field `update_program_settings` saves keeps its existing rule.

create or replace function public.update_program_settings(
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

  -- Owner-only for the same reason as the events policy: a coach who could
  -- change it could lift an owner-only upload rule off themselves. Compared
  -- after resolution, so the legacy boolean path is covered too.
  if not public.is_program_owner(p_program_id)
     and v_policy is distinct from v_cur.upload_policy then
    raise exception 'Only the owner can change who can upload team matches.'
      using errcode = '42501';
  end if;

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


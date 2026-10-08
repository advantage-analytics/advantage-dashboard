-- Co-ed squads for clubs, high schools and academies.
--
-- `programs.team` allowed 'mens', 'womens' or null. A college is always one of
-- the two: they are separate directory rows with separate budgets. A custom
-- org (club / high_school / academy / other) was never asked, so all of them
-- sat at null — and a mixed club had no honest answer to give once Settings
-- showed it a two-option Squad menu.
--
-- This adds 'coed' for every org type but 'college', and teaches the five
-- places that validate the value:
--
--   * programs_team_check            — the vocabulary
--   * programs_college_fields_check  — a college stays mens | womens
--   * update_program_settings        — the owner's Settings save
--   * admin_create_program           — Admin › Teams › Create team
--   * admin_update_program_details   — Admin › Teams › Edit details
--   * create_custom_program          — self-serve setup, which now asks
--
-- Null keeps meaning "never said". No row is backfilled: nothing here can know
-- which of the three an existing club is.

alter table public.programs drop constraint programs_team_check;
alter table public.programs
  add constraint programs_team_check
  check (team is null or team in ('mens', 'womens', 'coed'));

alter table public.programs drop constraint programs_college_fields_check;
alter table public.programs
  add constraint programs_college_fields_check
  check (
    case
      when org_type = 'college' then
        program_key is not null
        and school_group is not null
        and team is not null
        and team in ('mens', 'womens')
      else program_key is null
    end
  );

-- ── update_program_settings ─────────────────────────────────────────────────
-- Body of 20260913033118 with 'coed' accepted and refused for a college.

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

  if p_team is not null and p_team not in ('mens', 'womens', 'coed') then
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

  select school_name, team, conference, upload_policy, events_policy, org_type
    into v_cur
    from public.programs
   where id = p_program_id
     for update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  -- A college is two directory rows, one per squad, each with its own budget;
  -- co-ed is a club's, a high school's or an academy's answer. The table's
  -- programs_college_fields_check would refuse this too, in words no form
  -- could show.
  if p_team = 'coed' and v_cur.org_type = 'college' then
    raise exception 'A collegiate program is men''s or women''s.'
      using errcode = '22023';
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

-- ── admin_create_program ────────────────────────────────────────────────────
-- Body of 20260914100200 with the same two rules.

create or replace function public.admin_create_program(
  p_org_type       text,
  p_school_name    text,
  p_team           text,
  p_program_key    text,
  p_school_group   text,
  p_division       text,
  p_conference     text,
  p_city           text,
  p_state          text,
  p_primary_domain text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text := btrim(coalesce(p_school_name, ''));
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Mirrors programs_org_type_check.
  if p_org_type is null
     or p_org_type not in ('college', 'club', 'high_school', 'academy', 'other') then
    raise exception 'invalid org type' using errcode = '22023';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  -- Mirrors programs_college_fields_check, in both directions.
  if p_org_type = 'college' then
    if btrim(coalesce(p_program_key, '')) = ''
       or btrim(coalesce(p_school_group, '')) = ''
       or btrim(coalesce(p_team, '')) = '' then
      raise exception 'a college program needs a program key, school group and team'
        using errcode = '22023';
    end if;
  elsif btrim(coalesce(p_program_key, '')) <> '' then
    raise exception 'program key is only for college programs'
      using errcode = '22023';
  end if;

  -- Mirrors programs_team_check, and the college half of
  -- programs_college_fields_check: co-ed is for every type but a college.
  if p_team is not null and btrim(p_team) <> '' then
    if btrim(p_team) not in ('mens', 'womens', 'coed') then
      raise exception 'team must be mens, womens or coed' using errcode = '22023';
    end if;
    if p_org_type = 'college' and btrim(p_team) = 'coed' then
      raise exception 'a college program is mens or womens' using errcode = '22023';
    end if;
  end if;

  -- Mirrors programs_division_check.
  if p_division is not null and btrim(p_division) <> ''
     and btrim(p_division) not in ('D1', 'D2', 'D3', 'NAIA', 'JUCO') then
    raise exception 'unknown division %', p_division using errcode = '22023';
  end if;

  insert into public.programs (
    org_type, school_name, team,
    program_key, school_group,
    division, conference, city, state, primary_domain,
    status, owner_user_id
  ) values (
    p_org_type, v_name, nullif(btrim(coalesce(p_team, '')), ''),
    nullif(btrim(coalesce(p_program_key, '')), ''),
    nullif(btrim(coalesce(p_school_group, '')), ''),
    nullif(btrim(coalesce(p_division, '')), ''),
    nullif(btrim(coalesce(p_conference, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_state, '')), ''),
    nullif(lower(btrim(coalesce(p_primary_domain, ''))), ''),
    'unclaimed', null
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- ── admin_update_program_details ────────────────────────────────────────────
-- Body of 20260926082507 with the same two rules. Null was already accepted
-- for a non-college program, which is how an admin clears a wrong squad.

create or replace function public.admin_update_program_details(
  p_program_id uuid,
  p_patch      jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c_allowed constant text[] := array[
    'school_name', 'team', 'city', 'state', 'staff_page_url',
    'primary_domain', 'home_venue', 'default_surface', 'time_zone',
    'upload_policy', 'events_policy', 'roster_public'
  ];
  v_cur       public.programs%rowtype;
  v_unknown   text[];

  -- Resolved new values; only read where the key is present in the patch.
  v_school_name     text;
  v_team            text;
  v_city            text;
  v_state           text;
  v_staff_page_url  text;
  v_primary_domain  text;
  v_home_venue      text;
  v_default_surface text;
  v_time_zone       text;
  v_upload_policy   text;
  v_events_policy   text;
  v_roster_public   boolean;

  v_changed jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object.' using errcode = '22023';
  end if;

  if p_patch = '{}'::jsonb then
    raise exception 'Nothing to change.' using errcode = '22023';
  end if;

  select array_agg(k order by k)
    into v_unknown
    from jsonb_object_keys(p_patch) as k
   where k <> all (c_allowed);

  if v_unknown is not null then
    raise exception 'Unknown field(s): %', array_to_string(v_unknown, ', ')
      using errcode = '22023';
  end if;

  select p.*
    into v_cur
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  -- ── Validate each present key against the live check constraints ────────

  if p_patch ? 'school_name' then
    v_school_name := nullif(trim(p_patch->>'school_name'), '');
    if v_school_name is null then
      raise exception 'School name is required.' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'team' then
    v_team := p_patch->>'team';
    if v_team is null then
      if v_cur.org_type = 'college' then
        raise exception 'A collegiate program must have a squad.'
          using errcode = '22023';
      end if;
    elsif v_team not in ('mens', 'womens', 'coed') then
      raise exception 'unknown squad %', v_team using errcode = '22023';
    elsif v_team = 'coed' and v_cur.org_type = 'college' then
      raise exception 'A collegiate program is men''s or women''s.'
        using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'city' then
    v_city := nullif(trim(p_patch->>'city'), '');
  end if;

  if p_patch ? 'state' then
    v_state := nullif(trim(p_patch->>'state'), '');
  end if;

  if p_patch ? 'staff_page_url' then
    v_staff_page_url := nullif(trim(p_patch->>'staff_page_url'), '');
  end if;

  if p_patch ? 'primary_domain' then
    v_primary_domain := nullif(trim(p_patch->>'primary_domain'), '');
  end if;

  if p_patch ? 'home_venue' then
    v_home_venue := nullif(trim(p_patch->>'home_venue'), '');
  end if;

  if p_patch ? 'default_surface' then
    v_default_surface := p_patch->>'default_surface';
    if v_default_surface is not null
       and v_default_surface not in ('hard', 'clay', 'grass', 'carpet') then
      raise exception 'unknown surface %', v_default_surface using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'time_zone' then
    v_time_zone := p_patch->>'time_zone';
    if v_time_zone is null or not public.is_iana_time_zone(v_time_zone) then
      raise exception 'unknown time zone %', coalesce(v_time_zone, '(null)')
        using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'upload_policy' then
    v_upload_policy := p_patch->>'upload_policy';
    if v_upload_policy is null
       or v_upload_policy not in ('owner', 'owner_coaches', 'staff', 'everyone') then
      raise exception 'unknown upload policy %', coalesce(v_upload_policy, '(null)')
        using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'events_policy' then
    v_events_policy := p_patch->>'events_policy';
    if v_events_policy is null
       or v_events_policy not in ('owner', 'owner_coaches', 'staff') then
      raise exception 'unknown events policy %', coalesce(v_events_policy, '(null)')
        using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'roster_public' then
    if jsonb_typeof(p_patch->'roster_public') <> 'boolean' then
      raise exception 'roster_public must be true or false.' using errcode = '22023';
    end if;
    v_roster_public := (p_patch->>'roster_public')::boolean;
  end if;

  -- ── Diff for the audit row: only the columns whose value moved ──────────

  if p_patch ? 'school_name' and v_school_name is distinct from v_cur.school_name then
    v_changed := v_changed || jsonb_build_object('school_name',
      jsonb_build_object('from', v_cur.school_name, 'to', v_school_name));
  end if;
  if p_patch ? 'team' and v_team is distinct from v_cur.team then
    v_changed := v_changed || jsonb_build_object('team',
      jsonb_build_object('from', v_cur.team, 'to', v_team));
  end if;
  if p_patch ? 'city' and v_city is distinct from v_cur.city then
    v_changed := v_changed || jsonb_build_object('city',
      jsonb_build_object('from', v_cur.city, 'to', v_city));
  end if;
  if p_patch ? 'state' and v_state is distinct from v_cur.state then
    v_changed := v_changed || jsonb_build_object('state',
      jsonb_build_object('from', v_cur.state, 'to', v_state));
  end if;
  if p_patch ? 'staff_page_url' and v_staff_page_url is distinct from v_cur.staff_page_url then
    v_changed := v_changed || jsonb_build_object('staff_page_url',
      jsonb_build_object('from', v_cur.staff_page_url, 'to', v_staff_page_url));
  end if;
  if p_patch ? 'primary_domain' and v_primary_domain is distinct from v_cur.primary_domain then
    v_changed := v_changed || jsonb_build_object('primary_domain',
      jsonb_build_object('from', v_cur.primary_domain, 'to', v_primary_domain));
  end if;
  if p_patch ? 'home_venue' and v_home_venue is distinct from v_cur.home_venue then
    v_changed := v_changed || jsonb_build_object('home_venue',
      jsonb_build_object('from', v_cur.home_venue, 'to', v_home_venue));
  end if;
  if p_patch ? 'default_surface' and v_default_surface is distinct from v_cur.default_surface then
    v_changed := v_changed || jsonb_build_object('default_surface',
      jsonb_build_object('from', v_cur.default_surface, 'to', v_default_surface));
  end if;
  if p_patch ? 'time_zone' and v_time_zone is distinct from v_cur.time_zone then
    v_changed := v_changed || jsonb_build_object('time_zone',
      jsonb_build_object('from', v_cur.time_zone, 'to', v_time_zone));
  end if;
  if p_patch ? 'upload_policy' and v_upload_policy is distinct from v_cur.upload_policy then
    v_changed := v_changed || jsonb_build_object('upload_policy',
      jsonb_build_object('from', v_cur.upload_policy, 'to', v_upload_policy));
  end if;
  if p_patch ? 'events_policy' and v_events_policy is distinct from v_cur.events_policy then
    v_changed := v_changed || jsonb_build_object('events_policy',
      jsonb_build_object('from', v_cur.events_policy, 'to', v_events_policy));
  end if;
  if p_patch ? 'roster_public' and v_roster_public is distinct from v_cur.roster_public then
    v_changed := v_changed || jsonb_build_object('roster_public',
      jsonb_build_object('from', v_cur.roster_public, 'to', v_roster_public));
  end if;

  -- One row per successful call — see the header.
  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'program.details_changed',
    null,
    jsonb_build_object('changed', v_changed, 'by_admin', true)
  );

  update public.programs
     set school_name     = case when p_patch ? 'school_name'     then v_school_name     else school_name     end,
         team            = case when p_patch ? 'team'            then v_team            else team            end,
         city            = case when p_patch ? 'city'            then v_city            else city            end,
         state           = case when p_patch ? 'state'           then v_state           else state           end,
         staff_page_url  = case when p_patch ? 'staff_page_url'  then v_staff_page_url  else staff_page_url  end,
         primary_domain  = case when p_patch ? 'primary_domain'  then v_primary_domain  else primary_domain  end,
         primary_domain_inferred
                         = case when p_patch ? 'primary_domain'  then false             else primary_domain_inferred end,
         home_venue      = case when p_patch ? 'home_venue'      then v_home_venue      else home_venue      end,
         default_surface = case when p_patch ? 'default_surface' then v_default_surface else default_surface end,
         time_zone       = case when p_patch ? 'time_zone'       then v_time_zone       else time_zone       end,
         upload_policy   = case when p_patch ? 'upload_policy'   then v_upload_policy   else upload_policy   end,
         players_can_upload
                         = case when p_patch ? 'upload_policy'   then (v_upload_policy = 'everyone') else players_can_upload end,
         events_policy   = case when p_patch ? 'events_policy'   then v_events_policy   else events_policy   end,
         roster_public   = case when p_patch ? 'roster_public'   then v_roster_public   else roster_public   end,
         updated_at      = now()
   where id = p_program_id;
end;
$function$;

-- ── create_custom_program ───────────────────────────────────────────────────
-- A third argument, the squad. Added as a NEW signature rather than by
-- replacing the two-argument one: the deployed app keeps calling
-- (p_name, p_org_type) until the build that asks the question ships, and a
-- dropped function would fail every team creation in between. The old
-- signature becomes a wrapper that passes null, the way create_program_invite
-- keeps its five-argument form.
--
-- Body of 20261002044101 otherwise unchanged.

create or replace function public.create_custom_program(p_name text, p_org_type text, p_team text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_team text := nullif(btrim(coalesce(p_team, '')), '');
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 'college' is deliberately not accepted: collegiate programs enter through
  -- the seeded directory and the claim flow, never through self-serve
  -- creation — that is what keeps the claim flow's review meaning anything.
  if p_org_type is null
     or p_org_type not in ('club', 'high_school', 'academy', 'other') then
    raise exception 'invalid org type' using errcode = '22023';
  end if;

  -- Mirrors programs_team_check. Null stays legal here — it is what the
  -- two-argument form below passes — but the setup form always sends one.
  if v_team is not null and v_team not in ('mens', 'womens', 'coed') then
    raise exception 'unknown squad %', v_team using errcode = '22023';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'name must be between 2 and 120 characters'
      using errcode = '22023';
  end if;

  -- Pilot terms: TA001 without a current-version acceptance. Before the
  -- lock and the cap, so a refused caller pays for nothing.
  perform public.assert_pilot_terms_accepted(v_uid);

  -- Serialize this user's creations, so two concurrent calls cannot both read
  -- "1 owned" and both insert. Transaction-scoped: releases on commit or
  -- rollback with no cleanup path.
  perform pg_advisory_xact_lock(
    hashtext('create_custom_program:' || v_uid::text)
  );

  -- At most two self-serve orgs per owner. Defense-in-depth on top of the
  -- reduced processing quota (splitstep/quota.ts): the cap is what bounds the
  -- blast radius if the tier mapping ever regresses. SQLSTATE 54000
  -- ("program_limit_exceeded" — for once the class name is literal) is what
  -- `createCustomProgram()` matches to say "limit reached" rather than
  -- "something failed".
  if (select count(*)
        from public.programs
       where owner_user_id = v_uid
         and org_type <> 'college') >= 2 then
    raise exception
      'custom org limit reached: one account may own at most 2'
      using errcode = '54000';
  end if;

  insert into public.programs (
    org_type, school_name,
    program_key, school_group, team,
    status, owner_user_id, claimed_at,
    roster_public
  ) values (
    p_org_type, v_name,
    null, null, v_team,
    'active', v_uid, now(),
    -- Private by default, unlike the collegiate directory rows the column's
    -- default was written for: pooled_roster() serves any program with this
    -- flag set, and a club's member names are not public scouting material
    -- until its owner says so.
    false
  )
  returning id into v_id;

  insert into public.program_members (program_id, user_id, role, upload_enabled)
  values (v_id, v_uid, 'owner', true);

  perform public.stamp_pilot_terms_acceptance(v_uid, v_id);

  return jsonb_build_object('program_id', v_id);
end;
$$;

create or replace function public.create_custom_program(p_name text, p_org_type text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_custom_program(p_name, p_org_type, null::text);
$$;

-- New functions in `public` reach authenticated and service_role by default
-- (20261001184305); stated anyway, because this one must never reach anon.
revoke all on function public.create_custom_program(text, text, text) from public, anon;
grant execute on function public.create_custom_program(text, text, text)
  to authenticated, service_role;

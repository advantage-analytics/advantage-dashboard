-- T2 · admin_update_program_details — one admin-only RPC for a program's details
--
-- PROVENANCE. Everything this migration reads or rewrites was taken from the
-- LIVE database on 2026-09-26 with `pg_get_functiondef` /
-- `pg_get_constraintdef` / `information_schema.columns`, not from this folder
-- — `supabase/migrations/` runs roughly 100 migrations behind the live ledger.
--
-- ── New function, not a widened `update_program_settings` ──────────────────
--
-- The task allowed either. Live `update_program_settings(uuid, text, text,
-- text, text, text, text, boolean, text, text)` (body read live) was ruled out
-- as the vehicle for three reasons:
--
--   1. It covers school_name, team, conference, home_venue, default_surface,
--      season, upload_policy, events_policy — not city, state, staff_page_url,
--      primary_domain, time_zone or roster_public. Adding six parameters means
--      a new overload beside the ten-arg one (PostgREST picks by argument
--      names, and every existing caller passes the old set), or changing the
--      signature under `settings/team` callers that are not this task's.
--   2. Its gates are member-facing: "only the owner may rename / change the
--      squad / change who uploads" with a coach allowed the rest. An admin is
--      neither, and stacking `or public.is_admin()` onto four separate owner
--      checks plus the staff check is five places to get wrong, in the
--      pattern `20260914100200_admin_program_rpcs.sql` used only for
--      single-gate functions.
--   3. Its "null means leave alone" convention cannot CLEAR a nullable column
--      (city, state, staff_page_url, primary_domain, home_venue,
--      default_surface). An admin fixing a scraped record needs exactly that.
--
-- So: `admin_update_program_details(p_program_id uuid, p_patch jsonb)`, in the
-- shape of `admin_set_pilot_end` / `admin_end_pilot`. The patch is a jsonb
-- object whose keys are the twelve editable column names; a key that is
-- PRESENT is written (present-with-null clears a nullable column), a key that
-- is ABSENT is left alone, and any other key raises. Twelve nullable
-- positional parameters could not tell "clear" from "leave alone".
--
-- ── Columns covered, with the live check each one is validated against ──────
--
--   school_name     text NOT NULL   trimmed, must be non-empty
--   team            text            programs_team_check: NULL | 'mens' | 'womens'
--                                   programs_college_fields_check: NOT NULL when
--                                   org_type = 'college' — enforced here too so
--                                   the caller gets a message, not a 23514
--   city, state, staff_page_url, primary_domain, home_venue
--                   text            trimmed, '' becomes NULL; no live check
--   default_surface text            programs_default_surface_check:
--                                   NULL | 'hard' | 'clay' | 'grass' | 'carpet'
--   time_zone       text NOT NULL   programs_time_zone_check: is_iana_time_zone()
--   upload_policy   text NOT NULL   programs_upload_policy_check:
--                                   'owner' | 'owner_coaches' | 'staff' | 'everyone'
--   events_policy   text NOT NULL   programs_events_policy_check:
--                                   'owner' | 'owner_coaches' | 'staff'
--   roster_public   boolean NOT NULL
--
-- Two companion columns move with their primary, as the live code already does:
--   players_can_upload      = (upload_policy = 'everyone'), the legacy boolean
--                             `update_program_settings` keeps in step;
--   primary_domain_inferred = false whenever primary_domain is in the patch —
--                             a domain an admin typed by hand is not inferred.
--
-- ── Audit ──────────────────────────────────────────────────────────────────
--
-- One `program_audit_log` row per successful call — ALWAYS, even when the
-- patch happens to equal the current row, so "did an admin touch this
-- program" has one answer. `details` is
--   { "changed": { "<column>": { "from": …, "to": … }, … }, "by_admin": true }
-- with only the columns whose value actually moved; an idempotent save logs
-- an empty `changed`.
--
-- The action is a NEW value, `program.details_changed`. Nothing in the live
-- vocabulary describes a program's own details being edited:
-- `program.conference_changed` is the one program-level action and names one
-- column; `player.updated` is a roster row. The constraint is rebuilt below
-- from the live definition (25 values as of T1, `20260926075216`, including
-- the `console.*` pair the unmerged admin-console branch added live and the
-- `pilot.*` pair T1 added) plus this one — 26.
--
-- ── Locking ────────────────────────────────────────────────────────────────
--
-- `for no key update`: none of the twelve columns is a key, so the weaker lock
-- suffices and does not block FKs into `programs` (KEY SHARE on this row).

-- ── Audit vocabulary ───────────────────────────────────────────────────────

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined',
    'pilot.end_changed', 'pilot.ended',
    'program.details_changed'
  ]));

-- ── admin_update_program_details ───────────────────────────────────────────

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
    elsif v_team not in ('mens', 'womens') then
      raise exception 'unknown squad %', v_team using errcode = '22023';
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

revoke execute on function public.admin_update_program_details(uuid, jsonb) from public;
revoke execute on function public.admin_update_program_details(uuid, jsonb) from anon;
grant  execute on function public.admin_update_program_details(uuid, jsonb) to authenticated;

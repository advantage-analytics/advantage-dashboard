-- T4 · Admin gates on existing program RPCs + two new admin-only RPCs
--
-- PROVENANCE. Every function recreated below was read from the LIVE database
-- with `pg_get_functiondef(oid)` on 2026-09-14, NOT from this migrations
-- folder — `supabase/migrations/` runs roughly 100 migrations behind the live
-- schema, so reconstructing from the repo copies would silently roll those
-- migrations back. What was read, verbatim signatures:
--
--   public.set_program_member_role(uuid, uuid, text) returns void
--   public.set_program_crest(uuid, text) returns void
--   public.create_program_invite(uuid, text, text, text, timestamptz)        -- 5-arg legacy shim
--   public.create_program_invite(uuid, text, text, text, timestamptz, uuid)  -- 6-arg, the real one
--   public.revoke_program_invite(uuid) returns void
--   public.transfer_program_ownership(uuid, uuid) returns void
--   public.create_custom_program(text, text) returns jsonb
--
-- Both `create_program_invite` overloads exist live. The 5-arg one is a
-- `language sql` shim that calls the 6-arg one with `p_player_id => null`;
-- it is deliberately NOT touched here — widening the 6-arg body widens it too.
-- `transfer_program_ownership` and `create_custom_program` are likewise left
-- alone: admins get the separate `admin_*` entry points below rather than a
-- widened gate on the member-facing ones (the member-facing bodies refuse
-- `p_new_owner = v_uid` / cap self-serve orgs per owner, which makes no sense
-- for an admin acting on someone else's program).
--
-- Gate helpers confirmed live:
--   public.is_admin() returns boolean
--     -> select coalesce((select u.is_admin from public.users u
--                          where u.id = (select auth.uid())), false)
--   public.is_program_staff(p_program_id uuid) returns boolean
--     -> public.user_program_role(p_program_id) in ('owner','coach','staff')
--
-- Constraints mirrored by `admin_create_program`, read live:
--   programs_org_type_check
--     CHECK (org_type = ANY (ARRAY['college','club','high_school','academy','other']))
--   programs_college_fields_check
--     CHECK (CASE WHEN org_type = 'college'
--                 THEN program_key IS NOT NULL AND school_group IS NOT NULL AND team IS NOT NULL
--                 ELSE program_key IS NULL END)
--   programs_team_check     CHECK (team IS NULL OR team = ANY (ARRAY['mens','womens']))
--   programs_division_check CHECK (division IS NULL OR division = ANY (ARRAY['D1','D2','D3','NAIA','JUCO']))
--   programs_status_check   CHECK (status = ANY (ARRAY['unclaimed','claim_pending','active','suspended']))
--
-- `public.program_audit_log` columns: (id bigint, program_id uuid not null,
-- actor_user_id uuid, action text not null, subject_id uuid,
-- details jsonb not null default '{}', created_at timestamptz not null).
-- `program_audit_log_action_check` ALREADY allows 'ownership.transferred'
-- (full allowed set read live), so no constraint widening is needed.
--
-- Existing grant shape on all of these, read from pg_proc.proacl:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. revoked from public + anon, execute to authenticated. Preserved below.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. set_program_member_role — live body, one added line
-- ─────────────────────────────────────────────────────────────────────────────
-- Addition: after the caller's program role is resolved, a platform admin is
-- treated as the owner for the rest of the function. Everything else is the
-- live definition verbatim.

create or replace function public.set_program_member_role(p_program_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_caller text;
  v_target text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_role = 'owner' then
    raise exception 'Ownership moves by transfer, not from this menu.'
      using errcode = '22023';
  end if;

  if p_role not in ('coach', 'staff', 'player') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  if p_user_id = v_uid then
    raise exception 'You can''t change your own role.' using errcode = '22023';
  end if;

  perform 1 from public.programs where id = p_program_id for update;

  v_caller := public.user_program_role(p_program_id);
  -- ADDED (T4): a platform admin acts with owner authority on any program,
  -- including one they are not a member of (where user_program_role() is null).
  if public.is_admin() then
    v_caller := 'owner';
  end if;
  if v_caller is null or v_caller not in ('owner', 'coach') then
    raise exception 'not authorized to change roles on this program'
      using errcode = '42501';
  end if;

  select pm.role into v_target
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = p_user_id;

  if v_target is null then
    raise exception 'That person is not on this program.' using errcode = '22023';
  end if;

  if v_target = 'owner' then
    raise exception 'The owner''s role moves by transfer.' using errcode = '42501';
  end if;

  if v_caller = 'coach'
     and (v_target not in ('staff', 'player') or p_role not in ('staff', 'player')) then
    raise exception 'Coaches can move people between staff and player. Coaches and the owner are the owner''s to change.'
      using errcode = '42501';
  end if;

  if v_target = p_role then
    return;
  end if;

  update public.program_members
     set role = p_role
   where program_id = p_program_id and user_id = p_user_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'member.role_changed', p_user_id,
          jsonb_build_object('from', v_target, 'to', p_role));
end;
$function$;

revoke all on function public.set_program_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_program_member_role(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. set_program_crest — live body, staff gate widened to admins
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_program_crest(p_program_id uuid, p_crest_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- WIDENED (T4): staff of the program, or a platform admin.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_crest_path is not null and p_crest_path not like p_program_id::text || '/%' then
    raise exception 'crest path must live under the program''s own prefix'
      using errcode = '22023';
  end if;

  update public.programs
     set crest_path = nullif(trim(p_crest_path), ''),
         updated_at = now()
   where id = p_program_id;
end;
$function$;

revoke all on function public.set_program_crest(uuid, text) from public, anon;
grant execute on function public.set_program_crest(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. create_program_invite (6-arg) — live body, staff gate widened to admins
-- ─────────────────────────────────────────────────────────────────────────────
-- The 5-arg overload is untouched; it delegates here, so it inherits this.

create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamp with time zone,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_email    text := lower(trim(p_email));
  v_seats    integer;
  v_used     integer;
  v_pending  integer;
  v_player   public.program_players;
  v_clash_id uuid;
  v_clash    text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- WIDENED (T4): staff of the program, or a platform admin.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to invite to this program'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address'
      using errcode = '22023';
  end if;

  -- Owner is absent on purpose: ownership moves by transfer, never by
  -- invitation, and a program with two owners has no answer to "who decides".
  if p_role not in ('coach', 'staff', 'player') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- Somebody already inside does not need a second way in, and accepting would
  -- collide with `program_members_program_user_key`.
  if exists (
    select 1
      from public.program_members pm
      join public.users u on u.id = pm.user_id
     where pm.program_id = p_program_id
       and lower(u.email) = v_email
  ) then
    raise exception 'that person is already on this roster'
      using errcode = '23505';
  end if;

  -- Seats are reserved at invite time, not at acceptance: the refusal belongs
  -- in front of the coach, who is the only person who can free a seat. The
  -- address being written is excluded from the pending count, so a RESEND of
  -- an open invitation never costs a second seat.
  select p.seats into v_seats from public.programs p where p.id = p_program_id;

  select count(*) into v_used
    from public.program_members pm where pm.program_id = p_program_id;

  select count(*) into v_pending
    from public.program_invites i
   where i.program_id = p_program_id
     and i.accepted_at is null
     and i.expires_at > now()
     and lower(i.email) <> v_email;

  if v_used + v_pending + 1 > coalesce(v_seats, 0) then
    raise exception
      'this program has % seats, and they are taken or reserved by open invitations',
      coalesce(v_seats, 0)
      using errcode = '54000';
  end if;

  if p_player_id is not null then
    select * into v_player
      from public.program_players
     where id = p_player_id
       and program_id = p_program_id
       and merged_into_id is null
       and archived_at is null;

    -- Checked against THIS program, so an id from somewhere else names nobody.
    -- It arrives from a browser and is untrusted.
    if not found then
      raise exception 'that player is not on this roster' using errcode = '22023';
    end if;

    if v_player.claimed_by_user_id is not null then
      raise exception '% already has an account',
        btrim(v_player.first_name || ' ' || v_player.last_name)
        using errcode = '23505';
    end if;

    -- The invitation carries the role the profile implies. A roster row is a
    -- player; inviting one as staff would bind a coach's login to an athlete's
    -- match history.
    if p_role <> 'player' then
      raise exception 'a roster player can only be invited as a player'
        using errcode = '22023';
    end if;

  else
    -- No target named, but this address is already on a coach-managed row. Do
    -- not create the duplicate; tell the caller which row it should attach to.
    --
    -- THIS LOOKUP MUST NEVER BE WIDENED. Not to `public.users`, and not to
    -- another program. As written it is not an enumeration oracle: the caller
    -- is authenticated staff of this one program, the candidate set is their
    -- own roster which they can already read in full through
    -- `program_roster_full`, and the comparison is equality on one program's
    -- rows.
    select pp.id, btrim(pp.first_name || ' ' || pp.last_name)
      into v_clash_id, v_clash
      from public.program_players pp
     where pp.program_id = p_program_id
       and pp.merged_into_id is null
       and pp.archived_at is null
       and pp.claimed_by_user_id is null
       and lower(pp.email) = v_email;

    if v_clash_id is not null then
      raise exception '% is already on this roster without an account', v_clash
        using errcode = 'P0001',
              detail  = v_clash_id::text,
              hint    = 'link_player';
    end if;
  end if;

  insert into public.program_invites
    (program_id, email, role, token_hash, invited_by, expires_at, player_id)
  values
    (p_program_id, v_email, p_role, p_token_hash, v_uid, p_expires_at, p_player_id)
  on conflict (program_id, lower(email)) where accepted_at is null
  do update set role       = excluded.role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                player_id  = excluded.player_id,
                created_at = now()
  returning id into v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'invite.created', v_id,
     jsonb_build_object('email', v_email, 'role', p_role, 'player_id', p_player_id));

  return v_id;
end;
$function$;

revoke all on function public.create_program_invite(uuid, text, text, text, timestamp with time zone, uuid) from public, anon;
grant execute on function public.create_program_invite(uuid, text, text, text, timestamp with time zone, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. revoke_program_invite — live body gated on staff only, widened to admins
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.revoke_program_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program uuid;
begin
  select program_id into v_program
    from public.program_invites
   where id = p_invite_id and accepted_at is null;

  if v_program is null then
    return;
  end if;

  -- WIDENED (T4): staff of the program, or a platform admin.
  if not (public.is_program_staff(v_program) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  delete from public.program_invites where id = p_invite_id;
end;
$function$;

revoke all on function public.revoke_program_invite(uuid) from public, anon;
grant execute on function public.revoke_program_invite(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_transfer_program_ownership — new, admin-only
-- ─────────────────────────────────────────────────────────────────────────────
-- The member-facing `transfer_program_ownership` demotes *the caller* and
-- refuses `p_new_owner = auth.uid()`. An admin is not the outgoing owner, so
-- this variant demotes whoever currently holds the role — and copes with a
-- program that has no owner row at all, which is exactly the state the admin
-- console exists to repair.

create or replace function public.admin_transfer_program_ownership(
  p_program_id uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid         uuid := (select auth.uid());
  v_old_owner   uuid;
  v_target_role text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform 1 from public.programs where id = p_program_id for update;
  if not found then
    raise exception 'that program does not exist' using errcode = '22023';
  end if;

  select pm.user_id into v_old_owner
    from public.program_members pm
   where pm.program_id = p_program_id and pm.role = 'owner'
   limit 1;

  if v_old_owner = p_new_owner then
    raise exception 'That person already owns this program.' using errcode = '22023';
  end if;

  select pm.role into v_target_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = p_new_owner;

  if v_target_role is null then
    raise exception 'That person is not on this program.' using errcode = '22023';
  end if;

  if v_target_role not in ('coach', 'staff') then
    raise exception 'Only a coach or staff member can take ownership. Promote them first.'
      using errcode = '22023';
  end if;

  if v_old_owner is not null then
    update public.program_members
       set role = 'coach'
     where program_id = p_program_id and user_id = v_old_owner;
  end if;

  update public.program_members
     set role = 'owner'
   where program_id = p_program_id and user_id = p_new_owner;

  update public.programs
     set owner_user_id = p_new_owner,
         updated_at    = now()
   where id = p_program_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'ownership.transferred', p_new_owner,
          jsonb_build_object('from', v_old_owner, 'to', p_new_owner, 'by_admin', true));
end;
$function$;

revoke all on function public.admin_transfer_program_ownership(uuid, uuid) from public, anon;
grant execute on function public.admin_transfer_program_ownership(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. admin_create_program — new, admin-only
-- ─────────────────────────────────────────────────────────────────────────────
-- `create_custom_program` deliberately refuses org_type 'college' and caps a
-- user at two self-serve orgs. An admin seeding a directory row needs neither
-- restriction, so this is a separate entry point rather than a widened gate.
-- The row lands `unclaimed` with no owner and no member rows — it is directory
-- data until somebody claims it.

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

  -- Mirrors programs_team_check.
  if p_team is not null and btrim(p_team) <> ''
     and btrim(p_team) not in ('mens', 'womens') then
    raise exception 'team must be mens or womens' using errcode = '22023';
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

revoke all on function public.admin_create_program(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_program(text, text, text, text, text, text, text, text, text, text) to authenticated;

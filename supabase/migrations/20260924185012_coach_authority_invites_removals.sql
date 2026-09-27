-- Coaches are the owner's to make and to remove (decision 2026-09-24).
--
-- `set_program_member_role` already holds that rule for role changes, but two
-- other doors let any staff member round it:
--   * `create_program_invite` accepted role 'coach' from any staff caller, so a
--     staff-role member could mint a coach the role menu would refuse them.
--   * `remove_program_member` refused only the owner, so staff could remove a
--     coach and a coach could remove another coach.
--
-- After this migration:
--   caller | may invite as         | may remove
--   owner  | coach, staff, player  | anyone but the owner
--   coach  | staff, player         | staff, player
--   staff  | staff, player         | player
-- A platform admin acts with owner authority, as in `set_program_member_role`.
--
-- `archive_program_player` delegates to `remove_program_member` for a claimed
-- profile, so it inherits the removal rule. The 5-argument
-- `create_program_invite` overload delegates to this one and is unchanged.
-- Bodies are the live definitions of 2026-09-24 plus the marked additions.

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
set search_path to ''
as $function$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text := lower(trim(p_email));
  v_seats     integer;
  v_used      integer;
  v_pending   integer;
  v_player    public.program_players;
  v_clash_id  uuid;
  v_clash     text;
  v_id        uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to invite to this program'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address'
      using errcode = '22023';
  end if;

  if p_role not in ('coach', 'staff', 'player') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- ADDED (2026-09-24): only the owner makes a coach, by invite as by role.
  if p_role = 'coach'
     and not (public.is_program_owner(p_program_id) or public.is_admin()) then
    raise exception 'Only the owner can invite a coach.'
      using errcode = '42501';
  end if;

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

  if p_player_id is not null then
    select * into v_player
      from public.program_players
     where id = p_player_id
       and program_id = p_program_id
       and merged_into_id is null
       and archived_at is null;

    if not found then
      raise exception 'that player is not on this roster' using errcode = '22023';
    end if;

    if v_player.claimed_by_user_id is not null then
      raise exception '% already has an account',
        btrim(v_player.first_name || ' ' || v_player.last_name)
        using errcode = '23505';
    end if;

    if p_role <> 'player' then
      raise exception 'a roster player can only be invited as a player'
        using errcode = '22023';
    end if;

  else
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

  if p_role = 'player' and p_player_id is null then
    select p.seats into v_seats
      from public.programs p where p.id = p_program_id for update;
    select c.used, c.pending into v_used, v_pending
      from public.program_seat_counts(p_program_id, v_email) c;

    if v_used + v_pending + 1 > coalesce(v_seats, 0) then
      raise exception
        'this program has % seats, and they are taken or reserved by open invitations',
        coalesce(v_seats, 0)
        using errcode = '54000';
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

  v_recipient := public.confirmed_user_for_email(v_email);
  if v_recipient is not null then
    insert into public.user_notifications
      (recipient_user_id, program_id, invite_id, kind, details)
    select v_recipient, p_program_id, v_id, 'invite.received',
           jsonb_build_object(
             'school_name', p.school_name,
             'team', p.team,
             'role', p_role
           )
      from public.programs p
     where p.id = p_program_id
    on conflict (invite_id, recipient_user_id)
    do update set details    = excluded.details,
                  created_at = now();
  end if;

  return v_id;
end;
$function$;

create or replace function public.remove_program_member(
  p_program_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role   text;
  v_caller text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- CHANGED (2026-09-24): a platform admin acts with owner authority.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = p_user_id;

  if v_role is null then
    return;
  end if;

  if v_role = 'owner' then
    raise exception 'transfer ownership before removing the owner'
      using errcode = '42501';
  end if;

  -- ADDED (2026-09-24): coaches are the owner's to remove, staff the owner's
  -- or a coach's. Mirrors `set_program_member_role`.
  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;

  if v_role = 'coach' and v_caller <> 'owner' then
    raise exception 'Coaches are the owner''s to remove.'
      using errcode = '42501';
  end if;

  if v_role = 'staff' and v_caller not in ('owner', 'coach') then
    raise exception 'Only the owner or a coach can remove staff.'
      using errcode = '42501';
  end if;

  delete from public.program_members
   where program_id = p_program_id and user_id = p_user_id;
end;
$function$;

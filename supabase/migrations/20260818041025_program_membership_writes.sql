-- The four writes Settings › Team performs on a roster.
-- Applied live 2026-08-18 as version 20260818041025.
--
-- `program_members` and `program_invites` each carry exactly one policy — a
-- SELECT — so today nothing in the app can add or remove anybody. That was
-- correct while the only writer was the claim flow's SECURITY DEFINER function.
-- The Team page adds four more, and they follow the same shape rather than
-- opening the tables up:
--
--   * An UPDATE/DELETE policy on `program_members` cannot restrict columns, so
--     "a coach may remove a player" would also be "a coach may promote
--     themselves to owner" — `role` is a column on the row being written.
--   * `program_invites.token_hash` must never round-trip through the browser.
--     A function taking the hash keeps the raw token in the server action that
--     minted it, which is the only place it should exist outside the email.
--
-- Every one is staff-gated through `is_program_staff`, the same helper the
-- SELECT policies use.

-- ---------------------------------------------------------------------------
-- Invite someone
-- ---------------------------------------------------------------------------

-- Re-inviting an address refreshes the open row instead of leaving two live
-- tokens, which is what `program_invites_open_email_key` already encodes. The
-- upsert makes "invite" and "resend" the same statement.
create or replace function public.create_program_invite(
  p_program_id uuid,
  p_email      text,
  p_role       text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text := lower(trim(p_email));
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to invite to this program'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email not like '%_@_%.__%' then
    raise exception 'that does not look like an email address'
      using errcode = '22023';
  end if;

  -- Owner is absent from the check constraint on purpose: ownership moves by
  -- transfer, never by invitation. Naming it here would fail loudly anyway.
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

  insert into public.program_invites
    (program_id, email, role, token_hash, invited_by, expires_at)
  values
    (p_program_id, v_email, p_role, p_token_hash, v_uid, p_expires_at)
  on conflict (program_id, lower(email)) where accepted_at is null
  do update set role       = excluded.role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_program_invite(uuid, text, text, text, timestamptz) from public;
grant execute on function public.create_program_invite(uuid, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Withdraw an invite
-- ---------------------------------------------------------------------------

-- Deletes rather than marks revoked: an unaccepted invite is not history worth
-- keeping, and leaving the row would keep its address occupying the
-- one-open-invite index against a later, legitimate invitation.
create or replace function public.revoke_program_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select program_id into v_program
    from public.program_invites
   where id = p_invite_id and accepted_at is null;

  if v_program is null then
    return; -- already accepted or already gone; clicking twice is ordinary
  end if;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  delete from public.program_invites where id = p_invite_id;
end;
$$;

revoke all on function public.revoke_program_invite(uuid) from public;
grant execute on function public.revoke_program_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Remove a member
-- ---------------------------------------------------------------------------

-- The owner is not removable from here. A program whose owner has been taken
-- off the roster has nobody who can change it back, and ownership already has
-- its own path: transfer.
create or replace function public.remove_program_member(
  p_program_id uuid,
  p_user_id    uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
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

  delete from public.program_members
   where program_id = p_program_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_program_member(uuid, uuid) from public;
grant execute on function public.remove_program_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Let one member spend the program's hours
-- ---------------------------------------------------------------------------

-- Separate from `programs.players_can_upload`: that is the program-wide policy,
-- this is the per-person grant. A player needs both, which is why neither one
-- can be inferred from the other.
create or replace function public.set_member_upload_enabled(
  p_program_id uuid,
  p_user_id    uuid,
  p_enabled    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  update public.program_members
     set upload_enabled = p_enabled
   where program_id = p_program_id and user_id = p_user_id;
end;
$$;

revoke all on function public.set_member_upload_enabled(uuid, uuid, boolean) from public;
grant execute on function public.set_member_upload_enabled(uuid, uuid, boolean) to authenticated;

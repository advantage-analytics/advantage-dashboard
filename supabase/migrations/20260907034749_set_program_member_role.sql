-- Roles get an editor. Until now "ask support to add another coach" was a
-- ticket for the most routine act in the calendar — an assistant joining in
-- August — because no function could change `program_members.role`.
--
-- Bounded so it cannot be gamed:
--   · the owner may set coach / staff / player on anyone but themselves;
--   · a coach may move people between staff and player only — roster admin,
--     which is the coach's job — and never touch a coach or the owner;
--   · nobody assigns `owner`. Ownership is GIVEN through
--     `transfer_program_ownership`, never taken from a menu — the same rule
--     `program_invites_role_check` encodes for invitations;
--   · nobody changes their own role. A coach demoting themselves to player
--     locks the program's second key in a drawer, and an owner promoting
--     themselves is a no-op with a confusing audit row.
--
-- A no-op (same role) returns without writing, so an audit row always means
-- something moved.

create or replace function public.set_program_member_role(
  p_program_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path to ''
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

revoke all on function public.set_program_member_role(uuid, uuid, text) from public;
revoke execute on function public.set_program_member_role(uuid, uuid, text) from anon;
grant execute on function public.set_program_member_role(uuid, uuid, text) to authenticated;

-- The verb the function writes. The list is an allowlist on purpose.
alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (
    action = any (array[
      'player.added',
      'player.updated',
      'player.archived',
      'player.claimed',
      'player.merged',
      'invite.created',
      'invite.revoked',
      'invite.accepted',
      'member.removed',
      'member.role_changed',
      'seats.changed',
      'member.account_deleted',
      'lineup.set',
      'ownership.transferred'
    ])
  );

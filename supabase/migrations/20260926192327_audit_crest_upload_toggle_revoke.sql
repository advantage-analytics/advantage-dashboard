-- Audit the three program writes that changed state without leaving a row in
-- `program_audit_log`, so they never reached the admin Team page's Activity
-- card (T20 fidelity follow-up; standing decision 5):
--
--   set_member_upload_enabled  → 'member.upload_changed'  (new action)
--   set_program_crest          → 'program.crest_changed'  (new action)
--   revoke_program_invite      → 'invite.revoked'         (already allowed,
--                                                         never written)
--
-- Each function keeps its signature, gate and behaviour; the only change is
-- the insert, written from `auth.uid()` like every other audited writer, and
-- only when something actually changed — a no-op call logs nothing.
--
-- The constraint is rebuilt from the LIVE list (26 values, read 2026-09-26
-- via pg_get_constraintdef) plus the two new ones. The repo's migration folder
-- runs behind the live ledger; do not rebuild this list from older files.

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
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed',
    'member.upload_changed', 'program.crest_changed'
  ]));

create or replace function public.set_member_upload_enabled(
  p_program_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before boolean;
begin
  -- Staff of THIS program, or a platform admin. The admin branch reads
  -- `users.is_admin` only; it never infers the program from the caller.
  if not (public.is_program_staff(p_program_id) or public.is_admin()) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  select m.upload_enabled into v_before
    from public.program_members m
   where m.program_id = p_program_id and m.user_id = p_user_id
     for no key update;

  -- The roster can outlive the membership it drew: `remove_program_member`
  -- leaves the claimed profile behind, so this switch renders for somebody
  -- with no row here. Silence would be reported to the coach as success.
  if not found then
    raise exception 'That player is no longer a member of this team, so there is nothing to grant. Reload the roster.'
      using errcode = 'P0002';
  end if;

  if v_before is not distinct from p_enabled then
    return;
  end if;

  update public.program_members
     set upload_enabled = p_enabled
   where program_id = p_program_id and user_id = p_user_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'member.upload_changed',
    p_user_id,
    jsonb_build_object('from', v_before, 'to', p_enabled)
  );
end;
$function$;

create or replace function public.set_program_crest(
  p_program_id uuid,
  p_crest_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before text;
  v_after  text := nullif(trim(p_crest_path), '');
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

  select p.crest_path into v_before
    from public.programs p
   where p.id = p_program_id
     for no key update;

  update public.programs
     set crest_path = v_after,
         updated_at = now()
   where id = p_program_id;

  if found and v_before is distinct from v_after then
    insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
    values (
      p_program_id,
      (select auth.uid()),
      'program.crest_changed',
      null,
      jsonb_build_object('removed', v_after is null)
    );
  end if;
end;
$function$;

create or replace function public.revoke_program_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program uuid;
  v_role    text;
  v_email   text;
begin
  select program_id, role, email into v_program, v_role, v_email
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

  -- Same `details` shape as `invite.created` (role + email), so the two
  -- rows of one invitation read as a pair.
  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_program,
    (select auth.uid()),
    'invite.revoked',
    p_invite_id,
    jsonb_build_object('role', v_role, 'email', v_email)
  );
end;
$function$;

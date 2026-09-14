-- Players can leave a team themselves.
--
-- `leave_program(p_program_id)` is `release_my_account_from_programs()` for ONE
-- program, minus the parts that only make sense when the login is going away:
--
--   * the caller's self-uploads filed under the program are re-pointed from
--     their login id to their roster profile, so the match history stays on
--     the profile a coach keeps managing;
--   * uploader columns on those program rows (matches.created_by,
--     processing_jobs.created_by, match_files.uploaded_by) are cleared — every
--     one of them is a per-creator RLS route that would otherwise keep the
--     team's matches and jobs readable (and matches editable) after leaving;
--   * processing_usage.created_by is KEPT: the login still exists, and the
--     program's per-person breakdown should keep naming who spent the hours;
--   * the profile is un-claimed (never archived — archiving is the coaches'
--     call), so a fresh invitation can claim it again;
--   * the membership row goes, which frees the seat.
--
-- Owners are refused: a program without an owner has nobody who can invite
-- anyone back. Calling it for a program you are not on is a no-op.

do $$
begin
  if exists (select 1 from pg_constraint
              where conname = 'program_audit_log_action_check'
                and conrelid = 'public.program_audit_log'::regclass) then
    alter table public.program_audit_log drop constraint program_audit_log_action_check;
  end if;
  alter table public.program_audit_log
    add constraint program_audit_log_action_check
    check (action = any (array[
      'player.added','player.updated','player.archived','player.claimed','player.merged',
      'invite.created','invite.revoked','invite.accepted',
      'member.removed','member.role_changed','seats.changed','member.account_deleted',
      'lineup.set','ownership.transferred','event.deleted','player.restored','match.attached',
      'member.left'
    ]));
end $$;

create or replace function public.leave_program(p_program_id uuid)
returns table (left_program boolean, profile_id uuid, matches_repointed integer)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_uid     uuid := (select auth.uid());
  v_role    text;
  v_profile uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the membership row so two concurrent calls cannot both proceed.
  select pm.role into v_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = v_uid
   for update;

  if v_role = 'owner' then
    raise exception 'transfer ownership of this program before leaving it'
      using errcode = '42501';
  end if;

  select pp.id into v_profile
    from public.program_players pp
   where pp.program_id = p_program_id
     and pp.claimed_by_user_id = v_uid
     and pp.merged_into_id is null
   limit 1;

  left_program := false;
  profile_id := v_profile;
  matches_repointed := 0;

  if v_role is null and v_profile is null then
    return next;
    return;
  end if;

  if v_profile is not null then
    with moved as (
      update public.matches m
         set player1_id = case
               when m.player1_id = v_uid then v_profile
               when m.player1_id is null and m.player2_id is null
                    and m.created_by = v_uid then v_profile
               else m.player1_id end,
             player2_id = case when m.player2_id = v_uid then v_profile
                               else m.player2_id end
       where m.program_id = p_program_id
         and (m.player1_id = v_uid or m.player2_id = v_uid
              or (m.player1_id is null and m.player2_id is null
                  and m.created_by = v_uid))
       returning m.id
    )
    select count(*) into matches_repointed from moved;
  end if;

  update public.processing_jobs pj set created_by = null
   where pj.created_by = v_uid
     and pj.match_id in (select m.id from public.matches m
                          where m.program_id = p_program_id);
  update public.match_files mf set uploaded_by = null
   where mf.uploaded_by = v_uid
     and mf.match_id in (select m.id from public.matches m
                          where m.program_id = p_program_id);
  update public.matches m set created_by = null
   where m.program_id = p_program_id and m.created_by = v_uid;

  if v_profile is not null then
    update public.program_players pp
       set claimed_by_user_id = null,
           claimed_at = null,
           updated_at = now()
     where pp.id = v_profile;
  end if;

  delete from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = v_uid;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'member.left', v_profile,
     jsonb_build_object(
       'role', v_role,
       'matches_repointed', matches_repointed));

  left_program := true;
  return next;
end;
$$;

comment on function public.leave_program(uuid) is
  'A member leaves one program: re-points their self-uploads there to their roster '
  'profile, clears uploader columns on that program''s rows, un-claims the profile, '
  'drops the membership, audits member.left. Refuses owners (42501). No-op when not on it.';

revoke execute on function public.leave_program(uuid) from public, anon;
grant  execute on function public.leave_program(uuid) to authenticated;

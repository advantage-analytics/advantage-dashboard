-- Join links, third pass: the Members tray, mode-change audit, and the audit
-- constraint that lost our verbs.
--
--   1. `program_audit_log_action_check` is re-created from the LIVE list.
--      20261007214009 added `join_link.created/.revoked/.accepted`; a later
--      migration (`coed_squads`, 20261007221339) rebuilt the constraint from
--      its own copy of the list and dropped them again, so every join-link RPC
--      failed on its audit insert. This list is the live one as read on
--      2026-10-07 plus the four join-link verbs. Any migration that touches
--      this constraint must read the live list first, never a repo copy.
--   2. `set_program_join_link_mode` writes `join_link.mode_changed`.
--   3. `program_recent_joins` — the Members tray — counts `join_link.accepted`
--      beside `invite.accepted`, so a player who joined by link shows up.
--
-- Applied live as the version in this file's name.

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
    'program.details_changed', 'member.upload_changed',
    'program.crest_changed', 'console.submission_reconciled',
    'match.detached', 'match.round_changed', 'pilot.eligibility_changed',
    'join_link.created', 'join_link.revoked', 'join_link.accepted',
    'join_link.mode_changed'
  ]));

-- ── 2. set_program_join_link_mode: audited ──────────────────────────────────
create or replace function public.set_program_join_link_mode(
  p_program_id uuid,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_caller text;
  v_id     uuid;
  v_from   text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_mode not in ('open', 'approve') then
    raise exception 'unknown join link mode %', p_mode using errcode = '22023';
  end if;

  v_caller := public.user_program_role(p_program_id);
  if public.is_admin() then
    v_caller := 'owner';
  end if;
  if v_caller is null or v_caller not in ('owner', 'coach') then
    raise exception 'Only the owner and coaches can change who the link admits.'
      using errcode = '42501';
  end if;

  select l.id, l.mode into v_id, v_from
    from public.program_join_links l
   where l.program_id = p_program_id
     and l.revoked_at is null
   for update;

  if v_id is null then
    raise exception 'This program has no join link.' using errcode = '22023';
  end if;

  -- Same rung twice is not a change and writes nothing.
  if v_from = p_mode then
    return;
  end if;

  update public.program_join_links
     set mode = p_mode
   where id = v_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (p_program_id, v_uid, 'join_link.mode_changed', v_id,
     jsonb_build_object('from', v_from, 'mode', p_mode));
end;
$function$;

revoke all on function public.set_program_join_link_mode(uuid, text) from public, anon;
grant execute on function public.set_program_join_link_mode(uuid, text) to authenticated, service_role;

-- ── 3. program_recent_joins: link joins count ───────────────────────────────
-- Body identical to live (20260921055301) except the action filter. A link
-- join carries no `invite_id`, so `via_request` is false for it, which is
-- the truth: nobody approved anything.
create or replace function public.program_recent_joins(
  p_program_id uuid,
  p_since timestamptz,
  p_limit integer default 10
)
returns table (
  joined_at timestamptz,
  user_id uuid,
  first_name text,
  last_name text,
  role text,
  via_request boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select j.created_at,
         j.actor_user_id,
         u.first_name,
         u.last_name,
         j.details ->> 'role',
         exists (
           select 1
             from public.program_audit_log r
            where r.program_id = j.program_id
              and r.action = 'join_request.approved'
              and r.details ->> 'invite_id' = j.subject_id::text
         )
    from (
      select distinct on (a.actor_user_id) a.*
        from public.program_audit_log a
       where a.program_id = p_program_id
         and public.is_program_staff(p_program_id)
         and a.action in ('invite.accepted', 'join_link.accepted')
         and a.created_at >= p_since
         and a.actor_user_id <> (select auth.uid())
       order by a.actor_user_id, a.created_at desc
    ) j
    join public.users u on u.id = j.actor_user_id
   order by j.created_at desc
   limit least(greatest(p_limit, 1), 25);
$function$;

revoke all on function public.program_recent_joins(uuid, timestamptz, integer) from public, anon;
grant execute on function public.program_recent_joins(uuid, timestamptz, integer) to authenticated, service_role;

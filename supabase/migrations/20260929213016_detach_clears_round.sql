-- Both event detaches now clear `round` too.
--
-- 20260929210705 (event delete) and 20260929210741 (single-match detach)
-- cleared `event_entry_id` and `tournament_name` and deliberately left
-- `round`, on the reading that the round describes the match. It does not:
-- a round only means something inside the bracket or dual line that gave it
-- — "Semifinal" of which tournament, "S1" of which dual? Once the match is
-- off its line the value is a dangling label, and the Edit Match dialog
-- would carry it into whatever line the match is attached to next. Author's
-- decision 2026-09-29: `round` is cleared on both paths, for dual and
-- tournament lines alike. `date`, `match_type` and `court_type` still stay —
-- those hold without a line.
--
-- Nothing else moves. Both bodies below were read live with
-- pg_get_functiondef on 2026-09-29 and are identical to the two migrations
-- above except for the `round = null` line in each detach UPDATE.
-- `matches_block_client_regraft` is untouched: it gates the
-- `event_entry_id` transition, not the columns cleared alongside it.
-- `guard_schedule_result` and `guard_reserved_schedule_result` both return
-- early when the new `event_entry_id` is NULL, so clearing `round` on the way
-- off a line cannot trip an outcome check. Reviewed exception updated in
-- docs/ui-revamp-guardrails.md.

-- 1. Event delete: the BEFORE DELETE detach on program_events.
create or replace function schedule_private.guard_event_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare detached_matches integer;
begin
  if not exists (select 1 from public.programs where id = old.program_id) then
    return old;
  end if;
  if auth.uid() is null then
    if current_setting('role', true) in ('anon','authenticated') then
      raise exception 'Only an owner or coach can delete an event.' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (select 1 from public.program_members m
    where m.program_id = old.program_id and m.user_id = auth.uid()
      and m.role in ('owner','coach')) then
    raise exception 'Only an owner or coach can delete an event.' using errcode = '42501';
  end if;
  update public.program_event_entries set id = id where event_id = old.id;
  select count(*) into detached_matches
    from public.matches m join public.program_event_entries l
    on l.id = m.event_entry_id where l.event_id = old.id;
  perform set_config('advantage.detach_event_id', old.id::text, true);
  update public.matches
     set event_entry_id = null,
         tournament_name = null,
         round = null
   where event_entry_id in (
     select id from public.program_event_entries where event_id = old.id
   );
  perform set_config('advantage.detach_event_id', '', true);
  insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
    values(old.program_id, auth.uid(), 'event.deleted', old.id,
      jsonb_build_object('name', old.name, 'kind', old.kind,
        'detached_matches', detached_matches));
  return old;
end;
$$;

-- 2. Single-match detach from the Edit Match dialog.
create or replace function public.detach_match_from_event_line(
  p_match_id uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_match record;
  v_entry record;
  v_event record;
begin
  if v_uid is null then
    raise exception 'Sign in to remove a match from an event.' using errcode = '42501';
  end if;

  select id, program_id, event_entry_id, created_by
    into v_match
    from public.matches
   where id = p_match_id
   for update;
  if not found or v_match.created_by is distinct from v_uid then
    raise exception 'Only the person who added this match can remove it from an event.'
      using errcode = '42501';
  end if;
  if v_match.event_entry_id is null then
    raise exception 'This match is not on an event.' using errcode = '23514';
  end if;
  if not public.can_manage_program_schedule(v_match.program_id) then
    raise exception 'Only people who run the schedule can remove a match from an event.'
      using errcode = '42501';
  end if;

  select id, event_id, program_id
    into v_entry
    from public.program_event_entries
   where id = v_match.event_entry_id
   for update;
  if not found then
    raise exception 'That line is no longer on the schedule.' using errcode = '23514';
  end if;

  select id, kind, name
    into v_event
    from public.program_events
   where id = v_entry.event_id;

  perform set_config('advantage.detach_match_id', v_match.id::text, true);
  update public.matches
     set event_entry_id = null,
         tournament_name = null,
         round = null
   where id = v_match.id;
  perform set_config('advantage.detach_match_id', '', true);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_match.program_id, v_uid, 'match.detached', v_match.id,
    jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'entry_id', v_entry.id,
    'event_id', v_event.id,
    'event_name', v_event.name,
    'event_kind', v_event.kind
  );
end;
$function$;

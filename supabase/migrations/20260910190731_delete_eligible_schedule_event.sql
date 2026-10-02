-- Live catalog verified 2026-09-10: events cascade entries; matches SET NULL
-- on entry deletion; audit has no client writes. Never detach recorded matches.
alter table public.program_audit_log drop constraint program_audit_log_action_check;
alter table public.program_audit_log add constraint program_audit_log_action_check
  check (action in ('player.added','player.updated','player.archived','player.claimed',
    'player.merged','invite.created','invite.revoked','invite.accepted','member.removed',
    'member.role_changed','seats.changed','member.account_deleted','lineup.set',
    'ownership.transferred','event.deleted'));

-- Trigger-only definer sees dependencies hidden by RLS and writes the audit.
-- Retain administrative service-role/program cleanup behavior (no user JWT).
create function schedule_private.guard_event_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A program deletion owns its established cascade/retention semantics.
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
  -- DELETE already locks the event, blocking new entry FK checks. Version all
  -- entries to serialize with T5 match/outcome writes and legacy forfeit edits.
  -- READ COMMITTED sees their committed writes; repeatable read aborts on a
  -- changed entry instead of relying on a stale dependency snapshot.
  update public.program_event_entries set id = id where event_id = old.id;
  if exists (select 1 from public.program_event_entries l
      where l.event_id = old.id and l.forfeit is not null)
    or exists (select 1 from public.program_event_outcomes where event_id = old.id)
    or exists (select 1 from public.matches m join public.program_event_entries l
      on l.id = m.event_entry_id where l.event_id = old.id) then
    raise exception 'This event has recorded matches or outcomes and cannot be deleted.' using errcode = '23514';
  end if;
  insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
    values(old.program_id, auth.uid(), 'event.deleted', old.id,
      jsonb_build_object('name', old.name, 'kind', old.kind));
  return old;
end;
$$;
revoke all on function schedule_private.guard_event_delete() from public, anon, authenticated;
create trigger guard_event_delete before delete on public.program_events
  for each row execute function schedule_private.guard_event_delete();

create function public.delete_schedule_event(p_program_id uuid, p_event_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare deleted_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.program_members m
    where m.program_id = p_program_id and m.user_id = auth.uid()
      and m.role in ('owner','coach')) then
    raise exception 'Only an owner or coach can delete an event.' using errcode = '42501';
  end if;
  delete from public.program_events where id = p_event_id and program_id = p_program_id
    returning id into deleted_id;
  if deleted_id is null then
    raise exception 'That event is unavailable in your active program.' using errcode = '42501';
  end if;
  return deleted_id;
end;
$$;
revoke all on function public.delete_schedule_event(uuid,uuid) from public, anon;
grant execute on function public.delete_schedule_event(uuid,uuid) to authenticated;

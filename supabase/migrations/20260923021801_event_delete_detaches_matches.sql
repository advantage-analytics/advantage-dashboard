-- Supersedes the "Never detach recorded matches" rule in
-- 20260910190731_delete_eligible_schedule_event.sql (decision 2026-09-22):
-- an event with recorded matches, forfeits or outcomes is deletable, and its
-- matches survive as unassigned program matches. A match owns its own data
-- (stats, points, shots, video) and `matches.event_entry_id` is already
-- `on delete set null`, so entries cascading from the event only detaches it.
-- Outcomes are event-scoped bookkeeping with nothing of their own to keep, so
-- their two RESTRICT scope FKs become cascades. The audit row records how many
-- matches were detached; the before-delete trigger counts them ahead of the
-- entry cascade.
alter table public.program_event_outcomes
  drop constraint if exists program_event_outcomes_entry_scope_fkey;
alter table public.program_event_outcomes
  add constraint program_event_outcomes_entry_scope_fkey
  foreign key (entry_id, event_id, program_id)
  references public.program_event_entries(id, event_id, program_id)
  on update restrict on delete cascade;
alter table public.program_event_outcomes
  drop constraint if exists program_event_outcomes_event_scope_fkey;
alter table public.program_event_outcomes
  add constraint program_event_outcomes_event_scope_fkey
  foreign key (event_id, program_id, event_kind)
  references public.program_events(id, program_id, kind)
  on update restrict on delete cascade;

-- Trigger `guard_event_delete` on public.program_events already exists and the
-- revoke from public/anon/authenticated is already in place.
create or replace function schedule_private.guard_event_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare detached_matches integer;
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
  -- entries to serialize with match/outcome writes and legacy forfeit edits so
  -- the count below sees their committed writes.
  update public.program_event_entries set id = id where event_id = old.id;
  select count(*) into detached_matches
    from public.matches m join public.program_event_entries l
    on l.id = m.event_entry_id where l.event_id = old.id;
  insert into public.program_audit_log(program_id, actor_user_id, action, subject_id, details)
    values(old.program_id, auth.uid(), 'event.deleted', old.id,
      jsonb_build_object('name', old.name, 'kind', old.kind,
        'detached_matches', detached_matches));
  return old;
end;
$$;

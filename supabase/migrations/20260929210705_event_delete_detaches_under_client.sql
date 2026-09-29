-- Deleting an event that holds a match failed for every signed-in user.
-- 20260923021801_event_delete_detaches_matches.sql made the event deletable
-- and relied on `matches_event_entry_id_fkey ON DELETE SET NULL` to detach
-- its matches, but that referential UPDATE fires `matches_block_client_regraft`
-- like any other, and under a client JWT (`request.jwt.claims->>'role' =
-- 'authenticated'`) the trigger refuses every entry → NULL move with 42501, so
-- the whole `delete_schedule_event` call rolled back. The spec passed only
-- because its actor set `request.jwt.claim.sub` and never `request.jwt.claims`.
--
-- The detach now happens explicitly inside `guard_event_delete` (BEFORE DELETE
-- on program_events, while the entries still exist), under a transaction-local
-- marker naming the event, and the regraft trigger accepts an entry → NULL move
-- only while that marker names the event the old entry belongs to. Every other
-- refusal in the trigger is unchanged. By the time the entry cascade and its
-- FK SET NULL run, no match references those entries, so the FK has nothing
-- left to update. Detaching clears `tournament_name` too, since the event that
-- gave the match that name is gone; `match_type`, `round`, `date` and
-- `court_type` stay — they describe the match, not the schedule line.
-- `detached_matches` in the audit row is still counted before the detach.
-- Reviewed exception recorded in docs/ui-revamp-guardrails.md.

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
  -- Detach the matches here, while the entries still exist, under the marker
  -- `matches_block_client_regraft` checks for an entry → NULL move. The FK's
  -- ON DELETE SET NULL then finds nothing left to update. The marker is
  -- transaction-local and cleared right after, so nothing else in the
  -- transaction can ride on it.
  perform set_config('advantage.detach_event_id', old.id::text, true);
  update public.matches
     set event_entry_id = null,
         tournament_name = null
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

create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
  v_refusal text;
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.can_manage_program_schedule(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    if new.program_id is not null
       and new.player1_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player1_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player1_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that player is not on this program''s roster, so the match cannot be filed under it'
        using errcode = '42501';
    end if;

    if public.match_is_upload_shaped(new.source_provider, new.analysis_method) then
      v_refusal := public.upload_eligibility_refusal(
        new.program_id, new.player1_id, new.created_by, (select auth.uid()));
      if v_refusal is not null then
        raise exception '%', v_refusal using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  if new.program_id is distinct from old.program_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  if new.event_entry_id is distinct from old.event_entry_id then
    if old.event_entry_id is not null and new.event_entry_id is null then
      -- Off a line: only while `schedule_private.guard_event_delete` is
      -- detaching the matches of the event being deleted, which it marks by
      -- event id. The entry still exists at that point, so its event can be
      -- looked up; a bare client UPDATE, or one naming another event, is
      -- refused exactly as before.
      if coalesce(current_setting('advantage.detach_event_id', true), '') = ''
         or not exists (
           select 1 from public.program_event_entries e
            where e.id = old.event_entry_id
              and e.event_id::text = current_setting('advantage.detach_event_id', true)
         ) then
        raise exception
          'which program and line a match belongs to is set when it is created'
          using errcode = '42501';
      end if;
    elsif coalesce(current_setting('advantage.attach_match_id', true), '') <> old.id::text
       or old.event_entry_id is not null
       or new.event_entry_id is null
       or old.program_id is null
       or not public.can_manage_program_schedule(old.program_id)
       or not exists (
         select 1 from public.program_event_entries e
          where e.id = new.event_entry_id
            and e.program_id = old.program_id
       ) then
      raise exception
        'which program and line a match belongs to is set when it is created'
        using errcode = '42501';
    end if;
  end if;

  if new.player1_id is distinct from old.player1_id
     and new.program_id is not null
     and new.player1_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player1_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player1_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'a match can only be re-attributed to someone on the same program''s roster'
      using errcode = '42501';
  end if;

  if public.match_is_upload_shaped(new.source_provider, new.analysis_method)
     and not public.match_is_upload_shaped(old.source_provider, old.analysis_method) then
    v_refusal := public.upload_eligibility_refusal(
      new.program_id, new.player1_id, new.created_by, (select auth.uid()));
    if v_refusal is not null then
      raise exception '%', v_refusal using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Additive only: do not reconcile historical match/legacy-forfeit conflicts.
-- All three write paths version the same entry row. A waiter sees the committed
-- result under READ COMMITTED; stronger isolation raises a serialization error
-- rather than checking an old snapshot. Row locks alone do not guarantee that.
create schema if not exists schedule_private;
revoke all on schema schedule_private from public, anon, authenticated;

-- These are trigger-only integrity checks, not callable RPCs. Definer rights
-- let them see conflicting results hidden by match RLS and version the parent
-- without widening callers' entry permissions. Table RLS still authorizes the
-- original write; service-role ingestion is subject to the same invariant.
create function schedule_private.guard_schedule_result() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_entry uuid;
  legacy text;
  target_kind text;
begin
  if tg_table_name = 'program_event_outcomes' then
    -- BEFORE triggers precede RLS WITH CHECK. Refuse unauthorized sessions
    -- before disclosing whether another program has a legacy result.
    if auth.uid() is not null and not exists (
      select 1 from public.program_members m where m.program_id = new.program_id
        and m.user_id = auth.uid() and m.role in ('owner','coach','staff')
    ) then
      raise exception 'Only program staff can change outcomes.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      raise exception 'Clear the saved outcome before changing it.' using errcode = '23514';
    end if;
    target_entry := new.entry_id;
    -- Let the existing composite foreign keys report a forged/missing scope.
    -- Do not inspect results (or lock a different program's entry) first.
    if not exists (
      select 1 from public.program_event_entries l
      join public.program_events e on e.id = l.event_id
      where l.id = new.entry_id and l.event_id = new.event_id
        and l.program_id = new.program_id and e.kind = new.event_kind
    ) then return new; end if;
  else
    target_entry := new.event_entry_id;
  end if;
  if target_entry is null then return new; end if;

  update public.program_event_entries set id = id where id = target_entry
    returning forfeit into legacy;
  select e.kind into target_kind from public.program_events e
    join public.program_event_entries l on l.event_id = e.id
    where l.id = target_entry;

  if tg_table_name = 'program_event_outcomes' then
    if legacy is not null then
      raise exception 'Clear the legacy forfeit before saving an outcome.' using errcode = '23514';
    end if;
    if exists (select 1 from public.matches m where m.event_entry_id = target_entry
      and (target_kind = 'dual' or m.round is not distinct from new.round)) then
      raise exception 'This line or round already has a match. Remove the match before saving an outcome.' using errcode = '23514';
    end if;
  else
    if legacy is not null or exists (
      select 1 from public.program_event_outcomes o where o.entry_id = target_entry
      and (target_kind = 'dual' or o.round is not distinct from new.round)
    ) then
      raise exception 'Clear the saved outcome or forfeit before adding a score or match.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function schedule_private.guard_schedule_result() from public, anon, authenticated;

create trigger guard_schedule_outcome before insert or update on public.program_event_outcomes
  for each row execute function schedule_private.guard_schedule_result();
create trigger guard_schedule_match before insert or update of event_entry_id, round, score on public.matches
  for each row execute function schedule_private.guard_schedule_result();

-- Legacy builders still write entries.forfeit. They must use the same invariant
-- and must not overwrite a saved side. Clearing remains available for repair.
create function schedule_private.guard_legacy_forfeit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.forfeit is null then return new; end if;
  if tg_op = 'UPDATE' and old.forfeit is not null and new.forfeit <> old.forfeit then
    raise exception 'Clear the saved forfeit before changing its side.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.forfeit is not distinct from old.forfeit then return new; end if;
  if exists (select 1 from public.matches where event_entry_id = new.id)
    or exists (select 1 from public.program_event_outcomes where entry_id = new.id) then
    raise exception 'This line already has a match or outcome. Clear it before forfeiting.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function schedule_private.guard_legacy_forfeit() from public, anon, authenticated;
create trigger guard_legacy_forfeit before insert or update of forfeit on public.program_event_entries
  for each row execute function schedule_private.guard_legacy_forfeit();

-- Invoker retains RLS. Scope comes from the server's active workspace; caller
-- membership is independently checked here. No provenance arguments are exposed.
create function public.set_schedule_outcome(
  p_program_id uuid, p_entry_id uuid, p_round text, p_kind text, p_side text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  line public.program_event_entries%rowtype;
  event_kind text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.program_members m where m.program_id = p_program_id
      and m.user_id = auth.uid() and m.role in ('owner','coach','staff')
  ) then
    raise exception 'Only program staff can change outcomes.' using errcode = '42501';
  end if;
  select * into line from public.program_event_entries
    where id = p_entry_id and program_id = p_program_id for update;
  if not found then
    raise exception 'That line is unavailable in your active program.' using errcode = '42501';
  end if;
  select kind into event_kind from public.program_events where id = line.event_id;
  if event_kind = 'dual' and p_round is not null
    or event_kind = 'tournament' and (p_round is null or p_round not in
      ('Q1','Q2','Q3','R128','R64','R32','R16','QF','SF','F','C1','C2','C3'))
      and not (p_round is null and p_kind is null and p_side is null and line.forfeit is not null) then
    raise exception 'Choose a valid round; dual outcomes apply to the whole line.' using errcode = '23514';
  end if;
  if (p_kind is null) <> (p_side is null) then
    raise exception 'Choose both an outcome and its side, or clear both.' using errcode = '23514';
  end if;
  if p_kind is null then
    delete from public.program_event_outcomes where entry_id = line.id
      and round is not distinct from p_round;
    -- A legacy forfeit covers the entire entry. It must be cleared explicitly
    -- with null round (the compatibility action), never as a tournament round.
    if p_round is null then
      update public.program_event_entries set forfeit = null where id = line.id;
    end if;
  else
    if line.forfeit is not null or exists (select 1 from public.program_event_outcomes
      where entry_id = line.id and round is not distinct from p_round) then
      raise exception 'Clear the saved outcome or forfeit before changing it.' using errcode = '23514';
    end if;
    insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side)
      values(line.id,line.event_id,p_program_id,event_kind,p_round,p_kind,p_side);
  end if;
  return line.event_id;
end;
$$;
revoke all on function public.set_schedule_outcome(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.set_schedule_outcome(uuid,uuid,text,text,text) to authenticated;

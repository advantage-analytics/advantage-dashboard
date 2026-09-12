-- Close the cross-program existence oracle on the `matches` guard.
--
-- `guard_schedule_result()` serves two triggers. Its `program_event_outcomes`
-- branch already refuses a non-member before probing, for the reason its own
-- comment gives: a BEFORE trigger runs ahead of RLS WITH CHECK, so probing
-- first would answer "does that line already have a result?" for a caller with
-- no relationship to the program. The `matches` branch was missing the same
-- check.
--
-- The `matches` INSERT policy is only `auth.uid() = created_by`, and this
-- trigger sorts alphabetically BEFORE `matches_block_client_regraft` — the
-- trigger that actually enforces program staffing — so the probes ran first.
-- A caller naming another program's `event_entry_id` could tell a saved
-- outcome or legacy forfeit from its absence by which error came back. The
-- write was always refused, so this was an existence oracle rather than a
-- write bypass, but it discloses across a tenant boundary either way.
--
-- Additive by construction: members reach exactly the code they reached
-- before, so no legitimate insert or update changes behaviour. Non-members
-- are handed straight to `matches_block_client_regraft`, which refuses every
-- one of them identically. Service-role ingestion carries no JWT and stays
-- exempt, the same way the outcomes branch exempts it.
create or replace function schedule_private.guard_schedule_result() returns trigger
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
    -- The same disclosure rule as the branch above, on the second table. A
    -- caller with no membership in the entry's program learns nothing here;
    -- `matches_block_client_regraft` refuses the write uniformly afterwards.
    if target_entry is not null and auth.uid() is not null and not exists (
      select 1
      from public.program_event_entries l
      join public.program_members m on m.program_id = l.program_id
      where l.id = target_entry and m.user_id = auth.uid()
    ) then
      return new;
    end if;
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

-- `create or replace` keeps the existing ACL; re-stated so the trigger-only
-- contract is legible in this file rather than only in the original migration.
revoke all on function schedule_private.guard_schedule_result() from public, anon, authenticated;

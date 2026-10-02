-- SELECT-only live snapshot 2026-09-17 02:54:20 UTC, head 20260916183239.
CREATE OR REPLACE FUNCTION schedule_private.guard_legacy_forfeit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION schedule_private.guard_schedule_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.matches_block_client_regraft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if coalesce(current_setting('advantage.attach_match_id', true), '') <> old.id::text
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
$function$;

CREATE TRIGGER guard_schedule_match BEFORE INSERT OR UPDATE OF event_entry_id, round, score ON public.matches FOR EACH ROW EXECUTE FUNCTION schedule_private.guard_schedule_result();
CREATE TRIGGER matches_block_client_regraft BEFORE INSERT OR UPDATE OF program_id, event_entry_id, player1_id, source_provider, analysis_method ON public.matches FOR EACH ROW EXECUTE FUNCTION matches_block_client_regraft();
CREATE TRIGGER guard_legacy_forfeit BEFORE INSERT OR UPDATE OF forfeit ON public.program_event_entries FOR EACH ROW EXECUTE FUNCTION schedule_private.guard_legacy_forfeit();
CREATE TRIGGER guard_schedule_outcome BEFORE INSERT OR UPDATE ON public.program_event_outcomes FOR EACH ROW EXECUTE FUNCTION schedule_private.guard_schedule_result();

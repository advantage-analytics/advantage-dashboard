-- Check matches.player2_id against the program roster.
--
-- The matches read policy lets anyone whose id is in player2_id read the
-- match, while the insert and update policies only test created_by =
-- auth.uid(). So a member could seat any id in player2_id of a program match
-- and hand that person the match. Since the teammate-opponent work, the only
-- legitimate occupant of that seat on a program match is a teammate: a
-- program_players.id of the same program, or -- for a member with no profile
-- yet -- their login id (a program_members.user_id of the same program).
--
-- This adds that test to matches_block_client_regraft(), as the same two
-- `not exists` arms the function already runs for player1_id: once on INSERT,
-- once on an UPDATE that changes player2_id. A match with program_id null is
-- not checked, and neither is a null player2_id.
--
-- The body is the live definition (pg_get_functiondef, 2026-11-10) with those
-- two blocks added and nothing else changed. `create or replace` keeps the
-- function's grants (service_role and postgres only) -- a drop + create would
-- reset them to the schema default and hand execute to authenticated.
--
-- No backfill: on 2026-11-10, 0 of 49 program matches had player2_id set.

create or replace function public.matches_block_client_regraft()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    -- player2_id roster check (insert)
    if new.program_id is not null
       and new.player2_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player2_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player2_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that opponent is not on this program''s roster, so they cannot be seated in the match as a teammate'
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
      if not (
        (
          coalesce(current_setting('advantage.detach_event_id', true), '') <> ''
          and exists (
            select 1 from public.program_event_entries e
             where e.id = old.event_entry_id
               and e.event_id::text = current_setting('advantage.detach_event_id', true)
          )
        )
        or (
          coalesce(current_setting('advantage.detach_match_id', true), '') = old.id::text
          and old.program_id is not null
          and public.can_manage_program_schedule(old.program_id)
        )
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
  if new.round is distinct from old.round
     and old.event_entry_id is not null
     and new.event_entry_id is not null then
    if coalesce(current_setting('advantage.round_match_id', true), '') <> old.id::text
       or old.program_id is null
       or not public.can_manage_program_schedule(old.program_id) then
      raise exception
        'the round of a match on a scheduled line is changed from the Edit Match dialog'
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
  -- player2_id roster check (update)
  if new.player2_id is distinct from old.player2_id
     and new.program_id is not null
     and new.player2_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player2_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player2_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'the opponent seat of a program match can only be given to someone on the same program''s roster'
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

-- The trigger's UPDATE OF list decides whether the function runs at all:
-- without player2_id in it, an update of that column alone never reaches the
-- check above. `create or replace trigger` swaps the definition in place, so
-- there is no moment with the guard missing, and the name -- hence its place
-- in the alphabetical firing order -- is unchanged.
create or replace trigger matches_block_client_regraft
  before insert or update of
    program_id, event_entry_id, player1_id, player2_id,
    source_provider, analysis_method, round
  on public.matches
  for each row
  execute function public.matches_block_client_regraft();

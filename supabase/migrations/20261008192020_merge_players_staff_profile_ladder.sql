-- Merging a staff-held player profile follows the removal ladder.
--
-- `20261008171750` restricted who may ARCHIVE a player profile held by the
-- owner, a coach or staff: the holder, the owner, or a coach acting on a staff
-- member's. Merge was left on `is_program_staff` alone, and a merge is the
-- same weight as a removal — it retires one profile id and moves its matches
-- onto another row — so any staff login could do to the owner's profile by
-- merging what it could no longer do by removing.
--
-- The same ladder now gates a merge that involves a staff-held profile, on
-- either side. Everything else in the function is the previous live body,
-- unchanged. The holder merging their OWN duplicate stays open, which is the
-- path for an owner who added themselves as an email-less row before "Add
-- yourself as a player" existed.
create or replace function public.merge_program_players(p_surviving_id uuid, p_absorbed_id uuid, p_confirm_name text)
returns table(matches_moved integer, entries_moved integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_s public.program_players;
  v_a public.program_players;
  v_match_ids uuid[];
  v_matches integer := 0;
  v_entries integer := 0;
  v_holder      uuid;
  v_holder_role text;
  v_caller      text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_surviving_id = p_absorbed_id then
    raise exception 'those are the same profile' using errcode = '22023';
  end if;

  select * into v_s from public.program_players where id = p_surviving_id;
  if not found or v_s.merged_into_id is not null then
    raise exception 'the profile you are keeping is not on this roster'
      using errcode = '22023';
  end if;

  select * into v_a from public.program_players where id = p_absorbed_id;
  if not found or v_a.merged_into_id is not null then
    raise exception 'the profile you are merging is not on this roster'
      using errcode = '22023';
  end if;

  if v_a.program_id <> v_s.program_id then
    raise exception 'those two profiles are not on the same roster'
      using errcode = '22023';
  end if;

  v_program := v_s.program_id;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to merge profiles on this program'
      using errcode = '42501';
  end if;

  -- A profile held by the owner, a coach or staff, on either side: the same
  -- ladder `archive_program_player` applies. At most one side can be claimed
  -- and reach the merge at all (two accounts are refused below), so one row
  -- answers it; the highest rank is taken in case both are.
  select pm.user_id, pm.role into v_holder, v_holder_role
    from public.program_members pm
   where pm.program_id = v_program
     and pm.user_id in (v_s.claimed_by_user_id, v_a.claimed_by_user_id)
     and pm.role in ('owner', 'coach', 'staff')
   order by case pm.role when 'owner' then 0 when 'coach' then 1 else 2 end
   limit 1;

  if v_holder is not null and v_holder <> v_uid then
    v_caller := public.user_program_role(v_program);
    if not (v_caller = 'owner' or (v_caller = 'coach' and v_holder_role = 'staff')) then
      raise exception '%',
        case v_holder_role
          when 'owner' then 'Only the owner can merge their own player profile.'
          when 'coach' then 'A coach''s player profile is theirs or the owner''s to merge.'
          else 'Only the owner or a coach can merge a staff member''s player profile.'
        end
        using errcode = '42501';
    end if;
  end if;

  -- The guard that makes this un-abusable. Without it, a coach could fold a
  -- teammate's season into somebody else's row; with it, both rows have to
  -- carry the same name and the operator has to type it.
  if public.normalized_person_name(v_s.first_name, v_s.last_name)
     is distinct from public.normalized_person_name(v_a.first_name, v_a.last_name)
  then
    raise exception
      'these two profiles have different names — merge is for duplicates, not for combining two people'
      using errcode = '22023';
  end if;

  if public.normalized_person_name(p_confirm_name, '')
     is distinct from public.normalized_person_name(v_s.first_name, v_s.last_name)
  then
    raise exception 'type the player''s name exactly to confirm the merge'
      using errcode = '22023';
  end if;

  -- Two accounts is a membership problem, not a duplicate. Collapsing them
  -- would silently take somebody's login away.
  if v_s.claimed_by_user_id is not null and v_a.claimed_by_user_id is not null then
    raise exception
      'both of these have an account — removing one is a roster change, not a merge'
      using errcode = '22023';
  end if;

  -- Recorded BEFORE the update, so the audit row names the rows that moved
  -- rather than the rows that already had the surviving id.
  select coalesce(array_agg(m.id), '{}') into v_match_ids
    from public.matches m
   where m.program_id = v_program
     and (m.player1_id = p_absorbed_id or m.player2_id = p_absorbed_id);

  update public.matches set player1_id = p_surviving_id
   where program_id = v_program and player1_id = p_absorbed_id;

  update public.matches set player2_id = p_surviving_id
   where program_id = v_program and player2_id = p_absorbed_id;

  -- Counted from the id set gathered above, not from `row_count`: a row_count
  -- after the first update is only the matches this athlete played as player
  -- one, and reporting that as "matches moved" would understate the change the
  -- coach just approved.
  v_matches := coalesce(array_length(v_match_ids, 1), 0);

  -- Lineups carry ids in a parallel array beside their labels. The labels are
  -- snapshots and stay exactly as they were: a historical lineup has to read
  -- correctly after a roster change, which is why they were never a join.
  update public.program_event_entries
     set player_user_ids = array_replace(player_user_ids, p_absorbed_id, p_surviving_id)
   where program_id = v_program
     and p_absorbed_id = any(player_user_ids);
  get diagnostics v_entries = row_count;

  update public.program_invites
     set player_id = p_surviving_id
   where player_id = p_absorbed_id and accepted_at is null;

  -- The survivor takes whatever it was missing, including the claim when only
  -- the absorbed row had one — the "coach added a duplicate AFTER the player
  -- signed up" case. The person keeps their login either way.
  update public.program_players s
     set email              = coalesce(s.email, a.email),
         class_year         = coalesce(s.class_year, a.class_year),
         lineup_spot        = coalesce(s.lineup_spot, a.lineup_spot),
         claimed_by_user_id = coalesce(s.claimed_by_user_id, a.claimed_by_user_id),
         claimed_at         = coalesce(s.claimed_at, a.claimed_at),
         updated_at         = now()
    from public.program_players a
   where s.id = p_surviving_id and a.id = p_absorbed_id;

  -- Retained, never deleted: the audit row points at it, and `matches` has no
  -- foreign key to catch a dangling id. Its email and lineup spot are released
  -- so the partial unique indexes stop counting it.
  update public.program_players
     set merged_into_id     = p_surviving_id,
         merged_at          = now(),
         claimed_by_user_id = null,
         claimed_at         = null,
         email              = null,
         lineup_spot        = null,
         updated_at         = now()
   where id = p_absorbed_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_program, v_uid, 'player.merged', p_surviving_id,
     jsonb_build_object(
       'absorbed', p_absorbed_id,
       'name', btrim(v_s.first_name || ' ' || v_s.last_name),
       'matches_moved', v_matches,
       'entries_moved', v_entries,
       -- The ids are what makes a manual reversal possible.
       'match_ids', to_jsonb(v_match_ids)
     ));

  return query select v_matches, v_entries;
end;
$function$;

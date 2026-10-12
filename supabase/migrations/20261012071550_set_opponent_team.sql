-- Staff give an opponent a team on matches they did not record.
--
-- `20261012003309_matches_opponent_program` added `matches.opponent_program_id`
-- and `matches.opponent_school` (at most one non-null). A player sets them on
-- their own match through the ordinary UPDATE path — the live `matches` UPDATE
-- policy is `auth.uid() = created_by`, and that stays. It also means a coach
-- fixing old matches ("sets it on every match against that opponent at once",
-- design record "Giving an opponent a team" › "Fixing old matches") owns none
-- of the rows, so a plain update changes nothing for them. This function is
-- that one door, SECURITY DEFINER, gated on the caller's role in the program.
--
-- WHY MATCH IDS, NOT AN OPPONENT KEY. "The same opponent" is defined once, in
-- `src/lib/data/personal-opponents.ts`: `opponent_player_id` when the match
-- carries one, otherwise the normalised opponent name (`normalizedPersonName`).
-- Re-implementing that rule in SQL would be a second copy that drifts the day
-- either side changes how a name is normalised. The loader already hands the
-- drawer the opponent's `matchIds`, so the function takes those and re-verifies
-- every one against `program_id` — the ids are an input to check, not a fact.
--
-- WHY THE RAW ROLE, NOT `can_manage_program_schedule`. That helper bends with
-- `programs.events_policy`, a schedule setting that can open event editing to
-- players. Who may rewrite the team's match records is not a schedule setting;
-- it is the owner, a coach or staff, read straight from `program_members.role`
-- via `user_program_role` (the one definition of "the caller's role here").
--
-- WHAT THE GATE REACHES. Only rows with `program_id = p_program_id` — a staff
-- member of program A cannot touch B's matches or anyone's personal matches
-- (`program_id` null), and one foreign id refuses the whole call before any
-- row changes. The opponent program is checked for existence only: pointing a
-- match at a program the caller does not belong to is the point of the field.
-- Pointing at the caller's own program is refused (`a program does not play
-- itself`). The returned ids are the ones the caller passed in, so nothing is
-- revealed that the caller did not already hold.
create or replace function public.set_opponent_team(
  p_program_id          uuid,
  p_match_ids           uuid[],
  p_opponent_program_id uuid,
  p_opponent_school     text
)
returns setof uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_school text := nullif(btrim(coalesce(p_opponent_school, '')), '');
  v_ids    uuid[];
  v_ours   integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The caller's OWN role in the program the matches belong to.
  v_role := public.user_program_role(p_program_id);
  if v_role is null or v_role not in ('owner', 'coach', 'staff') then
    raise exception 'only the owner, a coach or staff can set an opponent''s team'
      using errcode = '42501';
  end if;

  -- Exactly one of program / school, mirroring the table's CHECK.
  if (p_opponent_program_id is null) = (v_school is null) then
    raise exception 'give either an opponent program or a school name, not both'
      using errcode = '22023';
  end if;

  -- Nulls and repeats in the id list are dropped before anything is counted.
  select array_agg(distinct m.id) into v_ids
    from unnest(p_match_ids) as m(id)
   where m.id is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no matches given' using errcode = '22023';
  end if;

  if cardinality(v_ids) > 200 then
    raise exception 'at most 200 matches per call' using errcode = '22023';
  end if;

  if p_opponent_program_id = p_program_id then
    raise exception 'a program does not play itself' using errcode = '22023';
  end if;

  if p_opponent_program_id is not null
     and not exists (select 1 from public.programs p where p.id = p_opponent_program_id) then
    raise exception 'no such program' using errcode = '23503';
  end if;

  -- Lock exactly the rows about to change and count the ones that are this
  -- program's. The count is taken under the same locks the update runs under,
  -- so a row cannot move programs between the check and the write, and a
  -- short count raises before the update runs — nothing is partially applied.
  select count(*) into v_ours
    from public.matches m
   where m.id = any(v_ids)
     and m.program_id = p_program_id
     for update;

  if v_ours <> cardinality(v_ids) then
    raise exception 'one or more matches are not this program''s'
      using errcode = '42501';
  end if;

  return query
    update public.matches m
       set opponent_program_id = p_opponent_program_id,
           opponent_school     = v_school
     where m.id = any(v_ids)
       and m.program_id = p_program_id
    returning m.id;
end;
$function$;

-- Grants: `20261001184305_function_default_privileges_no_anon` makes a new
-- function in `public` executable by nobody but its owner; a signed-in caller
-- and the service role are named here on purpose, and `anon` never is.
revoke all on function public.set_opponent_team(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.set_opponent_team(uuid, uuid[], uuid, text) to authenticated, service_role;

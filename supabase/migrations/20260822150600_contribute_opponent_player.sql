-- Record an opposing player, on a roster nobody has claimed.
--
-- The write behind `program_players.contributed_by_program_id`. A coach
-- entering a dual lineup types the other side's names; this is what turns one
-- of those strings into a row with an id, so the next program to play them
-- finds the same person rather than typing a second copy.
--
-- SECURITY DEFINER for the reason 20260822090700 gives about the other three
-- player writes: `program_players` carries exactly one policy, a SELECT. An
-- INSERT policy could not constrain WHICH program a row lands under, and
-- "a coach may record an opponent" would become "a coach may write a row onto
-- any roster in the directory".
--
-- ── The guard that matters ──────────────────────────────────────────────────
-- The target program must be UNCLAIMED. Once it has a single member, its
-- roster is its own and no outsider writes to it — otherwise a rival could
-- edit a live program's lineup spots, and a coach opening their roster would
-- find rows they never added. Contribution is how an empty directory row gets
-- populated, never a way in to a populated one.
--
-- ── Deliberately not idempotent by name alone ───────────────────────────────
-- It returns the existing row when the name already sits on that roster, live.
-- Two programs recording "Kim" against the same opponent should converge on one
-- id — that convergence IS the feature — and an insert-always would give the
-- pool two of everybody by the end of a season. Names are matched
-- case-insensitively and trimmed; anything subtler than that is a merge, and
-- `merge_program_players` already exists for it.

create or replace function public.contribute_opponent_player(
  p_program_id          uuid,
  p_opponent_program_id uuid,
  p_first_name          text,
  p_last_name           text,
  p_lineup_spot         integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Staff of the RECORDING program. A player cannot contribute: the roster of a
  -- program they do not belong to is not theirs to write, and the dual lineup
  -- form is staff-only besides.
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to record opponents for this program'
      using errcode = '42501';
  end if;

  if p_opponent_program_id = p_program_id then
    raise exception 'a program does not play itself' using errcode = '22023';
  end if;

  if not exists (select 1 from public.programs where id = p_opponent_program_id) then
    raise exception 'no such program' using errcode = '23503';
  end if;

  -- Same rule as `add_program_player`: both names, because this row has no
  -- email to fall back on and a nameless one is unfindable.
  if v_first = '' or v_last = '' then
    raise exception 'an opponent needs a first and last name' using errcode = '22023';
  end if;

  if p_lineup_spot is not null and p_lineup_spot < 1 then
    raise exception 'a lineup spot starts at 1' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.program_members where program_id = p_opponent_program_id
  ) then
    raise exception 'that program manages its own roster'
      using errcode = '42501';
  end if;

  -- Converge rather than duplicate. Restricted to live rows: an archived or
  -- merged namesake is history, and returning its id would resurrect it.
  select pp.id into v_id
    from public.program_players pp
   where pp.program_id = p_opponent_program_id
     and lower(btrim(pp.first_name)) = lower(v_first)
     and lower(btrim(pp.last_name)) = lower(v_last)
     and pp.merged_into_id is null
     and pp.archived_at is null
   limit 1;

  if v_id is not null then
    -- A lineup spot from a later sighting is better information than none, but
    -- never overwrites one already recorded — the program's own answer, once it
    -- claims the roster, outranks an outsider's observation.
    if p_lineup_spot is not null then
      update public.program_players
         set lineup_spot = p_lineup_spot,
             updated_at  = now()
       where id = v_id
         and lineup_spot is null;
    end if;
    return v_id;
  end if;

  insert into public.program_players (
    program_id, first_name, last_name, lineup_spot,
    contributed_by_program_id, created_by
  )
  values (
    p_opponent_program_id, v_first, v_last, p_lineup_spot,
    p_program_id, v_uid
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.contribute_opponent_player(uuid, uuid, text, text, integer) from public;
revoke all on function public.contribute_opponent_player(uuid, uuid, text, text, integer) from anon;
grant execute on function public.contribute_opponent_player(uuid, uuid, text, text, integer) to authenticated;

comment on function public.contribute_opponent_player(uuid, uuid, text, text, integer) is
  'Record an opposing player on an UNCLAIMED program''s roster, returning the existing row where the name already sits there. Refuses once that program has any member.';

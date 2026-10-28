-- matches.opponent_unattached: the opponent plays for no school or club.
--
-- Until now an opponent's team was a directory program (opponent_program_id),
-- a school as typed (opponent_school), or nothing — and nothing could not tell
-- "nobody has said" from "there is no school to say". A junior event or an open
-- tournament is full of unattached players, and the drawer read every one of
-- them as a gap to fill. This is the third answer, said on purpose.
--
-- The three are exclusive. Rather than teach every writer of the two older
-- columns about the new one (the wizard, the edit dialog, the schedule, the
-- admin uploads, the MCP connector all write them), a trigger clears
-- opponent_unattached whenever a program or school is set, and a CHECK keeps
-- it false while either is. Nothing that writes a team today has to change.
--
-- Staff mark it through a five-argument set_opponent_team. The four-argument
-- function keeps its signature and grants; the trigger is what keeps it
-- correct, since setting a program or school now also clears the flag.
-- Re-runnable without DROP: `add column if not exists`, an existence-checked
-- constraint, `create or replace` for the functions and the trigger.

alter table public.matches
  add column if not exists opponent_unattached boolean not null default false;

comment on column public.matches.opponent_unattached is
  'The opponent plays for no school or club — said on purpose, not unknown. '
  'Exclusive with opponent_program_id and opponent_school: a trigger clears it '
  'when either is set, and matches_opponent_unattached_exclusive_check holds it.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.matches'::regclass
       and conname = 'matches_opponent_unattached_exclusive_check'
  ) then
    alter table public.matches
      add constraint matches_opponent_unattached_exclusive_check
      check (
        not opponent_unattached
        or (opponent_program_id is null and opponent_school is null)
      );
  end if;
end;
$$;

-- Setting a program or a school is a new answer, so it replaces "unattached".
create or replace function public.matches_clear_opponent_unattached()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.opponent_program_id is not null or new.opponent_school is not null then
    new.opponent_unattached := false;
  end if;
  return new;
end;
$function$;

revoke all on function public.matches_clear_opponent_unattached() from public;
revoke all on function public.matches_clear_opponent_unattached() from anon, authenticated;

create or replace trigger matches_clear_opponent_unattached
  before insert or update of opponent_program_id, opponent_school
  on public.matches
  for each row
  execute function public.matches_clear_opponent_unattached();

-- set_opponent_team with a third answer. Exactly one of program, school or
-- unattached; otherwise the four-argument function's rules, unchanged: the
-- caller's own staff role in the program, at most 200 ids, every one of them
-- this program's, checked under the row lock that the write then uses.
create or replace function public.set_opponent_team(
  p_program_id uuid,
  p_match_ids uuid[],
  p_opponent_program_id uuid,
  p_opponent_school text,
  p_unattached boolean
)
returns setof uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid        uuid := (select auth.uid());
  v_role       text;
  v_school     text := nullif(btrim(coalesce(p_opponent_school, '')), '');
  v_unattached boolean := coalesce(p_unattached, false);
  v_ids        uuid[];
  v_ours       integer;
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

  -- Exactly one answer: a program, a school, or unattached.
  if (p_opponent_program_id is not null)::int
     + (v_school is not null)::int
     + v_unattached::int <> 1 then
    raise exception 'give exactly one of an opponent program, a school name or unattached'
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
  -- program's, so a row cannot move programs between the check and the write.
  select count(*) into v_ours
    from (
      select m.id
        from public.matches m
       where m.id = any(v_ids)
         and m.program_id = p_program_id
         for update
    ) as locked;

  if v_ours <> cardinality(v_ids) then
    raise exception 'one or more matches are not this program''s'
      using errcode = '42501';
  end if;

  return query
    update public.matches m
       set opponent_program_id = p_opponent_program_id,
           opponent_school     = v_school,
           opponent_unattached = v_unattached
     where m.id = any(v_ids)
       and m.program_id = p_program_id
    returning m.id;
end;
$function$;

revoke all on function public.set_opponent_team(uuid, uuid[], uuid, text, boolean) from public;
revoke all on function public.set_opponent_team(uuid, uuid[], uuid, text, boolean) from anon;
grant execute on function public.set_opponent_team(uuid, uuid[], uuid, text, boolean)
  to authenticated, service_role;

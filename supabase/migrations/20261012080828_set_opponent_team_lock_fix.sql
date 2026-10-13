-- set_opponent_team: fix the lock-and-count statement.
--
-- 20261012071550 wrote `select count(*) ... for update`. Postgres refuses a
-- row lock on an aggregate query (0A000, "FOR UPDATE is not allowed with
-- aggregate functions"), and plpgsql only plans a statement when it first
-- runs, so the function was created without complaint and then failed on
-- every call that got past the role and input checks. It failed closed —
-- nothing was written and nobody gained access — but staff could never set a
-- team. Found by /pr-check's RLS review; the function had not been executed,
-- because its spec skips against the production project.
--
-- The lock now sits in a subquery, where FOR UPDATE is allowed, and the count
-- is taken over the locked rows. Everything else is unchanged: same signature,
-- same checks in the same order, same error codes, same two columns written.
-- `create or replace` keeps the function's privileges; the revoke and grant
-- are restated so this file stands on its own
-- (20261001184305_function_default_privileges_no_anon).

create or replace function public.set_opponent_team(
  p_program_id uuid,
  p_match_ids uuid[],
  p_opponent_program_id uuid,
  p_opponent_school text
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
  -- program's. The lock is taken in the subquery (a row lock cannot sit on an
  -- aggregate), and the count is over the locked rows, so a row cannot move
  -- programs between the check and the write, and a short count raises before
  -- the update runs — nothing is partially applied.
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
           opponent_school     = v_school
     where m.id = any(v_ids)
       and m.program_id = p_program_id
    returning m.id;
end;
$function$;

revoke all on function public.set_opponent_team(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.set_opponent_team(uuid, uuid[], uuid, text) to authenticated, service_role;

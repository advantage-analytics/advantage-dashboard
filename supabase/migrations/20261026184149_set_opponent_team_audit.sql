-- set_opponent_team writes a program_audit_log row.
--
-- The drawer now overwrites a team already set, and marks opponents
-- unattached, across up to 200 matches per call. Without a record, a wrong
-- pick (the women's program for the men's) erased the value it replaced with
-- no way back. Each call now logs `match.opponent_team_changed` with the new
-- team and every match's previous one, so any change can be put back by hand.
--
-- The action list is an enumerated CHECK that concurrent migrations have
-- clobbered before (a rebuild from a stale copy dropped three live verbs on
-- 2026-10-07). So it is rebuilt here from the LIVE definition plus the one
-- new verb, never from a typed list, and only when the verb is missing.
--
-- The four-argument function becomes a call into the five-argument one, so
-- both are audited in one place and keep their exact rules.

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.program_audit_log'::regclass
     and conname = 'program_audit_log_action_check';

  if v_def is null then
    raise exception 'program_audit_log_action_check not found';
  end if;

  if position('''match.opponent_team_changed''' in v_def) = 0 then
    execute 'alter table public.program_audit_log drop constraint program_audit_log_action_check';
    execute 'alter table public.program_audit_log add constraint program_audit_log_action_check '
      || regexp_replace(v_def, '\]\)\)\)$', ', ''match.opponent_team_changed''::text])))');
  end if;
end;
$$;

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
  v_before     jsonb;
  v_changed    uuid[];
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

  -- What each match said before, read under the lock just taken.
  select coalesce(jsonb_agg(jsonb_build_object(
           'match_id',   m.id,
           'program_id', m.opponent_program_id,
           'school',     m.opponent_school,
           'unattached', m.opponent_unattached
         ) order by m.id), '[]'::jsonb)
    into v_before
    from public.matches m
   where m.id = any(v_ids);

  with changed as (
    update public.matches m
       set opponent_program_id = p_opponent_program_id,
           opponent_school     = v_school,
           opponent_unattached = v_unattached
     where m.id = any(v_ids)
       and m.program_id = p_program_id
    returning m.id
  )
  select array_agg(c.id) into v_changed from changed c;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    v_uid,
    'match.opponent_team_changed',
    null,
    jsonb_build_object(
      'match_ids', to_jsonb(coalesce(v_changed, '{}'::uuid[])),
      'to', jsonb_build_object(
        'program_id', p_opponent_program_id,
        'school',     v_school,
        'unattached', v_unattached
      ),
      'from', v_before
    )
  );

  return query select unnest(coalesce(v_changed, '{}'::uuid[]));
end;
$function$;

-- The four-argument function: the same call with no "unattached", so it is
-- audited and checked in exactly one place. Same signature, so its grants hold.
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
begin
  return query
    select * from public.set_opponent_team(
      p_program_id, p_match_ids, p_opponent_program_id, p_opponent_school, false
    );
end;
$function$;

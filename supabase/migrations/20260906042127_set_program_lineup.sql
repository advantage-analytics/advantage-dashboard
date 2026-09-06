-- The Roster page's drag-to-reorder writes the whole order in one call.
--
-- `update_program_player` cannot do this job: it overwrites all five profile
-- fields and defaults the ones it is not given to NULL, so calling it per row
-- to move a line would clear names, class years and emails. It is also one
-- round trip per player, which turns a six-line reshuffle into six writes that
-- can half-apply.
--
-- The order given IS the numbering: position 1 in the array becomes lineup
-- spot 1. Anybody on the roster and NOT in the array is taken out of the
-- lineup (spot null) — which is what dragging somebody into the page's
-- "Not in the lineup" group means.
--
-- Spots stay non-unique at the schema level on purpose; `player-fields.tsx`
-- still lets a coach park two players on one line mid-reshuffle from the Edit
-- player form, and its note says so. This function simply never produces that
-- state itself.
create or replace function public.set_program_lineup(
  p_program_id uuid,
  p_player_ids uuid[]
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid   uuid := (select auth.uid());
  v_ids   uuid[] := coalesce(p_player_ids, '{}'::uuid[]);
  v_count int := coalesce(array_length(v_ids, 1), 0);
  v_bad   int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to set this lineup' using errcode = '42501';
  end if;

  -- Every id has to be a live player on THIS program. A stale tab holding a
  -- row that has since been archived or merged, or a client naming another
  -- squad, is refused outright rather than skipped: a lineup that saved most
  -- of what was dragged is worse than one that refused and said so.
  select count(*) into v_bad
    from unnest(v_ids) as t(id)
   where not exists (
     select 1
       from public.program_players pp
      where pp.id = t.id
        and pp.program_id = p_program_id
        and pp.merged_into_id is null
        and pp.archived_at is null
   );

  if v_bad > 0 then
    raise exception 'that lineup names % player(s) who are not on this roster', v_bad
      using errcode = 'P0002';
  end if;

  if (select count(distinct id) from unnest(v_ids) as t(id)) <> v_count then
    raise exception 'a player cannot hold two lines at once' using errcode = '22023';
  end if;

  update public.program_players pp
     set lineup_spot = ord.n,
         updated_at  = now()
    from (
      select id, ordinality::int as n
        from unnest(v_ids) with ordinality as t(id, ordinality)
    ) as ord
   where pp.id = ord.id
     and pp.program_id = p_program_id
     and pp.lineup_spot is distinct from ord.n;

  -- Out of the array is out of the lineup. Null is "we have not decided",
  -- which is exactly what the page's "Not in the lineup" group means.
  update public.program_players pp
     set lineup_spot = null,
         updated_at  = now()
   where pp.program_id = p_program_id
     and pp.merged_into_id is null
     and pp.archived_at is null
     and pp.lineup_spot is not null
     and not (pp.id = any(v_ids));

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'lineup.set', null,
          jsonb_build_object('lines', v_count));
end;
$function$;

revoke all on function public.set_program_lineup(uuid, uuid[]) from public;
grant execute on function public.set_program_lineup(uuid, uuid[]) to authenticated;

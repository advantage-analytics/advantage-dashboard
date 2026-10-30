-- One-off: the connector's update_match used to save every school as text, so
-- schools set through it never linked to the directory. A match whose text is
-- exactly one program's name, for its own program's squad, gets that program
-- and loses the text, as a dropdown pick stores it. An exact match loses
-- nothing: the name now reads from the linked program. Text that matches no
-- program, or more than one, stays as typed.

do $$
declare
  v_changed integer;
begin
  with candidates as (
    select m.id as match_id, (array_agg(d.id))[1] as program_id
      from public.matches m
      join public.programs mp on mp.id = m.program_id
      join public.programs d
        on d.school_name = m.opponent_school
       and d.team = mp.team
       and d.org_type = 'college'
     where m.opponent_program_id is null
       and m.opponent_school is not null
     group by m.id
    having count(*) = 1
  )
  update public.matches m
     set opponent_program_id = c.program_id,
         opponent_school = null
    from candidates c
   where m.id = c.match_id;
  get diagnostics v_changed = row_count;
  raise notice 'linked % matches', v_changed;
end;
$$;

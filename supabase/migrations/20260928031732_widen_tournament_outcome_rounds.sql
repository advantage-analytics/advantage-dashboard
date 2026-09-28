-- T10 (claude/tournament-wizard-fixes) widened the round ladder to the ITA
-- flights: Prequalifying PQ1-PQ4, PQ Consolation PC1-PC4, Qualifying Q1-Q3,
-- main draw R256, R128-F, consolation C1-C5. matches.round and
-- program_event_entries.draw are free text; only outcomes were checked.
-- Additive: every existing row still satisfies the wider check.
--
-- Applied to the live project on 2026-09-28 via the Supabase MCP; this file
-- carries the live version number. admin_prepare_tournament_result keeps the
-- older 13-code list on purpose: the admin result form still offers only
-- OUTCOME_ROUNDS (src/lib/schedule/format.ts).

alter table public.program_event_outcomes
  drop constraint program_event_outcomes_round_check;

alter table public.program_event_outcomes
  add constraint program_event_outcomes_round_check check (
    (event_kind = 'dual' and round is null)
    or (event_kind = 'tournament' and round is not null and round = any (array[
      'PQ1','PQ2','PQ3','PQ4','PC1','PC2','PC3','PC4',
      'Q1','Q2','Q3','R256','R128','R64','R32','R16','QF','SF','F',
      'C1','C2','C3','C4','C5'
    ]))
  );

create or replace function public.set_schedule_outcome(p_program_id uuid, p_entry_id uuid, p_round text, p_kind text, p_side text)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  line public.program_event_entries%rowtype;
  event_kind text;
begin
  if auth.uid() is null or not public.can_manage_program_schedule(p_program_id) then
    raise exception 'Your program limits schedule changes, so you can''t change outcomes.' using errcode = '42501';
  end if;
  select * into line from public.program_event_entries
    where id = p_entry_id and program_id = p_program_id for update;
  if not found then
    raise exception 'That line is unavailable in your active program.' using errcode = '42501';
  end if;
  select kind into event_kind from public.program_events where id = line.event_id;
  if event_kind = 'dual' and p_round is not null
    or event_kind = 'tournament' and (p_round is null or p_round not in
      ('PQ1','PQ2','PQ3','PQ4','PC1','PC2','PC3','PC4',
       'Q1','Q2','Q3','R256','R128','R64','R32','R16','QF','SF','F',
       'C1','C2','C3','C4','C5'))
      and not (p_round is null and p_kind is null and p_side is null and line.forfeit is not null) then
    raise exception 'Choose a valid round; dual outcomes apply to the whole line.' using errcode = '23514';
  end if;
  if (p_kind is null) <> (p_side is null) then
    raise exception 'Choose both an outcome and its side, or clear both.' using errcode = '23514';
  end if;
  if p_kind is null then
    delete from public.program_event_outcomes where entry_id = line.id
      and round is not distinct from p_round;
    if p_round is null then
      update public.program_event_entries set forfeit = null where id = line.id;
    end if;
  else
    if line.forfeit is not null or exists (select 1 from public.program_event_outcomes
      where entry_id = line.id and round is not distinct from p_round) then
      raise exception 'Clear the saved outcome or forfeit before changing it.' using errcode = '23514';
    end if;
    insert into public.program_event_outcomes(entry_id,event_id,program_id,event_kind,round,kind,side)
      values(line.id,line.event_id,p_program_id,event_kind,p_round,p_kind,p_side);
  end if;
  return line.event_id;
end;
$function$;

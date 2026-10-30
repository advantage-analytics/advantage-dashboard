-- The answer cache's data version covers the opponent's team.
--
-- ask.matches now gives Ask the opponent's school and conference
-- (20261030204509), so an answer can rest on them, and a cached answer has to
-- go stale when they change. The conference comes from the linked program, so
-- the two columns on the match cover it for any change made to a match; a
-- directory edit to a program's conference does not move the version, as a
-- renamed roster player does not.
--
-- Both functions hash the same way, as 20261015181242 has them, and every
-- cached answer misses once when this lands. Same signatures, so
-- `create or replace` keeps their grants.

create or replace function public.ask_data_version(p_program_id uuid default null)
returns text
language sql
stable
set search_path to ''
as $function$
  select md5(coalesce(string_agg(
           m.id::text || ':' || coalesce(m.date::text, '')
             || ':' || coalesce(m.score::text, '')
             || ':' || coalesce(m.player1_id::text, '')
             || ':' || coalesce(m.player2_id::text, '')
             || ':' || coalesce(m.player_hand, '')
             || ':' || coalesce(m.opponent_hand, '')
             || ':' || coalesce(m.opponent_school, '')
             || ':' || coalesce(m.opponent_program_id::text, '')
             || ':' || coalesce(s.updated_at::text, ''),
           ',' order by m.id, s.is_player1), ''))
    from public.matches m
    left join public.match_stats s on s.match_id = m.id
   where (select auth.uid()) is not null
     and case
           when p_program_id is null then
             m.created_by = (select auth.uid()) and m.program_id is null
           else
             m.program_id = p_program_id
         end;
$function$;

create or replace function public.ask_data_version_as(p_user_id uuid, p_program_id uuid default null)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select md5(coalesce(string_agg(
           m.id::text || ':' || coalesce(m.date::text, '')
             || ':' || coalesce(m.score::text, '')
             || ':' || coalesce(m.player1_id::text, '')
             || ':' || coalesce(m.player2_id::text, '')
             || ':' || coalesce(m.player_hand, '')
             || ':' || coalesce(m.opponent_hand, '')
             || ':' || coalesce(m.opponent_school, '')
             || ':' || coalesce(m.opponent_program_id::text, '')
             || ':' || coalesce(s.updated_at::text, ''),
           ',' order by m.id, s.is_player1), ''))
    from public.matches m
    left join public.match_stats s on s.match_id = m.id
   where p_user_id is not null
     and case
           when p_program_id is null then
             m.created_by = p_user_id and m.program_id is null
           else
             m.program_id = p_program_id
         end;
$function$;

-- match_stats holds two rows per match (unique on match_id, is_player1), so
-- ordering the aggregate by m.id alone left the order inside a match
-- undefined: the hash could change with no data change and empty the Ask
-- cache for nothing. Order by is_player1 as well. Signatures, volatility,
-- security, search_path and grants are unchanged (create or replace keeps
-- the grants and comments; they are restated below to pin them).

create or replace function public.ask_data_version(p_program_id uuid default null)
returns text
language sql
stable
set search_path = ''
as $function$
  select md5(coalesce(string_agg(
           m.id::text || ':' || coalesce(m.date::text, '')
             || ':' || coalesce(m.score::text, '')
             || ':' || coalesce(m.player1_id::text, '')
             || ':' || coalesce(m.player2_id::text, '')
             || ':' || coalesce(m.player_hand, '')
             || ':' || coalesce(m.opponent_hand, '')
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

create or replace function public.ask_data_version_as(
  p_user_id uuid,
  p_program_id uuid default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select md5(coalesce(string_agg(
           m.id::text || ':' || coalesce(m.date::text, '')
             || ':' || coalesce(m.score::text, '')
             || ':' || coalesce(m.player1_id::text, '')
             || ':' || coalesce(m.player2_id::text, '')
             || ':' || coalesce(m.player_hand, '')
             || ':' || coalesce(m.opponent_hand, '')
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

revoke all on function public.ask_data_version(uuid) from public, anon;
grant execute on function public.ask_data_version(uuid) to authenticated, service_role;

revoke all on function public.ask_data_version_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ask_data_version_as(uuid, uuid) to service_role;

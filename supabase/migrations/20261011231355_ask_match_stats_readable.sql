-- ask.match_stats could not be read by ask_reader, the role every model-written
-- query runs as (public.ask_run_query, 20261011215730).
--
-- The view read public.match_stats_with_percentages, and that view is
-- security_invoker = on: its base tables are checked against whoever is
-- running the query, not against the view's owner. Inside ask_run_query that
-- is ask_reader, who rightly holds nothing on public.match_stats, so every
-- read of ask.match_stats failed with
--   42501 permission denied for table match_stats
-- (found by probing ask_run_query live; ask.matches, ask.points and ask.shots
-- were unaffected because they read base tables through ordinary views).
--
-- The fix keeps ask_reader's privileges exactly as they were. A definer
-- function owned by postgres returns the caller's own rows of the percentages
-- view, and ask.match_stats reads from that function instead of from the view.
-- Inside the function the invoker is its owner, so the percentages view's
-- checks pass; the ask.my_match_ids() filter is inside the function body, so
-- it can only ever return the caller's personal matches. The percentages are
-- still computed in one place, public.match_stats_with_percentages.
--
-- The view's column list is unchanged (create or replace keeps its comments
-- and its grant to ask_reader). The function returns the percentages view's
-- row type, so that view cannot be dropped without also dropping this
-- function; adding columns to it stays possible.
--
-- VERIFIED live after apply (2026-10-11, version 20261011231355), through
-- public.ask_run_query as an `authenticated` session, rolled back:
--   * ASK_MOCK_PLAN's pair now runs for a user with 14 personal matches:
--     {matches: 14, wins: 9, losses: 5, second_serve_won_pct: 57.1}; the same
--     percentage computed directly from public.match_stats as the owner is
--     57.1. ask.match_stats returned 28 rows, 14 of them side = 'me'.
--   * `select count(*) from public.match_stats` through the function is still
--     42501 permission denied for table match_stats.
--   * a second caller with no matches reads 0 rows of ask.match_stats.
--   * ask_reader's table/view privileges are unchanged: SELECT on the four
--     ask views, nothing on public.match_stats. ask.my_stat_rows(): execute
--     ask_reader t, authenticated f, anon f. The view still has 86 columns,
--     all 86 commented.
--
-- Rejected: granting ask_reader SELECT on public.match_stats. It would widen
-- the one role that runs model-written SQL, and RLS would then return it no
-- rows anyway.

create or replace function ask.my_stat_rows()
returns setof public.match_stats_with_percentages
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
    from public.match_stats_with_percentages s
   where s.match_id in (select ask.my_match_ids());
$$;

comment on function ask.my_stat_rows() is
  'The caller''s own rows of public.match_stats_with_percentages (their personal matches only). Exists so ask.match_stats can be read by ask_reader: the percentages view is security_invoker, and this runs it as its owner.';

revoke all on function ask.my_stat_rows() from public, anon, authenticated;
grant execute on function ask.my_stat_rows() to ask_reader;

create or replace view ask.match_stats as
with mine as (
  select m.id as match_id, ask.my_side(m) = 'player1' as me_is_player1
    from public.matches m
   where m.id in (select ask.my_match_ids())
     and ask.my_side(m) is not null
)
select
  s.match_id,
  case when s.is_player1 = mine.me_is_player1 then 'me' else 'opponent' end as side,
  s.aces,
  s.double_faults,
  s.winners,
  s.unforced_errors,
  s.forced_errors,
  s.avg_rally_length,
  s.first_serves,
  s.first_serves_in,
  s.first_serve_points_won,
  s.second_serves,
  s.second_serves_in,
  s.second_serve_points_won,
  s.service_games,
  s.service_games_won,
  s.first_returns,
  s.first_returns_in,
  s.first_return_points_won,
  s.second_returns,
  s.second_returns_in,
  s.second_return_points_won,
  s.return_games,
  s.return_games_won,
  s.break_points_faced,
  s.break_points_saved,
  s.break_point_opportunities,
  s.break_points_converted,
  s.set_points_faced,
  s.set_points_saved,
  s.set_point_opportunities,
  s.set_points_converted,
  s.total_points,
  s.total_points_won,
  s.service_winners,
  s.forehand_winners,
  s.backhand_winners,
  s.forehand_unforced_errors,
  s.backhand_unforced_errors,
  s.volley_winners,
  s.net_points_appearances,
  s.net_points_won,
  s.serve_wide,
  s.serve_body,
  s.serve_t,
  s.return_cross_court,
  s.return_down_the_line,
  s.return_middle,
  s.return_contact_inside,
  s.return_contact_middle,
  s.return_contact_deep,
  s.short_rally_won,
  s.short_rally_total,
  s.medium_rally_won,
  s.medium_rally_total,
  s.long_rally_won,
  s.long_rally_total,
  s.first_serve_pct,
  s.first_serve_won_pct,
  s.second_serve_won_pct,
  s.service_games_won_pct,
  s.first_return_in_pct,
  s.second_return_in_pct,
  s.first_return_won_pct,
  s.second_return_won_pct,
  s.return_games_won_pct,
  s.break_points_saved_pct,
  s.break_points_converted_pct,
  s.set_points_saved_pct,
  s.set_points_converted_pct,
  s.total_points_won_pct,
  s.serve_rating,
  s.return_rating,
  s.under_pressure_rating,
  s.short_rally_won_pct,
  s.medium_rally_won_pct,
  s.long_rally_won_pct,
  s.serve_wide_pct,
  s.serve_body_pct,
  s.serve_t_pct,
  s.return_cross_court_pct,
  s.return_down_the_line_pct,
  s.return_middle_pct,
  s.return_contact_inside_pct,
  s.return_contact_middle_pct,
  s.return_contact_deep_pct
from ask.my_stat_rows() s
join mine on mine.match_id = s.match_id;

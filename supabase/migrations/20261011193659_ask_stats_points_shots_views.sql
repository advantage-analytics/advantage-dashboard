-- The `ask` schema, part two: the statistics the Ask page's model may read,
-- already turned to "me" and "opponent".
--
-- 20261011134127_ask_schema_matches_view.sql gave the schema its two rules
-- (ask.my_match_ids(): whose matches; ask.my_side(): which side is me) and
-- the one view that uses them, ask.matches. The three views here are the
-- same rules applied to public.match_stats_with_percentages, public.points
-- and public.shots. Every row keyed on is_player1 / server_is_player1 /
-- won_by_player1 in those tables is turned once, here, so a model-written
-- query says `where side = 'me'` or `where i_won` and never has to know
-- which seat the player sat in.
--
-- The same choices as ask.matches: security_invoker is off, so each view
-- reads public as its owner and ask.my_match_ids() is the access rule; the
-- one reader is role ask_reader, which gets SELECT on the three views and
-- nothing else. A match whose side ask.my_side() cannot name (null) has no
-- row in any of the three — there is no honest way to label its sides.
--
-- Left out on purpose, as the design lists: every id but match_id (shots
-- are reached through points, so point_id stays inside); shot coordinates
-- (contact_x/y, landing_x/y — SwingVision fault coordinates are imputed,
-- `result` and `zone` are the trustworthy columns); video_time,
-- bounce_video_time and duration; the derivation engine's `flags` and
-- `derived`; the legacy `saved`; and the score-snapshot text columns on
-- points (set_score, game_score, point_score) which read from player 1's
-- seat. points.game_number counts through the whole match in the table; the
-- view renumbers it from 1 within each set, as the match-detail loader does.
-- shots.spin_type is stored in mixed case (`topspin` and `Topspin`); the
-- view initcaps it so one spelling matches every row.
--
-- Every column carries a one-line comment written for a reader who has
-- never seen the schema: a later task reads these into the model's prompt.
--
-- Verified after apply on 2026-10-11 (version 20261011193659), as postgres:
--   select table_schema, table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'ask_reader' order by 1, 2, 3;
--   → [["ask","match_stats","SELECT"],["ask","matches","SELECT"],
--      ["ask","points","SELECT"],["ask","shots","SELECT"]]   (the four rows)
--   information_schema.role_table_grants for ask_reader outside schema ask
--   → 0 rows. has_table_privilege(r, v, 'select') for r in (anon,
--   authenticated, public) and v in the three new views → all f; ask_reader
--   → t, t, t. has_schema_privilege(r, 'ask', 'usage') → anon f,
--   authenticated f, public f, ask_reader t (unchanged).
--   No function was created: has_function_privilege on i_won, my_match_ids,
--   my_side → ask_reader t, authenticated f (unchanged).
--   Every column of every view in schema ask carries a comment
--   (match_stats 86/86, matches 14/14, points 12/12, shots 9/9).
--   Read as the creator of a real splitstep match with 93 points: the
--   side = 'me' row is the is_player1 = true row, ask.points counts 56
--   i_won = total_points_won, set 2's game_number runs 1–7, and spin_type
--   collapses to Backspin/Flat/Sidespin/Topspin.
--   get_advisors(security) → no finding names schema ask or ask_reader.

-- ---------------------------------------------------------------------------
-- Which seat is mine, once per personal match. Null side → no row.
-- ---------------------------------------------------------------------------
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
from public.match_stats_with_percentages s
join mine on mine.match_id = s.match_id;

comment on view ask.match_stats is
  'Per-match statistics for the viewer''s own personal matches, two rows per match: side = me (the viewer) and side = opponent. Counters are whole-match totals; _pct columns are percentages 0–100 computed by match_stats_with_percentages, null when the denominator is zero.';
comment on column ask.match_stats.match_id is 'The match these statistics belong to; join to ask.matches.match_id.';
comment on column ask.match_stats.side is 'Whose statistics this row holds: me (the viewer) or opponent. Filter side = ''me'' for the viewer''s own numbers.';
comment on column ask.match_stats.aces is 'Serves this side hit that the other side could not touch (aces).';
comment on column ask.match_stats.double_faults is 'Points this side lost by missing both serves (double faults).';
comment on column ask.match_stats.winners is 'Shots this side hit that won the point outright (winners), serves included.';
comment on column ask.match_stats.unforced_errors is 'Points this side lost by missing a shot that was not forced (unforced errors).';
comment on column ask.match_stats.forced_errors is 'Points this side lost by missing a shot under pressure from the other side (forced errors); null when the source does not count them.';
comment on column ask.match_stats.avg_rally_length is 'Average number of shots per point across the match, the same for both sides.';
comment on column ask.match_stats.first_serves is 'Points on which this side hit a first serve (first-serve attempts).';
comment on column ask.match_stats.first_serves_in is 'First serves by this side that landed in.';
comment on column ask.match_stats.first_serve_points_won is 'Points this side won after its first serve landed in.';
comment on column ask.match_stats.second_serves is 'Points on which this side needed a second serve (second-serve attempts).';
comment on column ask.match_stats.second_serves_in is 'Second serves by this side that landed in.';
comment on column ask.match_stats.second_serve_points_won is 'Points this side won after its second serve landed in.';
comment on column ask.match_stats.service_games is 'Games this side served.';
comment on column ask.match_stats.service_games_won is 'Games this side served and won (holds of serve).';
comment on column ask.match_stats.first_returns is 'Points on which this side returned the other side''s first serve.';
comment on column ask.match_stats.first_returns_in is 'Returns of a first serve by this side that landed in.';
comment on column ask.match_stats.first_return_points_won is 'Points this side won when returning a first serve.';
comment on column ask.match_stats.second_returns is 'Points on which this side returned the other side''s second serve.';
comment on column ask.match_stats.second_returns_in is 'Returns of a second serve by this side that landed in.';
comment on column ask.match_stats.second_return_points_won is 'Points this side won when returning a second serve.';
comment on column ask.match_stats.return_games is 'Games this side returned (the other side served).';
comment on column ask.match_stats.return_games_won is 'Return games this side won (breaks of serve).';
comment on column ask.match_stats.break_points_faced is 'Break points this side faced on its own serve.';
comment on column ask.match_stats.break_points_saved is 'Break points this side faced and won (saved).';
comment on column ask.match_stats.break_point_opportunities is 'Break points this side held while returning (chances to break).';
comment on column ask.match_stats.break_points_converted is 'Break-point chances this side won (converted).';
comment on column ask.match_stats.set_points_faced is 'Set points the other side held against this side.';
comment on column ask.match_stats.set_points_saved is 'Set points against this side that it won (saved).';
comment on column ask.match_stats.set_point_opportunities is 'Set points this side held (chances to close a set).';
comment on column ask.match_stats.set_points_converted is 'Set-point chances this side won (converted).';
comment on column ask.match_stats.total_points is 'Points played in the match, the same for both sides.';
comment on column ask.match_stats.total_points_won is 'Points this side won.';
comment on column ask.match_stats.service_winners is 'Serves by this side that won the point without being an ace (the return was touched but not made).';
comment on column ask.match_stats.forehand_winners is 'Winners this side hit on the forehand.';
comment on column ask.match_stats.backhand_winners is 'Winners this side hit on the backhand.';
comment on column ask.match_stats.forehand_unforced_errors is 'Unforced errors this side made on the forehand.';
comment on column ask.match_stats.backhand_unforced_errors is 'Unforced errors this side made on the backhand.';
comment on column ask.match_stats.volley_winners is 'Winners this side hit at the net (volleys and overheads).';
comment on column ask.match_stats.net_points_appearances is 'Points on which this side came to the net.';
comment on column ask.match_stats.net_points_won is 'Points this side won after coming to the net.';
comment on column ask.match_stats.serve_wide is 'Serves by this side placed wide (toward the sideline).';
comment on column ask.match_stats.serve_body is 'Serves by this side placed at the returner''s body.';
comment on column ask.match_stats.serve_t is 'Serves by this side placed down the T (the centre line).';
comment on column ask.match_stats.return_cross_court is 'Returns by this side hit cross-court.';
comment on column ask.match_stats.return_down_the_line is 'Returns by this side hit down the line.';
comment on column ask.match_stats.return_middle is 'Returns by this side hit through the middle of the court.';
comment on column ask.match_stats.return_contact_inside is 'Returns this side struck from inside the baseline (early, aggressive position).';
comment on column ask.match_stats.return_contact_middle is 'Returns this side struck from around the baseline.';
comment on column ask.match_stats.return_contact_deep is 'Returns this side struck from well behind the baseline.';
comment on column ask.match_stats.short_rally_won is 'Points this side won in rallies of 1–4 shots.';
comment on column ask.match_stats.short_rally_total is 'Points played in rallies of 1–4 shots, the same for both sides.';
comment on column ask.match_stats.medium_rally_won is 'Points this side won in rallies of 5–9 shots.';
comment on column ask.match_stats.medium_rally_total is 'Points played in rallies of 5–9 shots, the same for both sides.';
comment on column ask.match_stats.long_rally_won is 'Points this side won in rallies of 10 or more shots.';
comment on column ask.match_stats.long_rally_total is 'Points played in rallies of 10 or more shots, the same for both sides.';
comment on column ask.match_stats.first_serve_pct is 'Share of this side''s first serves that landed in, 0–100; null when it hit none.';
comment on column ask.match_stats.first_serve_won_pct is 'Share of points this side won when its first serve landed in, 0–100.';
comment on column ask.match_stats.second_serve_won_pct is 'Share of points this side won when its second serve landed in, 0–100.';
comment on column ask.match_stats.service_games_won_pct is 'Share of this side''s service games it held, 0–100.';
comment on column ask.match_stats.first_return_in_pct is 'Share of first serves this side returned into play, 0–100.';
comment on column ask.match_stats.second_return_in_pct is 'Share of second serves this side returned into play, 0–100.';
comment on column ask.match_stats.first_return_won_pct is 'Share of points this side won when returning a first serve, 0–100.';
comment on column ask.match_stats.second_return_won_pct is 'Share of points this side won when returning a second serve, 0–100.';
comment on column ask.match_stats.return_games_won_pct is 'Share of the other side''s service games this side broke, 0–100.';
comment on column ask.match_stats.break_points_saved_pct is 'Share of break points this side faced that it saved, 0–100; null when it faced none.';
comment on column ask.match_stats.break_points_converted_pct is 'Share of this side''s break-point chances it converted, 0–100; null when it had none.';
comment on column ask.match_stats.set_points_saved_pct is 'Share of set points against this side that it saved, 0–100; null when it faced none.';
comment on column ask.match_stats.set_points_converted_pct is 'Share of this side''s set-point chances it converted, 0–100; null when it had none.';
comment on column ask.match_stats.total_points_won_pct is 'Share of all points in the match this side won, 0–100.';
comment on column ask.match_stats.serve_rating is 'Composite serve score: first-serve %, first- and second-serve points won %, and service games held % summed, plus aces minus double faults; higher is better, null when any part is missing.';
comment on column ask.match_stats.return_rating is 'Composite return score: first- and second-serve return points won %, return games won % and break points converted % summed; higher is better, null when any part is missing.';
comment on column ask.match_stats.under_pressure_rating is 'Average of the break- and set-point percentages this side had a chance at (saved and converted), 0–100; null when it had none.';
comment on column ask.match_stats.short_rally_won_pct is 'Share of 1–4 shot rallies this side won, 0–100; null when there were none.';
comment on column ask.match_stats.medium_rally_won_pct is 'Share of 5–9 shot rallies this side won, 0–100; null when there were none.';
comment on column ask.match_stats.long_rally_won_pct is 'Share of rallies of 10 or more shots this side won, 0–100; null when there were none.';
comment on column ask.match_stats.serve_wide_pct is 'Share of this side''s placed serves that went wide, 0–100.';
comment on column ask.match_stats.serve_body_pct is 'Share of this side''s placed serves that went at the body, 0–100.';
comment on column ask.match_stats.serve_t_pct is 'Share of this side''s placed serves that went down the T, 0–100.';
comment on column ask.match_stats.return_cross_court_pct is 'Share of this side''s returns hit cross-court, 0–100.';
comment on column ask.match_stats.return_down_the_line_pct is 'Share of this side''s returns hit down the line, 0–100.';
comment on column ask.match_stats.return_middle_pct is 'Share of this side''s returns hit through the middle, 0–100.';
comment on column ask.match_stats.return_contact_inside_pct is 'Share of this side''s returns struck from inside the baseline, 0–100.';
comment on column ask.match_stats.return_contact_middle_pct is 'Share of this side''s returns struck from around the baseline, 0–100.';
comment on column ask.match_stats.return_contact_deep_pct is 'Share of this side''s returns struck from well behind the baseline, 0–100.';

-- ---------------------------------------------------------------------------
-- One row per point, server and winner turned to the viewer.
-- ---------------------------------------------------------------------------
create or replace view ask.points as
with mine as (
  select m.id as match_id, ask.my_side(m) = 'player1' as me_is_player1
    from public.matches m
   where m.id in (select ask.my_match_ids())
     and ask.my_side(m) is not null
)
select
  p.match_id,
  p.set_number,
  p.game_number
    - min(p.game_number) over (partition by p.match_id, p.set_number)
    + 1 as game_number,
  p.point_number,
  p.server_is_player1 = mine.me_is_player1 as i_served,
  p.won_by_player1 = mine.me_is_player1 as i_won,
  p.is_break_point,
  p.is_set_point,
  p.is_match_point,
  p.is_pressure_point,
  p.rally_length,
  p.result_type
from public.points p
join mine on mine.match_id = p.match_id;

comment on view ask.points is
  'Every point of the viewer''s own personal matches, one row each, with the server and the winner already turned to the viewer (i_served, i_won).';
comment on column ask.points.match_id is 'The match this point belongs to; join to ask.matches.match_id.';
comment on column ask.points.set_number is 'Which set the point was played in, counting from 1.';
comment on column ask.points.game_number is 'Which game of that set the point was played in, counting from 1 within each set.';
comment on column ask.points.point_number is 'The point''s position in the whole match, counting from 1; orders points and joins to ask.shots.point_number.';
comment on column ask.points.i_served is 'True when the viewer served this point, false when the opponent did.';
comment on column ask.points.i_won is 'True when the viewer won this point, false when the opponent did.';
comment on column ask.points.is_break_point is 'True when the returner could break serve by winning this point; null when the source did not say.';
comment on column ask.points.is_set_point is 'True when either side could win the set with this point; null when the source did not say.';
comment on column ask.points.is_match_point is 'True when either side could win the match with this point; null when the source did not say.';
comment on column ask.points.is_pressure_point is 'Reserved flag for a high-pressure point; no current data source sets it, so it is false on every row today — use is_break_point, is_set_point and is_match_point instead.';
comment on column ask.points.rally_length is 'Number of shots in the point, the serve included; null when not recorded.';
comment on column ask.points.result_type is 'How the point ended, as text: Ace, Double Fault, Service Winner, Forehand Winner, Backhand Winner, Volley Winner, Overhead Winner, Forehand Unforced Error, Backhand Unforced Error, Forehand Forced Error, Backhand Forced Error, and the like; the stroke named is the one that ended the point, by whoever hit it; null when unknown.';

-- ---------------------------------------------------------------------------
-- One row per shot, the hitter turned to the viewer. Reached through
-- points, so point_id never surfaces; point_number is the join key.
-- ---------------------------------------------------------------------------
create or replace view ask.shots as
with mine as (
  select m.id as match_id, ask.my_side(m) = 'player1' as me_is_player1
    from public.matches m
   where m.id in (select ask.my_match_ids())
     and ask.my_side(m) is not null
)
select
  p.match_id,
  p.point_number,
  s.shot_number,
  s.is_player1 = mine.me_is_player1 as mine,
  s.shot_type,
  initcap(s.spin_type) as spin_type,
  s.speed_mph,
  s.zone,
  s.result
from public.shots s
join public.points p on p.id = s.point_id
join mine on mine.match_id = p.match_id;

comment on view ask.shots is
  'Every recorded shot of the viewer''s own personal matches, one row each, with the hitter already turned to the viewer (mine). Join to ask.points on match_id and point_number.';
comment on column ask.shots.match_id is 'The match this shot belongs to; join to ask.matches.match_id.';
comment on column ask.shots.point_number is 'The point this shot was part of; joins to ask.points.point_number within the same match_id.';
comment on column ask.shots.shot_number is 'The shot''s order within the point, counting from 1: 1 is the serve, 2 the return, 3 the server''s next shot, and so on.';
comment on column ask.shots.mine is 'True when the viewer hit this shot, false when the opponent did.';
comment on column ask.shots.shot_type is 'The stroke, as text: First Serve, Second Serve, Forehand, Backhand, Volley, Overhead, or a few rarer labels; null when unknown.';
comment on column ask.shots.spin_type is 'The spin on the ball, as text: Topspin, Flat, Slice, Backspin, Sidespin or Kick; null when unknown.';
comment on column ask.shots.speed_mph is 'Ball speed off the racket in miles per hour; null when not measured.';
comment on column ask.shots.zone is 'Where the shot was aimed, as text: for serves Wide, Body or T; for other shots Crosscourt, Down the Line or Middle; null when not recorded.';
comment on column ask.shots.result is 'Whether the shot landed: In, Out or Net; null when not recorded.';

-- ---------------------------------------------------------------------------
-- Grants: the reader and nobody else. The schema-wide revoke is the default
-- these views already have; it is restated so the file reads whole.
-- ---------------------------------------------------------------------------
revoke all on ask.match_stats, ask.points, ask.shots from public, anon, authenticated;
grant select on ask.match_stats, ask.points, ask.shots to ask_reader;

-- Forced vs unforced errors, phase 1 (T1).
--
-- `match_stats.forced_errors` has been inserted as literal NULL since the
-- column was added: `calculate_match_stats` never counted it, so every Forced
-- Error point folded into "errors" and the forced/unforced split was consumed
-- nowhere. This migration makes the column mean something, but only on a match
-- whose errors have actually been judged:
--
--   * SwingVision exports label every error forced or unforced at import, so
--     `source_provider = 'swing-vision'` is judged by construction.
--   * A video match is judged only when it is published with every error
--     marked — Phase 2 (T11) stamps `matches.errors_judged_at` then. Until
--     that stamp exists the derivation still never emits a Forced Error
--     string, and the column stays NULL so nothing reads "0 forced errors"
--     as a clean match.
--
-- Everything else in `calculate_match_stats` is byte-identical to the live
-- definition (pg_get_functiondef, 2026-10-29): only the two `forced_errors`
-- expressions change. `unforced_errors` and the forehand/backhand breakdown
-- are untouched. The 18 pre-existing verified video matches keep
-- `errors_judged_at` NULL and therefore keep NULL `forced_errors`.

alter table public.matches
  add column if not exists errors_judged_at timestamptz null;

comment on column public.matches.errors_judged_at is
  'Set when a match is published with every error marked forced or unforced; null = nobody judged the split, so match_stats.forced_errors stays NULL for it. SwingVision matches are judged by construction and do not need the stamp.';

CREATE OR REPLACE FUNCTION public.calculate_match_stats(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_points INT;
  v_total_shots INT;
BEGIN
  -- Get counts for logging
  SELECT COUNT(*) INTO v_total_points FROM public.points WHERE match_id = p_match_id;
  SELECT COUNT(*) INTO v_total_shots FROM public.shots s
    JOIN public.points p ON s.point_id = p.id
    WHERE p.match_id = p_match_id;

  RAISE NOTICE 'Calculating stats for match % with % points and % shots',
    p_match_id, v_total_points, v_total_shots;

  -- Calculate and upsert stats for Player 1 (is_player1 = true)
  INSERT INTO public.match_stats (
    match_id,
    is_player1,
    aces,
    double_faults,
    winners,
    unforced_errors,
    forced_errors,
    avg_rally_length,
    first_serves,
    first_serves_in,
    first_serve_points_won,
    second_serves,
    second_serves_in,
    second_serve_points_won,
    service_games,
    service_games_won,
    first_returns,
    first_return_points_won,
    second_returns,
    second_return_points_won,
    return_games,
    return_games_won,
    break_points_faced,
    break_points_saved,
    break_point_opportunities,
    break_points_converted,
    set_points_faced,
    set_points_saved,
    set_point_opportunities,
    set_points_converted,
    total_points,
    total_points_won,
    service_winners,
    forehand_winners,
    backhand_winners,
    forehand_unforced_errors,
    backhand_unforced_errors,
    volley_winners,
    serve_wide,
    serve_body,
    serve_t,
    return_cross_court,
    return_down_the_line,
    return_middle,
    return_contact_inside,
    return_contact_middle,
    return_contact_deep,
    updated_at
  )
  SELECT
    p_match_id,
    true AS is_player1,

    -- BASIC STATS
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Ace' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Double Fault' AND server_is_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type LIKE '%Winner%' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type LIKE '%Unforced Error%' AND won_by_player1 = false),
    (SELECT CASE
       WHEN m.source_provider = 'swing-vision' OR m.errors_judged_at IS NOT NULL THEN
         (SELECT COUNT(*) FROM public.points
          WHERE match_id = p_match_id AND result_type LIKE '%Forced Error%'
            AND result_type NOT LIKE '%Unforced%' AND won_by_player1 = false)
       ELSE NULL
     END FROM public.matches m WHERE m.id = p_match_id),
    (SELECT ROUND(AVG(rally_length)::numeric, 1) FROM public.points WHERE match_id = p_match_id),

    -- SERVE STATS
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = true),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = true AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = true
       AND s.result = 'In' AND p.won_by_player1 = true),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = true),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = true AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = true
       AND s.result = 'In' AND p.won_by_player1 = true),
    (SELECT COUNT(DISTINCT (set_number, game_number)) FROM public.points
     WHERE match_id = p_match_id AND server_is_player1 = true),
    (WITH game_results AS (
      SELECT set_number, game_number, won_by_player1,
             ROW_NUMBER() OVER (PARTITION BY set_number, game_number ORDER BY point_number DESC) as rn
      FROM public.points
      WHERE match_id = p_match_id AND server_is_player1 = true
    )
    SELECT COUNT(DISTINCT (set_number, game_number)) FROM game_results
    WHERE rn = 1 AND won_by_player1 = true),

    -- RETURN STATS
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = false AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = false
       AND s.result = 'In' AND p.won_by_player1 = true),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = false AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = false
       AND s.result = 'In' AND p.won_by_player1 = true),
    (SELECT COUNT(DISTINCT (set_number, game_number)) FROM public.points
     WHERE match_id = p_match_id AND server_is_player1 = false),
    (WITH game_results AS (
      SELECT set_number, game_number, won_by_player1,
             ROW_NUMBER() OVER (PARTITION BY set_number, game_number ORDER BY point_number DESC) as rn
      FROM public.points
      WHERE match_id = p_match_id AND server_is_player1 = false
    )
    SELECT COUNT(DISTINCT (set_number, game_number)) FROM game_results
    WHERE rn = 1 AND won_by_player1 = true),

    -- BREAK POINT STATS
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = true AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = false AND won_by_player1 = true),

    -- SET POINT STATS
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true
       AND EXISTS (
         SELECT 1 FROM public.points p2
         WHERE p2.match_id = p_match_id
           AND p2.set_number = public.points.set_number
           AND p2.game_number = public.points.game_number
           AND p2.point_number > public.points.point_number
       )
       AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true AND won_by_player1 = true),
    (WITH last_point_per_set AS (
      SELECT set_number, MAX(point_number) as max_point
      FROM public.points WHERE match_id = p_match_id GROUP BY set_number
    )
    SELECT COUNT(*) FROM public.points p
    JOIN last_point_per_set lp ON p.set_number = lp.set_number AND p.point_number = lp.max_point
    WHERE p.match_id = p_match_id AND p.is_set_point = true AND p.won_by_player1 = true),

    -- POINT TOTALS
    (SELECT COUNT(*) FROM public.points WHERE match_id = p_match_id),
    (SELECT COUNT(*) FROM public.points WHERE match_id = p_match_id AND won_by_player1 = true),

    -- SHOT-TYPE BREAKDOWN
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Service Winner' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Forehand Winner' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Backhand Winner' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Forehand Unforced Error' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Backhand Unforced Error' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points p
     WHERE p.match_id = p_match_id AND p.won_by_player1 = true
       AND EXISTS (
         SELECT 1 FROM public.shots s
         WHERE s.point_id = p.id AND s.is_player1 = true AND s.shot_type = 'Volley'
       )
       AND p.result_type LIKE '%Winner%'),

    -- SERVE PLACEMENT (Player 1's serves)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.zone = 'Wide'),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.zone = 'Body'),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.zone = 'T'),

    -- RETURN DIRECTION (Player 1's returns)
    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Crosscourt'),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Down the Line'),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Middle'),

    -- RETURN CONTACT POSITION (Player 1)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) > 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) BETWEEN -1.0 AND 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) < -1.0),

    NOW()

  ON CONFLICT (match_id, is_player1)
  DO UPDATE SET
    aces = EXCLUDED.aces,
    double_faults = EXCLUDED.double_faults,
    winners = EXCLUDED.winners,
    unforced_errors = EXCLUDED.unforced_errors,
    forced_errors = EXCLUDED.forced_errors,
    avg_rally_length = EXCLUDED.avg_rally_length,
    first_serves = EXCLUDED.first_serves,
    first_serves_in = EXCLUDED.first_serves_in,
    first_serve_points_won = EXCLUDED.first_serve_points_won,
    second_serves = EXCLUDED.second_serves,
    second_serves_in = EXCLUDED.second_serves_in,
    second_serve_points_won = EXCLUDED.second_serve_points_won,
    service_games = EXCLUDED.service_games,
    service_games_won = EXCLUDED.service_games_won,
    first_returns = EXCLUDED.first_returns,
    first_return_points_won = EXCLUDED.first_return_points_won,
    second_returns = EXCLUDED.second_returns,
    second_return_points_won = EXCLUDED.second_return_points_won,
    return_games = EXCLUDED.return_games,
    return_games_won = EXCLUDED.return_games_won,
    break_points_faced = EXCLUDED.break_points_faced,
    break_points_saved = EXCLUDED.break_points_saved,
    break_point_opportunities = EXCLUDED.break_point_opportunities,
    break_points_converted = EXCLUDED.break_points_converted,
    set_points_faced = EXCLUDED.set_points_faced,
    set_points_saved = EXCLUDED.set_points_saved,
    set_point_opportunities = EXCLUDED.set_point_opportunities,
    set_points_converted = EXCLUDED.set_points_converted,
    total_points = EXCLUDED.total_points,
    total_points_won = EXCLUDED.total_points_won,
    service_winners = EXCLUDED.service_winners,
    forehand_winners = EXCLUDED.forehand_winners,
    backhand_winners = EXCLUDED.backhand_winners,
    forehand_unforced_errors = EXCLUDED.forehand_unforced_errors,
    backhand_unforced_errors = EXCLUDED.backhand_unforced_errors,
    volley_winners = EXCLUDED.volley_winners,
    serve_wide = EXCLUDED.serve_wide,
    serve_body = EXCLUDED.serve_body,
    serve_t = EXCLUDED.serve_t,
    return_cross_court = EXCLUDED.return_cross_court,
    return_down_the_line = EXCLUDED.return_down_the_line,
    return_middle = EXCLUDED.return_middle,
    return_contact_inside = EXCLUDED.return_contact_inside,
    return_contact_middle = EXCLUDED.return_contact_middle,
    return_contact_deep = EXCLUDED.return_contact_deep,
    updated_at = NOW();

  -- Player 2 stats
  INSERT INTO public.match_stats (
    match_id,
    is_player1,
    aces,
    double_faults,
    winners,
    unforced_errors,
    forced_errors,
    avg_rally_length,
    first_serves,
    first_serves_in,
    first_serve_points_won,
    second_serves,
    second_serves_in,
    second_serve_points_won,
    service_games,
    service_games_won,
    first_returns,
    first_return_points_won,
    second_returns,
    second_return_points_won,
    return_games,
    return_games_won,
    break_points_faced,
    break_points_saved,
    break_point_opportunities,
    break_points_converted,
    set_points_faced,
    set_points_saved,
    set_point_opportunities,
    set_points_converted,
    total_points,
    total_points_won,
    service_winners,
    forehand_winners,
    backhand_winners,
    forehand_unforced_errors,
    backhand_unforced_errors,
    volley_winners,
    serve_wide,
    serve_body,
    serve_t,
    return_cross_court,
    return_down_the_line,
    return_middle,
    return_contact_inside,
    return_contact_middle,
    return_contact_deep,
    updated_at
  )
  SELECT
    p_match_id,
    false AS is_player1,

    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Ace' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Double Fault' AND server_is_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type LIKE '%Winner%' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type LIKE '%Unforced Error%' AND won_by_player1 = true),
    (SELECT CASE
       WHEN m.source_provider = 'swing-vision' OR m.errors_judged_at IS NOT NULL THEN
         (SELECT COUNT(*) FROM public.points
          WHERE match_id = p_match_id AND result_type LIKE '%Forced Error%'
            AND result_type NOT LIKE '%Unforced%' AND won_by_player1 = true)
       ELSE NULL
     END FROM public.matches m WHERE m.id = p_match_id),
    (SELECT ROUND(AVG(rally_length)::numeric, 1) FROM public.points WHERE match_id = p_match_id),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = false),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = false AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = false
       AND s.result = 'In' AND p.won_by_player1 = false),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = false),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = false AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = false
       AND s.result = 'In' AND p.won_by_player1 = false),
    (SELECT COUNT(DISTINCT (set_number, game_number)) FROM public.points
     WHERE match_id = p_match_id AND server_is_player1 = false),
    (WITH game_results AS (
      SELECT set_number, game_number, won_by_player1,
             ROW_NUMBER() OVER (PARTITION BY set_number, game_number ORDER BY point_number DESC) as rn
      FROM public.points
      WHERE match_id = p_match_id AND server_is_player1 = false
    )
    SELECT COUNT(DISTINCT (set_number, game_number)) FROM game_results
    WHERE rn = 1 AND won_by_player1 = false),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = true AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'First Serve' AND s.is_player1 = true
       AND s.result = 'In' AND p.won_by_player1 = false),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = true AND s.result = 'In'),
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id AND s.shot_type = 'Second Serve' AND s.is_player1 = true
       AND s.result = 'In' AND p.won_by_player1 = false),
    (SELECT COUNT(DISTINCT (set_number, game_number)) FROM public.points
     WHERE match_id = p_match_id AND server_is_player1 = true),
    (WITH game_results AS (
      SELECT set_number, game_number, won_by_player1,
             ROW_NUMBER() OVER (PARTITION BY set_number, game_number ORDER BY point_number DESC) as rn
      FROM public.points
      WHERE match_id = p_match_id AND server_is_player1 = true
    )
    SELECT COUNT(DISTINCT (set_number, game_number)) FROM game_results
    WHERE rn = 1 AND won_by_player1 = false),

    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = false AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_break_point = true AND server_is_player1 = true AND won_by_player1 = false),

    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true
       AND EXISTS (
         SELECT 1 FROM public.points p2
         WHERE p2.match_id = p_match_id
           AND p2.set_number = public.points.set_number
           AND p2.game_number = public.points.game_number
           AND p2.point_number > public.points.point_number
       )
       AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND is_set_point = true AND won_by_player1 = false),
    (WITH last_point_per_set AS (
      SELECT set_number, MAX(point_number) as max_point
      FROM public.points WHERE match_id = p_match_id GROUP BY set_number
    )
    SELECT COUNT(*) FROM public.points p
    JOIN last_point_per_set lp ON p.set_number = lp.set_number AND p.point_number = lp.max_point
    WHERE p.match_id = p_match_id AND p.is_set_point = true AND p.won_by_player1 = false),

    (SELECT COUNT(*) FROM public.points WHERE match_id = p_match_id),
    (SELECT COUNT(*) FROM public.points WHERE match_id = p_match_id AND won_by_player1 = false),

    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Service Winner' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Forehand Winner' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Backhand Winner' AND won_by_player1 = false),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Forehand Unforced Error' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points
     WHERE match_id = p_match_id AND result_type = 'Backhand Unforced Error' AND won_by_player1 = true),
    (SELECT COUNT(*) FROM public.points p
     WHERE p.match_id = p_match_id AND p.won_by_player1 = false
       AND EXISTS (
         SELECT 1 FROM public.shots s
         WHERE s.point_id = p.id AND s.is_player1 = false AND s.shot_type = 'Volley'
       )
       AND p.result_type LIKE '%Winner%'),

    -- SERVE PLACEMENT (Player 2's serves)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.zone = 'Wide'),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.zone = 'Body'),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.zone = 'T'),

    -- RETURN DIRECTION (Player 2's returns)
    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Crosscourt'),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Down the Line'),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND ret.is_player1 <> p.server_is_player1
       AND ret.zone = 'Middle'),

    -- RETURN CONTACT POSITION (Player 2)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) > 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) BETWEEN -1.0 AND 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
       AND s.is_player1 <> p.server_is_player1
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) < -1.0),

    NOW()

  ON CONFLICT (match_id, is_player1)
  DO UPDATE SET
    aces = EXCLUDED.aces,
    double_faults = EXCLUDED.double_faults,
    winners = EXCLUDED.winners,
    unforced_errors = EXCLUDED.unforced_errors,
    forced_errors = EXCLUDED.forced_errors,
    avg_rally_length = EXCLUDED.avg_rally_length,
    first_serves = EXCLUDED.first_serves,
    first_serves_in = EXCLUDED.first_serves_in,
    first_serve_points_won = EXCLUDED.first_serve_points_won,
    second_serves = EXCLUDED.second_serves,
    second_serves_in = EXCLUDED.second_serves_in,
    second_serve_points_won = EXCLUDED.second_serve_points_won,
    service_games = EXCLUDED.service_games,
    service_games_won = EXCLUDED.service_games_won,
    first_returns = EXCLUDED.first_returns,
    first_return_points_won = EXCLUDED.first_return_points_won,
    second_returns = EXCLUDED.second_returns,
    second_return_points_won = EXCLUDED.second_return_points_won,
    return_games = EXCLUDED.return_games,
    return_games_won = EXCLUDED.return_games_won,
    break_points_faced = EXCLUDED.break_points_faced,
    break_points_saved = EXCLUDED.break_points_saved,
    break_point_opportunities = EXCLUDED.break_point_opportunities,
    break_points_converted = EXCLUDED.break_points_converted,
    set_points_faced = EXCLUDED.set_points_faced,
    set_points_saved = EXCLUDED.set_points_saved,
    set_point_opportunities = EXCLUDED.set_point_opportunities,
    set_points_converted = EXCLUDED.set_points_converted,
    total_points = EXCLUDED.total_points,
    total_points_won = EXCLUDED.total_points_won,
    service_winners = EXCLUDED.service_winners,
    forehand_winners = EXCLUDED.forehand_winners,
    backhand_winners = EXCLUDED.backhand_winners,
    forehand_unforced_errors = EXCLUDED.forehand_unforced_errors,
    backhand_unforced_errors = EXCLUDED.backhand_unforced_errors,
    volley_winners = EXCLUDED.volley_winners,
    serve_wide = EXCLUDED.serve_wide,
    serve_body = EXCLUDED.serve_body,
    serve_t = EXCLUDED.serve_t,
    return_cross_court = EXCLUDED.return_cross_court,
    return_down_the_line = EXCLUDED.return_down_the_line,
    return_middle = EXCLUDED.return_middle,
    return_contact_inside = EXCLUDED.return_contact_inside,
    return_contact_middle = EXCLUDED.return_contact_middle,
    return_contact_deep = EXCLUDED.return_contact_deep,
    updated_at = NOW();

  RAISE NOTICE 'Stats calculation complete for match %', p_match_id;
END;
$function$;

-- `create or replace` keeps existing grants, but restate them so the file
-- documents the boundary on its own: the app's server code calls this as
-- service_role, the upload path as the signed-in user; never anon.
revoke all on function public.calculate_match_stats(uuid) from public, anon;
grant execute on function public.calculate_match_stats(uuid) to authenticated, service_role;

-- Recompute every SwingVision match so its `forced_errors` rows stop being
-- NULL. Expected live result (checked 2026-10-29): 44 swing-vision matches;
-- the 261 non-unforced "Forced Error" points (all of them swing-vision) land
-- in `forced_errors`, and the 28 older non-null rows — all on 14 swing-vision
-- matches — are normalised by the same recompute. Matches with a null
-- `source_provider` (11) and video matches stay unjudged and keep NULL.
do $$
declare
  v_match_id uuid;
  v_count integer := 0;
begin
  for v_match_id in
    select id from public.matches where source_provider = 'swing-vision'
  loop
    perform public.calculate_match_stats(v_match_id);
    v_count := v_count + 1;
  end loop;
  raise notice 'forced_errors_judged: recomputed % swing-vision matches', v_count;
end
$$;

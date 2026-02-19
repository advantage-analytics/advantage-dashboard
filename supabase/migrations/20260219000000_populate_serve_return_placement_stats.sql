-- Populate serve placement, return direction & contact position in calculate_match_stats
-- These 9 columns already exist in match_stats but were never populated by the RPC function.

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
    NULL,
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

    -- SERVE PLACEMENT (Player 1's serves — equal thirds of 4.115m service box)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) >= 2.74),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) >= 1.37 AND abs(s.landing_x) < 2.74),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = true
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) < 1.37),

    -- RETURN DIRECTION (Player 1's returns — sign comparison with serve landing)
    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.shots serve ON ret.point_id = serve.point_id AND serve.shot_number = 1
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) > 1.0
       AND sign(serve.landing_x) != sign(ret.landing_x)),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.shots serve ON ret.point_id = serve.point_id AND serve.shot_number = 1
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) > 1.0
       AND sign(serve.landing_x) = sign(ret.landing_x)),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = true
       AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) <= 1.0),

    -- RETURN CONTACT POSITION (Player 1 — normalized distance from nearest baseline)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) > 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) BETWEEN -1.0 AND 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = true
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
    NULL,
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

    -- SERVE PLACEMENT (Player 2's serves — equal thirds of 4.115m service box)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) >= 2.74),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) >= 1.37 AND abs(s.landing_x) < 2.74),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_type IN ('First Serve', 'Second Serve')
       AND s.is_player1 = false
       AND s.landing_x IS NOT NULL
       AND abs(s.landing_x) < 1.37),

    -- RETURN DIRECTION (Player 2's returns — sign comparison with serve landing)
    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.shots serve ON ret.point_id = serve.point_id AND serve.shot_number = 1
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) > 1.0
       AND sign(serve.landing_x) != sign(ret.landing_x)),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.shots serve ON ret.point_id = serve.point_id AND serve.shot_number = 1
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) > 1.0
       AND sign(serve.landing_x) = sign(ret.landing_x)),

    (SELECT COUNT(*) FROM public.shots ret
     JOIN public.points p ON ret.point_id = p.id
     WHERE p.match_id = p_match_id
       AND ret.shot_number = 2 AND ret.is_player1 = false
       AND ret.landing_x IS NOT NULL
       AND abs(ret.landing_x) <= 1.0),

    -- RETURN CONTACT POSITION (Player 2 — normalized distance from nearest baseline)
    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) > 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
       AND s.contact_y IS NOT NULL
       AND (CASE WHEN s.contact_y < 11.885 THEN s.contact_y ELSE 23.77 - s.contact_y END) BETWEEN -1.0 AND 0.0),

    (SELECT COUNT(*) FROM public.shots s
     JOIN public.points p ON s.point_id = p.id
     WHERE p.match_id = p_match_id
       AND s.shot_number = 2 AND s.is_player1 = false
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

-- Backfill: re-run calculate_match_stats for all existing matches
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.matches LOOP
    PERFORM public.calculate_match_stats(r.id);
  END LOOP;
END $$;

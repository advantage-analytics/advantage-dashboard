-- Populate first_returns_in, second_returns_in, net_points_appearances, net_points_won.
-- calculate_match_stats (the main per-match RPC) never wrote these four columns, so the
-- matching UI rows (Second Serve Return In %, Net Points Appearances, Net Points Won)
-- have always rendered as empty / zero. Rather than rewrite the 450-line RPC, we add a
-- focused helper that computes just these four values and have the edge function call
-- it right after calculate_match_stats.

CREATE OR REPLACE FUNCTION public.backfill_returns_in_and_net_points(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.match_stats ms SET
    first_returns_in = (
      SELECT COUNT(*) FROM public.shots ret
      JOIN public.shots serve
        ON ret.point_id = serve.point_id AND serve.shot_number = 1
      JOIN public.points p ON ret.point_id = p.id
      WHERE p.match_id = ms.match_id
        AND ret.shot_number = 2
        AND ret.is_player1 = ms.is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'First Serve'
        AND serve.result = 'In'
    ),
    second_returns_in = (
      SELECT COUNT(*) FROM public.shots ret
      JOIN public.shots serve
        ON ret.point_id = serve.point_id AND serve.shot_number = 1
      JOIN public.points p ON ret.point_id = p.id
      WHERE p.match_id = ms.match_id
        AND ret.shot_number = 2
        AND ret.is_player1 = ms.is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'Second Serve'
        AND serve.result = 'In'
    ),
    net_points_appearances = (
      SELECT COUNT(*) FROM public.points p
      WHERE p.match_id = ms.match_id
        AND EXISTS (
          SELECT 1 FROM public.shots s
          WHERE s.point_id = p.id
            AND s.is_player1 = ms.is_player1
            AND s.shot_type IN ('Volley', 'Overhead')
        )
    ),
    net_points_won = (
      SELECT COUNT(*) FROM public.points p
      WHERE p.match_id = ms.match_id
        AND (
          (ms.is_player1 AND p.won_by_player1)
          OR (NOT ms.is_player1 AND NOT p.won_by_player1)
        )
        AND EXISTS (
          SELECT 1 FROM public.shots s
          WHERE s.point_id = p.id
            AND s.is_player1 = ms.is_player1
            AND s.shot_type IN ('Volley', 'Overhead')
        )
    ),
    updated_at = NOW()
  WHERE ms.match_id = p_match_id;
END;
$function$;

-- Backfill existing matches.
SELECT public.backfill_returns_in_and_net_points(id) FROM public.matches;

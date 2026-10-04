-- A shot 2 struck by the SERVER is not a return.
--
-- Advantage Intelligence sometimes misses the returner's stroke, so the row at
-- shot_number 2 is the server's next ball: 38 of 570 video points on the
-- 2026-09-28 measurement, every one a far-side server whose near-side return
-- is missing (serve to "shot 2" takes 1.9-3.0 s against 0.5-1.2 s for a real
-- return). SwingVision produces the same shape from points whose serve was
-- never captured, and from several strokes sharing shot_number 2.
-- 20260928153631 already keeps these rows out of return direction. This does
-- the same for the two remaining return families:
--
-- 1. calculate_match_stats: return_contact_inside/middle/deep counted the
--    server's own ball as the server's return contact.
--
-- 2. backfill_returns_in_and_net_points: first/second_returns_in credited the
--    SERVER with a return in. The server playing another ball proves the
--    returner's return landed in, so for Advantage Intelligence the returner is
--    credited instead - the same structural rule derivation's shotResult()
--    uses ("if the opponent played the next ball, this one was in"). The
--    inference is scoped to source_provider = 'splitstep': a SwingVision point
--    with no return row is a merged or truncated export, not a missed stroke.
--    The missed return has no position, so return contact only skips it.
--
-- The repo's copy of calculate_match_stats is stale (supabase/migrations runs
-- ~100 behind the live database), so it is rewritten in place like
-- 20260928153631: each fragment must occur exactly the stated number of times,
-- or the migration aborts with nothing changed.
do $migration$
declare
  def text := pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure);
  guard constant text := 's.is_player1 <> p.server_is_player1';
  edits constant text[][] := array[
    -- return contact, player 1: inside / middle / deep
    array[
      E'       AND s.shot_number = 2 AND s.is_player1 = true\n',
      E'       AND s.shot_number = 2 AND s.is_player1 = true\n       AND s.is_player1 <> p.server_is_player1\n',
      '3'],
    -- return contact, player 2: inside / middle / deep
    array[
      E'       AND s.shot_number = 2 AND s.is_player1 = false\n',
      E'       AND s.shot_number = 2 AND s.is_player1 = false\n       AND s.is_player1 <> p.server_is_player1\n',
      '3']
  ];
  found int;
begin
  if position(guard in def) > 0 then
    raise exception 'calculate_match_stats already guards return contact';
  end if;
  for i in 1 .. array_length(edits, 1) loop
    found := (length(def) - length(replace(def, edits[i][1], ''))) / length(edits[i][1]);
    if found <> edits[i][3]::int then
      raise exception 'calculate_match_stats edit % matched % times, expected %',
        i, found, edits[i][3];
    end if;
    def := replace(def, edits[i][1], edits[i][2]);
  end loop;
  execute def;
end
$migration$;

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
        AND ret.is_player1 <> p.server_is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'First Serve'
        AND serve.result = 'In'
    ) + (
      -- Advantage Intelligence missed the return; the server struck again.
      SELECT COUNT(*) FROM public.points p
      JOIN public.matches m ON m.id = p.match_id
      JOIN public.shots serve
        ON serve.point_id = p.id AND serve.shot_number = 1
      WHERE p.match_id = ms.match_id
        AND m.source_provider = 'splitstep'
        AND p.server_is_player1 <> ms.is_player1
        AND serve.is_player1 = p.server_is_player1
        AND serve.shot_type = 'First Serve'
        AND serve.result = 'In'
        AND NOT EXISTS (
          SELECT 1 FROM public.shots r
          WHERE r.point_id = p.id AND r.shot_number = 2
            AND r.is_player1 <> p.server_is_player1
        )
        AND EXISTS (
          SELECT 1 FROM public.shots x
          WHERE x.point_id = p.id AND x.shot_number >= 2
            AND x.is_player1 = p.server_is_player1
        )
    ),
    second_returns_in = (
      SELECT COUNT(*) FROM public.shots ret
      JOIN public.shots serve
        ON ret.point_id = serve.point_id AND serve.shot_number = 1
      JOIN public.points p ON ret.point_id = p.id
      WHERE p.match_id = ms.match_id
        AND ret.shot_number = 2
        AND ret.is_player1 = ms.is_player1
        AND ret.is_player1 <> p.server_is_player1
        AND ret.result = 'In'
        AND serve.shot_type = 'Second Serve'
        AND serve.result = 'In'
    ) + (
      -- Advantage Intelligence missed the return; the server struck again.
      SELECT COUNT(*) FROM public.points p
      JOIN public.matches m ON m.id = p.match_id
      JOIN public.shots serve
        ON serve.point_id = p.id AND serve.shot_number = 1
      WHERE p.match_id = ms.match_id
        AND m.source_provider = 'splitstep'
        AND p.server_is_player1 <> ms.is_player1
        AND serve.is_player1 = p.server_is_player1
        AND serve.shot_type = 'Second Serve'
        AND serve.result = 'In'
        AND NOT EXISTS (
          SELECT 1 FROM public.shots r
          WHERE r.point_id = p.id AND r.shot_number = 2
            AND r.is_player1 <> p.server_is_player1
        )
        AND EXISTS (
          SELECT 1 FROM public.shots x
          WHERE x.point_id = p.id AND x.shot_number >= 2
            AND x.is_player1 = p.server_is_player1
        )
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

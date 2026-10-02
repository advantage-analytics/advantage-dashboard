-- calculate_match_stats counts placement from shots.zone; it no longer
-- re-derives it from coordinates.
--
-- Placement is ONE rule, decided where each shot is written: serveZone() /
-- directionZone() in src/lib/services/splitstep/derivation/court.ts for
-- Advantage Intelligence, their twins in supabase/functions/process-match for
-- SwingVision. The function counts the values, so a new placement (Inside-In,
-- Inside-Out) arrives through shots.zone alone.
--
-- The return rule this replaces compared the return's landing with the SERVE's
-- landing — a proxy for where the receiver stood. It misread returns off T
-- serves, and joined `serve.shot_number = 1`, which SwingVision's two serves
-- per point fanned out. A shot 2 hit by the SERVER is not a return (the vendor
-- missed the real one: 7% of video points, 2% of SwingVision), so it no longer
-- counts toward the server's return direction. return_contact_* is a different
-- measure (contact_y) and is untouched.
--
-- The repo's copy of this function is stale (supabase/migrations runs ~100
-- behind the live database), so this rewrites the LIVE definition in place:
-- every fragment below must occur exactly the stated number of times, or the
-- migration aborts with nothing changed.
do $migration$
declare
  def text := pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure);
  edits constant text[][] := array[
    -- serve placement, both players
    array[
      E'       AND s.landing_x IS NOT NULL\n       AND abs(s.landing_x) >= 2.74)',
      E'       AND s.zone = ''Wide'')',
      '2'],
    array[
      E'       AND s.landing_x IS NOT NULL\n       AND abs(s.landing_x) >= 1.37 AND abs(s.landing_x) < 2.74)',
      E'       AND s.zone = ''Body'')',
      '2'],
    array[
      E'       AND s.landing_x IS NOT NULL\n       AND abs(s.landing_x) < 1.37)',
      E'       AND s.zone = ''T'')',
      '2'],
    -- return direction, both players: no serve join
    array[
      E'     JOIN public.shots serve ON ret.point_id = serve.point_id AND serve.shot_number = 1\n',
      '',
      '4'],
    array[
      E'       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL\n       AND abs(ret.landing_x) > 1.0\n       AND sign(serve.landing_x) != sign(ret.landing_x))',
      E'       AND ret.is_player1 <> p.server_is_player1\n       AND ret.zone = ''Crosscourt'')',
      '2'],
    array[
      E'       AND serve.landing_x IS NOT NULL AND ret.landing_x IS NOT NULL\n       AND abs(ret.landing_x) > 1.0\n       AND sign(serve.landing_x) = sign(ret.landing_x))',
      E'       AND ret.is_player1 <> p.server_is_player1\n       AND ret.zone = ''Down the Line'')',
      '2'],
    array[
      E'       AND ret.landing_x IS NOT NULL\n       AND abs(ret.landing_x) <= 1.0)',
      E'       AND ret.is_player1 <> p.server_is_player1\n       AND ret.zone = ''Middle'')',
      '2']
  ];
  found int;
begin
  for i in 1 .. array_length(edits, 1) loop
    found := (length(def) - length(replace(def, edits[i][1], ''))) / length(edits[i][1]);
    if found <> edits[i][3]::int then
      raise exception 'calculate_match_stats edit % matched % times, expected %',
        i, found, edits[i][3];
    end if;
    def := replace(def, edits[i][1], edits[i][2]);
  end loop;
  if def ~ 'landing_x' then
    raise exception 'calculate_match_stats still reads landing_x after the rewrite';
  end if;
  execute def;
end
$migration$;

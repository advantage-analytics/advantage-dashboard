-- Let serves count as nothing.
--
-- A hand-labelled publish (src/lib/services/labels/apply.ts) now writes each
-- let serve as a `shots` row: shot_type 'First Serve' / 'Second Serve',
-- shot_number 0, result 'Let' (`LET_RESULT`), zone null. A let is replayed,
-- so it is no first serve, no fault and no serve of the point's. Two readers
-- would count it:
--
-- 1. calculate_match_stats: `first_serves` and `second_serves` count every
--    serve-typed row whatever its result, so a let would lower first-serve %.
--    The four counts that carry no result filter get
--    `s.result IS DISTINCT FROM 'Let'`. The `... AND s.result = 'In'` counts
--    and the zone counts already exclude a let (no zone, result not 'In').
-- 2. ask.shots: the view the Ask model writes SQL over, which says shot 0 is
--    "a faulted first serve or a feed". A count of faults there would take
--    lets. The `placed` CTE drops them, so every later CTE (hand inference,
--    the end votes) never sees one either.
--
-- The repo's migrations run far behind the live database (AGENTS.md), so both
-- are patched from their LIVE definitions rather than restated from a stale
-- file. Each patch asserts exactly how many places it changed and refuses to
-- run otherwise, so a definition that moved since this was written fails
-- loudly here instead of half-applying. No row carries result 'Let' until the
-- publish change ships, so this is safe to apply ahead of it.

do $$
declare
  def text := pg_get_functiondef('public.calculate_match_stats(uuid)'::regprocedure);
  pattern constant text :=
    $re$(s\.shot_type = '(First|Second) Serve' AND s\.is_player1 = (true|false))\)$re$;
  hits int := regexp_count(def, pattern);
begin
  if hits <> 4 then
    raise exception 'calculate_match_stats: expected 4 unfiltered serve counts, found %', hits;
  end if;
  execute regexp_replace(
    def,
    pattern,
    $rep$\1 AND s.result IS DISTINCT FROM 'Let')$rep$,
    'g'
  );
end
$$;

do $$
declare
  def text := pg_get_viewdef('ask.shots'::regclass);
  pattern constant text :=
    $re$(JOIN mine ON \(\(mine\.match_id = p\.match_id\)\)\))$re$;
  hits int := regexp_count(def, pattern);
begin
  if hits <> 1 then
    raise exception 'ask.shots: expected the placed CTE join once, found %', hits;
  end if;
  -- CREATE OR REPLACE keeps the view's grants (ask_reader: SELECT).
  execute 'create or replace view ask.shots as '
    || regexp_replace(
      rtrim(def, '; ' || chr(10)),
      pattern,
      $rep$\1
          WHERE (s.result IS DISTINCT FROM 'Let'::text)$rep$
    );
end
$$;

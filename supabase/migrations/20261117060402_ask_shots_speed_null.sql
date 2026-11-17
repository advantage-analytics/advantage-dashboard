-- Shot speed is never shown (UGA coaches call, 2026-11-16): a single camera
-- cannot measure it accurately. The Ask SQL guard refuses speed_mph, but a
-- static check cannot see every spelling (a U&"..." escaped identifier, a
-- whole-row read), so the view Ask and the Claude connector read stops
-- carrying it: ask.shots.speed_mph is now null on every row.
--
-- The column keeps its name, type and position, so CREATE OR REPLACE VIEW
-- applies in place: ask.point_plays (which depends on ask.shots), the
-- ask_reader grant and the column comments are untouched. public.shots
-- keeps every recorded speed; only this read view drops it.
--
-- The view body is rewritten from its own live definition, replacing the
-- one select-list line; it refuses to run unless that line appears exactly
-- once, so a view that has drifted from what this expects is left alone.
do $$
declare
  def text := pg_get_viewdef('ask.shots'::regclass, true);
  pattern constant text := '(initcap\(spin_type\) AS spin_type,\s+)speed_mph,';
  hits int;
begin
  select count(*) into hits from regexp_matches(def, pattern, 'g');
  if hits <> 1 then
    raise exception 'ask.shots: expected one speed_mph select line, found %', hits;
  end if;
  execute 'create or replace view ask.shots as '
    || regexp_replace(def, pattern, '\1null::double precision as speed_mph,');
end
$$;

comment on column ask.shots.speed_mph is 'Always null: single-camera speed is not accurate, so Ask never reads or shows it. public.shots keeps the recorded value.';

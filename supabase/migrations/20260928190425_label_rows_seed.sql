-- The value a label row was seeded with, frozen, so the console can reset an
-- edited row and tell when an edit has been set back (status returns to
-- kept / unchanged). Null on rows the labeller added: they have no seed.
--
-- label_points.seed keys: set_number, game_number, server, serve_side,
--   winner, ending, ended_by.
-- label_shots.seed keys: hitter, stroke, result, contact_x, contact_y,
--   landing_x, landing_y, video_time.
alter table public.label_points
  add column seed jsonb check (seed is null or jsonb_typeof(seed) = 'object');
alter table public.label_shots
  add column seed jsonb check (seed is null or jsonb_typeof(seed) = 'object');

-- Backfill: a row still at its seeded status holds exactly its seed.
-- Edited rows are left null here and backfilled by re-running the seed
-- (scripts/label-backfill-seed.ts).
update public.label_points set seed = jsonb_build_object(
  'set_number', set_number, 'game_number', game_number, 'server', server,
  'serve_side', serve_side, 'winner', winner, 'ending', ending, 'ended_by', ended_by
) where seed is null and (status = 'unchanged' or (status = 'deleted' and status_before_delete = 'unchanged'));

update public.label_shots set seed = jsonb_build_object(
  'hitter', hitter, 'stroke', stroke, 'result', result,
  'contact_x', contact_x, 'contact_y', contact_y,
  'landing_x', landing_x, 'landing_y', landing_y, 'video_time', video_time
) where seed is null and (status = 'kept' or (status = 'deleted' and status_before_delete = 'kept'));

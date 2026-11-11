-- Whether a labelled stroke's stored `result` is a call the labeller chose
-- (the Result menu, a review answer, N or L) rather than the one its ends
-- derive. The console's reading (shot-derived.ts `effectiveShotResult`) lets
-- placed ends outrank a stored call unless it is the labeller's; before this
-- column it could only tell that by the call differing from the seed, so
-- calling Net on a stroke the vendor seeded Net but whose landing reads in
-- changed nothing on screen.
--
-- Not a value field (edit.ts `LABEL_SHOT_VALUE_FIELDS`): it never moves the
-- kept/edited status and is not in `seed`. Writing ends (`positionPatch`)
-- and Reset clear it. false on every existing row keeps today's reading.
--
-- The row-history journal stores `to_jsonb(old)` and `undo_label_op`
-- restores every non-id column, so Undo and Redo cover it with no change.
-- Additive only; label_shots keeps its service-role-writes-only policy, so no
-- grant changes.
alter table public.label_shots
  add column result_called boolean not null default false;

comment on column public.label_shots.result_called is
  'Whether result is the labeller''s own call, which outranks placed ends. Not a value field: it never moves the kept/edited status and is not in seed.';

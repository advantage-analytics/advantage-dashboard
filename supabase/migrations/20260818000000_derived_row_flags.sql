-- Per-row provenance flags for derived points and shots.
--
-- The derivation engine can tell, for many rows, that the vendor's data
-- contradicts itself: a ball called out with the rally continuing past it, two
-- consecutive strokes credited to the same player, a service court that failed
-- to alternate. None of that stops a row being written — the row is still our
-- best reading — but a coach should not see a number built on it presented the
-- same way as one that is clean, and the vendor cannot fix what we do not
-- record.
--
-- An array of short codes rather than a boolean per condition. The catalogue is
-- expected to grow as we learn which contradictions actually predict a wrong
-- statistic, and a migration per code would be friction against exactly that
-- iteration. Same reasoning as processing_jobs.derivation_quality.
--
-- Empty array, not null, is the default: '{}' means "checked, nothing wrong",
-- which is a different claim from "never checked". Imported SwingVision rows
-- carry '{}' because they were never passed through these checks — that is
-- honest, since none of these contradictions can arise in an import.

alter table public.points
  add column if not exists flags jsonb not null default '[]'::jsonb;

alter table public.shots
  add column if not exists flags jsonb not null default '[]'::jsonb;

comment on column public.points.flags is
  'Array of short data-quality flag codes raised by the derivation engine for this point, e.g. ["winner_disputed","service_court_repeat"]. Empty array means checked and clean. Only ever populated for derived = true rows.';

comment on column public.shots.flags is
  'Array of short data-quality flag codes raised by the derivation engine for this shot, e.g. ["out_ball_rally_continued"]. Empty array means checked and clean. Only ever populated for derived = true rows.';

-- Partial GIN indexes: the anticipated query is "show me the flagged rows for
-- this match" during review, which is a containment test over a small minority
-- of rows. Partial on jsonb_array_length keeps the index off the overwhelming
-- majority that are empty.
create index if not exists points_flags_gin
  on public.points using gin (flags)
  where jsonb_array_length(flags) > 0;

create index if not exists shots_flags_gin
  on public.shots using gin (flags)
  where jsonb_array_length(flags) > 0;

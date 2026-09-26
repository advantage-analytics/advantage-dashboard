-- When a scheduled event starts, as a wall-clock time of day.
--
-- Nullable: a dual can be scheduled before anyone knows the start time, and
-- every event saved before this column existed has none. `time` without a
-- zone on purpose — like `starts_on`, it is the local time printed on the
-- schedule, not an instant, so it must not move with the reader's timezone.
--
-- Additive only. The table's existing row-level policies cover the new
-- column; no policy, trigger or view changes.

alter table public.program_events
  add column if not exists starts_at_time time;

comment on column public.program_events.starts_at_time is
  'Local start time of day (no zone). Null when not set.';

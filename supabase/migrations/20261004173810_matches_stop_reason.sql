-- Why a match stopped, as the upload wizard's "Did it end early?" answer gave
-- it. Detail on `result`, never a replacement for it: `result` keeps its
-- "Unfinished"/"Retired" caption exactly as before, and every reader of it is
-- untouched. Nullable text with a check rather than an enum, so a fourth
-- reason later is one drop/add constraint, not a type migration.
--
-- No backfill: rows written before this column have no answer to record.
-- No index, no policy change — the existing `matches` RLS covers it.
--
-- Rollback: alter table public.matches drop column if exists stop_reason;

alter table public.matches add column if not exists stop_reason text check (stop_reason in ('clinched','time_weather','retired'));

comment on column public.matches.stop_reason is
  'Why the match stopped (clinched, time_weather, retired), as answered in the upload wizard. Detail on result, which keeps its "Unfinished"/"Retired" caption unchanged. Null for a decided match and for a SwingVision import.';

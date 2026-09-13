-- Closes the two schema gaps left open by the Phase 1 migrations.
-- Applied live 2026-08-04 as version 20260805005321.

-- ---------------------------------------------------------------------------
-- Gap 1 (spec §3.1): mark rows produced by the derivation engine.
--
-- Every existing row arrived from a SwingVision import, which comes in complete
-- and was never derived — `false` is their true value, not a backfilled guess,
-- so this asserts nothing new about existing match data. New SplitStep rows set
-- it true, which is what lets a reprocess delete exactly what the engine wrote
-- without touching imported data (spec §4.5: re-running derivation is
-- idempotent).
--
-- No index: the only anticipated predicate is `match_id = ? and derived`, and
-- the existing match_id indexes already carry that.
-- ---------------------------------------------------------------------------

alter table public.points add column if not exists derived boolean not null default false;
alter table public.shots  add column if not exists derived boolean not null default false;

comment on column public.points.derived is
  'True when produced by the derivation engine from a vendor stroke stream; false when it arrived from a file import. Lets reprocessing delete only derived rows.';

comment on column public.shots.derived is
  'True when produced by the derivation engine from a vendor stroke stream; false when it arrived from a file import. Lets reprocessing delete only derived rows.';

-- ---------------------------------------------------------------------------
-- Gap 2: add the in-progress twin of `derivation_failed`.
--
-- The constraint shipped with a terminal `derivation_failed` but no matching
-- in-progress value, so a job jumped `processing -> completed` with our own
-- derivation work invisible to the UI. AnalysisStatus in
-- src/lib/data/match-analysis.ts already carries `deriving`; this closes the
-- gap between that union and the database rather than having the code adapt to
-- a database that cannot express the state.
-- ---------------------------------------------------------------------------

alter table public.processing_jobs drop constraint if exists processing_jobs_status_check;

alter table public.processing_jobs add constraint processing_jobs_status_check
  check (status in (
    'pending',
    'uploading',
    'uploaded',
    'submitting',
    'queued',
    'processing',
    'deriving',
    'completed',
    'failed',
    'derivation_failed'
  ));

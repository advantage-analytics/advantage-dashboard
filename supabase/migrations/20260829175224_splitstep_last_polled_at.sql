-- Status-reconciliation stamp.
--
-- Two failure modes are invisible without polling GET /jobs/{id}: JOB_STALE
-- (reported ONLY via the status endpoint, never as a webhook) and a completed
-- job whose delivery was lost (the vendor has no retry policy). Vercel Hobby
-- cron is once per day, so reconciliation runs on the read path, following the
-- reap_stalled_uploads() precedent — and this column is its rate limiter:
-- stamped on EVERY poll attempt, success or failure, so a flapping vendor
-- endpoint cannot be hammered by page loads.

alter table public.processing_jobs
  add column if not exists last_polled_at timestamptz;

comment on column public.processing_jobs.last_polled_at is
  'When the vendor status endpoint was last polled for this job. Stamped on every attempt; a failed poll mutates nothing else. See src/lib/services/splitstep/reconcile.ts.';

-- Resubmission lineage.
--
-- A resubmission is a NEW processing_jobs row, never a status rewind on the
-- old one — splitstep_status_rank() exists specifically to stop jobs moving
-- backwards, and this model works with it instead of against it.
--
-- attempt count = number of rows in the chain (walked via
-- resubmitted_from_job_id), NOT the existing attempt_count column, which
-- counts submit attempts of one row (incremented by api/splitstep/jobs on
-- every POST for that row). Two different axes; both stay.

alter table public.processing_jobs
  add column if not exists resubmitted_from_job_id uuid
    references public.processing_jobs(id) on delete set null,
  add column if not exists auto_resubmitted boolean not null default false;

comment on column public.processing_jobs.resubmitted_from_job_id is
  'Parent job this row was resubmitted from. Chain length = attempt count, ceiling 3, enforced in resubmitJob() — the only writer of this column.';
comment on column public.processing_jobs.auto_resubmitted is
  'True when the system (webhook auto-retry) created this row rather than a user. At most one auto-resubmission per chain.';

-- FK index, matching the repo convention (20260407225458 added the missing
-- FK indexes for match_files for the same reason): the chain walk and the
-- "children of" lookup both filter on this column.
create index if not exists processing_jobs_resubmitted_from_idx
  on public.processing_jobs (resubmitted_from_job_id)
  where resubmitted_from_job_id is not null;

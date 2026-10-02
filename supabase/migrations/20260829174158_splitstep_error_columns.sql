-- Promote the vendor's structured error object to queryable columns.
--
-- job_failed deliveries carry { error: { code, category, step, message, detail } }.
-- Until now only error.message-ish text landed on the row (and in practice the
-- webhook handler stored the TOP-LEVEL message, which the vendor docs say must
-- not be parsed or shown). The retry classifier branches on code/step, the UI
-- shows error.message, and error_code counts over time are the failure ledger.
--
-- error.detail is deliberately NOT promoted: it carries raw internals
-- (e.g. HTTPSConnectionPool strings) and must never reach the UI. It stays
-- available in splitstep_webhook_deliveries.parsed for diagnosis.

alter table public.processing_jobs
  add column if not exists error_code text,
  add column if not exists error_category text,
  add column if not exists error_step text;

comment on column public.processing_jobs.error_code is
  'Vendor error.code from the job_failed webhook (e.g. INTERNAL_ERROR, VIDEO_UNREACHABLE). Machine-readable; the retry classifier branches on this and error_step.';
comment on column public.processing_jobs.error_category is
  'Vendor error.category from the job_failed webhook (e.g. internal, video_quality). Fallback branch axis for unknown codes.';
comment on column public.processing_jobs.error_step is
  'Vendor error.step from the job_failed webhook (e.g. downloading_video). error_step = downloading_video triggers auto-resubmission regardless of error_code — the one real failure so far arrived as INTERNAL_ERROR at this step.';

-- Backfill existing failed rows from the delivery ledger. The latest failed
-- delivery per job wins. error_message is also corrected to error.message
-- (end-user wording per vendor docs) where the structured object exists —
-- the previous value was the unparseable top-level message.
with latest_failed as (
  select distinct on (d.job_id)
    d.job_id,
    d.parsed -> 'error' ->> 'code'     as code,
    d.parsed -> 'error' ->> 'category' as category,
    d.parsed -> 'error' ->> 'step'     as step,
    d.parsed -> 'error' ->> 'message'  as user_message
  from public.splitstep_webhook_deliveries d
  where d.job_id is not null
    and d.parsed -> 'error' is not null
    and (d.event = 'job_failed' or d.parsed ->> 'status' = 'failed')
  order by d.job_id, d.received_at desc
)
update public.processing_jobs j
set error_code     = lf.code,
    error_category = lf.category,
    error_step     = lf.step,
    error_message  = coalesce(lf.user_message, j.error_message)
from latest_failed lf
where j.id = lf.job_id
  and j.status = 'failed';

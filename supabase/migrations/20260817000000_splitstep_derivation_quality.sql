-- Persist the per-job data-quality report the derivation library produces.
--
-- `derivation_confidence` already exists and holds the grade, but a bare
-- 'low' is not actionable: it does not say whether the vendor's ball tracking
-- collapsed, their player tracking did, or their score stream disagreed with
-- itself. Those have different owners and different fixes, and during the
-- pilot the difference is the whole conversation with the vendor.
--
-- Vercel logs are short-retention and are not a record. The same reasoning put
-- `splitstep_webhook_deliveries.raw_body` in the database rather than in logs;
-- this is the same problem one step further down the pipeline.
--
-- jsonb rather than columns-per-check on purpose. The check set is expected to
-- change as we learn what actually predicts a bad job — it already lost a
-- "both players on the same side of the net" check that the parse layer made
-- unreachable — and a migration per revision would be friction against exactly
-- the iteration this is meant to support.

alter table public.processing_jobs
  add column if not exists derivation_quality jsonb;

comment on column public.processing_jobs.derivation_quality is
  'Per-job data-quality report from the derivation library: {grade, checks[{id,label,value,observed,total,verdict}], failures[], warnings[], strokeCount, rallyCount}. The grade is mirrored into derivation_confidence. Null means grading has not run — which is not the same as a clean result.';

-- No index. The anticipated queries are "show me this job" (already by primary
-- key) and pilot-wide roll-ups over a table holding tens of rows, where a scan
-- is cheaper than maintaining a GIN index on a column written once per job.

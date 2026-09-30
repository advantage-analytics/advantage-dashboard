-- One `processing_usage` row per job, enforced by the database (API audit
-- T6 — the second layer under T5's compare-and-set claim).
--
-- `/api/splitstep/jobs` reserves quota after it has claimed the job row
-- (`claimSubmitting()`, T5: `update ... set status = 'submitting' where id =
-- $1 and status = 'uploaded'`). Two POSTs racing for one job are meant to be
-- decided there — the second finds no `uploaded` row and answers 409. But the
-- claim is a row update and the reservation is a separate RPC: before this
-- index nothing in the schema said a job may hold only one reservation, so
-- any path that got past the claim twice — a lost claim write, a future
-- caller that forgets to claim — would insert two rows, and the month's
-- "used" sum (`reserve_processing_quota` sums every unreleased row) would
-- charge the athlete twice for one video. This index is what makes the
-- second insert fail instead: `reserve_processing_quota`,
-- `reserve_individual_quota` and `reserve_individual_pool_quota` all raise
-- SQLSTATE 23505, which `reserveQuota()` (`quota.ts`) surfaces as a thrown
-- Error — T10 maps that to a 409.
--
-- Why no legitimate path inserts twice for one job, checked against the live
-- functions on 2026-09-29 before apply: the three `reserve_*` functions are
-- the only inserters (no trigger, no app-side `.insert()` — src/ and
-- supabase/functions/ only read, update, or delete the table). A refused
-- reservation inserts nothing, so the `uploaded` revert the route does on
-- refusal leads to a first insert later, not a second. A submission that
-- fails after reserving is released (`released = true`) and the job marked
-- `failed`; a failed job cannot be re-claimed (`claimSubmitting()` requires
-- `uploaded`), and every retry — user resubmit, webhook auto-retry, polled
-- failure, orphan-adopted failure — goes through `resubmitJob()`, which
-- creates a CHILD job row and reserves under the child's id. The console path
-- (`admin_reserve_video_quota`) refuses outright when any row exists for the
-- job, released or not, then delegates to `reserve_processing_quota`.
-- `reconcile_processing_quota` and `release_processing_quota` update in
-- place; account deletion deletes by `created_by`.
--
-- Live counts the index was created over, read via the Supabase MCP on
-- 2026-09-29 and re-checked immediately before apply: 6 rows, 6 distinct
-- `job_id`s, 0 rows with a null `job_id`, and
-- `select job_id, count(*) ... having count(*) > 1` returned nothing.
-- Existing indexes were the pkey, non-unique btrees on `created_by` and
-- `job_id`, and the two `(account_id, account_type, billing_month)` btrees,
-- so the unique index creates cleanly with nothing to repair. Had any job
-- carried two rows the apply would have been blocked and the job named —
-- never a row deleted to make the index fit.
--
-- Partial on `job_id is not null`: the column is `not null` in the live
-- schema today (`20260802083544_splitstep_ingest.sql`), so the predicate is
-- currently vacuous. It is stated anyway because it is the rule the index
-- enforces — the same shape as `processing_jobs_external_job_id_key` and
-- `match_files_one_per_match` — and it keeps the index correct should the
-- column ever be relaxed (the admin loaders already treat it as nullable:
-- `admin-team-server.ts` joins by hand "because `processing_usage.job_id` is
-- nullable"). `if not exists` so a re-run is a no-op rather than an error.
-- Not `concurrently`: 6 rows, and the MCP applies inside a transaction where
-- `concurrently` is not allowed; the share lock is momentary.
--
-- Applied to the live database via the Supabase MCP as
-- `processing_usage_job_id_unique`; this file carries the version the live
-- project recorded on apply.

create unique index if not exists processing_usage_job_id_key on public.processing_usage (job_id) where job_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  select indexdef into v_def
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'processing_usage'
     and indexname = 'processing_usage_job_id_key';

  if v_def is null then
    raise exception 'processing_usage_job_id_key: index is missing';
  end if;

  if v_def not like 'CREATE UNIQUE INDEX %' then
    raise exception 'processing_usage_job_id_key: not unique (%)', v_def;
  end if;

  if v_def not like '% WHERE (job_id IS NOT NULL)' then
    raise exception 'processing_usage_job_id_key: predicate is not (job_id IS NOT NULL) (%)', v_def;
  end if;
end
$$;

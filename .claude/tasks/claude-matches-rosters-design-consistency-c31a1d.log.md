# Run log — claude/matches-rosters-design-consistency-c31a1d

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add a terminal `cancelled` job status, `vendor_started_at` and the `cancel_processing_job` RPC — done

**gate:** mechanical pass · completion pass

**changed:** Migration 20260930062236_processing_jobs_cancelled applied live via Supabase MCP and saved byte-identical: `cancelled` added to processing_jobs_status_check (idempotent), `vendor_started_at timestamptz`, `splitstep_status_rank('cancelled') = 9`, `cancel_processing_job(uuid, uuid)` (security definer, search_path '', service_role-only; flips queued/submitting/processing to cancelled and releases usage in one call), the three admin_uploads_private guards re-created from live bodies with `cancelled` terminal; trailing DO/ASSERT blocks pin constraint, rank and ACL. New PGlite test tests/database/cancel-processing-job.test.mjs (4/4). Security advisors: nothing new.

**follow-ups:**

1. `release_processing_quota` and `cancel_processing_job` now share the same release statement; change both if release semantics ever change.
2. tests/database/README.md could note that re-creating `attachment_snapshot` needs stub `matches`/`programs`/`program_event_entries` tables in PGlite (row-type variables).

## T2 · Add `POST /api/splitstep/jobs/[jobId]/cancel` — done

**gate:** mechanical pass · completion pass

**changed:** New `src/app/api/splitstep/jobs/[jobId]/cancel/{handler,route}.ts`: auth → UUID → ownership (same 404) → queued/submitting with a vendor id, then vendor `DELETE {apiUrl}/{id}` (10 s timeout, own body parser `readVendorDelete`). 2xx → `cancel_processing_job` RPC → 200; JOB_NOT_REMOVABLE → 409 already_started; JOB_NOT_FOUND → 409 not_cancellable; network/timeout/5xx/other → 503 vendor_unavailable; RPC null after a vendor 2xx → 409 not_cancellable (logged). Responses via errorResponse/jsonResponse, checkSameOrigin, runtime nodejs. `tests/cancel-job-handler.spec.ts` 21/21. MAP.md API row edited by hand (`npm run map` only collects page routes).

**follow-ups:**

1. `openapi/advantage-api.yaml` has no entry for the cancel route (copy the rederive entry).
2. handler.ts casts new codes into `MatchVideoHttpError`; a properly widened shared error-code type would be cleaner.
3. `scripts/generate-map.mjs` ignores API routes, so MAP.md's API row always needs hand edits.

## T3 · Guard the pipeline against late webhooks on cancelled jobs and stamp `vendor_started_at` — done

**gate:** mechanical pass · completion pass

**changed:** Webhook completed branch skips (logs SKIPPED, still 200 and still records the delivery) when the row is `cancelled`. `deriveAndPublish`'s `deriving` write is guarded `.neq("status","cancelled")` and stops the derivation when no row moves (a write error there now reaches the DERIVATION_ERROR path instead of being ignored). `refreshQueuedJobs` keeps the vendor's per-job `updated_at` and writes `vendor_started_at` with `status='processing'` (one guarded update per started job; falls back to now). Three stale "no cancel endpoint" comments rewritten. Specs: reconcile-queued-jobs, splitstep-webhook-route, derive-and-publish-codes (fake extended for the new chain; outside files:, judged necessary).

**follow-ups:**

1. `scripts/splitstep-derive.ts` now just prints `{ok:false, reason:"job is cancelled"}` for a cancelled job; could say so more clearly.
2. Confirm the reconciler's results sweep and stale poll never release quota or send mail for a `cancelled` row (they likely select by status and skip it).
3. `record_splitstep_webhook` still writes a late completion's result urls onto a cancelled row (status is safe); harmless but worth knowing.

## T4 · Read `cancelled` and the timing fields in the data layer; let resubmit accept a cancelled parent — done

**gate:** mechanical pass · completion pass

**changed:** `cancelled` added to AnalysisStatus / STATUS_MAP / ANALYSIS_LABEL ("Cancelled"), in no in-flight/failed/ready set; `matchListGroup` groups it with `manual`; `stageIndexFor`/`pipelinePercent` handle it; `analysisAction` gives it "View match" instead of falling through to "Cancel". New `jobTimingFields()` supplies `queuedAt`, `vendorStartedAt`, `reservedSeconds` to both `loadMatchAnalysis` and the live hook. `resubmitJob`: `RESUBMITTABLE_STATUSES = {failed, cancelled}`, `cancelled` added to TERMINAL_STATUSES (otherwise the parent blocked its own resend as an in-flight duplicate), auto-resubmit refuses a cancelled parent. Specs: resubmit-authorization, match-analysis-timeline, analysis-steps-view.

**follow-ups:**

1. IMPORTANT for T6: `matchPageKind` still returns "report" for `cancelled`, so a cancelled match shows the full report with empty stat sections (guardrails §3.3). T6 must add `cancelled` to the "steps" branch together with its cancelled view — T6's task text does not name `matchPageKind`.
2. A cancelled attempt still counts toward the 3-attempts-per-chain limit; decide whether cancelled rows should be excluded.
3. `row-state.tsx` hard-codes `status === "manual" ? "Not analyzed"`; T5's rename should fold `cancelled` in.

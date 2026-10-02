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

## T5 · Rename "No video" to "Not analyzed" and lead every list row with a StepMark — blocked

**gate:** mechanical FAIL (completion review not run)

**reason:** `tests/schedule-dual-outcomes.spec.ts:230` ("an in-progress dual counts what is decided and asks for a result") fails deterministically (re-run alone: 1 failed / 12 passed). At line 260 it expects `line(page, "S2").getByText("Imported", { exact: true })`; `RowLifecycle` now gives Imported a `done` StepMark whose sr-only "Done:" sits inside the same `AnalysisStatusLine` span, so the element's text is "Done:Imported" and the exact match finds nothing. Fix on retry: render the mark's sr-only prefix outside the word's text node (e.g. wrap the word in its own span) or update that spec to match the word element; also re-run schedule-dual-outcomes and tournament-detail specs, which render RowLifecycle via `dual-detail.tsx`/`tournament-detail.tsx`.

**stash:** 85980803a8bf6fb8b0b31d69754004de11f6f2e5

**follow-ups:**

1. Old `?analysis=No+video` bookmarks now match no group (the grep criterion forbids an alias).
2. The help page's `ANALYSIS_JOURNEY` could add rows for Cancelled and Not analyzed.

## T6 · Stepper timing, the quiet Cancel group and the cancelled view — done

**gate:** mechanical pass · completion pass

**changed:** `analysisStepsView`: queued/processing timing lines, `cancel`/`resend` on note bodies, new cancelled view (stopped step, note, "Cancelled N min ago · 1h 29m returned", "Send for analysis again"); drawer strips them. `analysis-steps-column.tsx`: clock covers queued/processing/cancelled, 11px timing line, `QuietAction` text buttons (Cancel red hover, resend blue hover, consequence line via aria-describedby), optional `onCancel`/`onResend`. `matchPageKind` sends `cancelled` to the steps view (from T4's follow-up; guardrails §3.3 note added). New shared `formatDuration` (used by `formatEta`), `STEPPER_COPY.aboutAnHour` with its basis. StepState `stopped` added (T5 will rebase onto it). Design preview gains a cancelled board. Runner note: the dispatch prompt carried a literal `TASKBLOCK` placeholder; the worker read T6 from the queue file, and the reviewer judged against the real block.

**follow-ups:**

1. On a live page the clock starts empty (existing spec pins one Date.now from the interval), so for the first ~10 s the timing line shows only its clock-free half ("Takes about an hour once it starts").
2. "Cancelled N min ago" is measured from `updatedAt`, assuming the cancel is the row's last write.
3. T5 retry must reconcile with the `stopped` state added here (LABEL_INK.stopped = ink-900, INK.stopped = ink-500).

## T7 · Wire "Cancel analysis" to the route through `CancelAnalysisDialog` — blocked

**gate:** mechanical FAIL (completion review not run)

**reason:** `tests/uploading-progress-parity.spec.ts` (3 of 4 tests) fails deterministically with "invariant expected app router to be mounted": `analysis-steps-column.tsx` now calls `useRouter()` from `next/navigation` at the top of the column, and that spec renders the column without stubbing `next/navigation`. Fix on retry: move `useRouter()` into the components that actually need it (the dialog and the resend action) so the column renders router-free, or add a `next/navigation` stub to `uploading-progress-parity.spec.ts` (the column spec already stubs it). Re-run uploading-progress-parity, analysis-steps-pending and match-page specs that render the column.

**stash:** 855addb53c86e5d3d870de8d4b345a74f51c3788

**follow-ups:**

1. `/design` preview passes no handlers, so its boards now use real wiring (hits a placeholder job id); pass no-op handlers there.
2. "Sending…" could move into `STEPPER_COPY`.
3. Resend is a quiet text action rather than reusing the bordered `RetryAnalysis`; same request and refusal handling.

## T5 · Rename "No video" to "Not analyzed" and lead every list row with a StepMark — done

**gate:** mechanical pass · completion pass

**changed:** Retry of the blocked run: stash 85980803 applied (conflicts with T6's `stopped` resolved to one definition) and dropped. `matchListGroup` and `ANALYSIS_GROUP_ORDER` (so the Filter menu and `?analysis=`) use "Not analyzed" for manual + cancelled. StepState `none` (solid `--ink-200` ring, sr-only "Not analyzed:"). `RowLifecycle`: every row leads with a mark (Cancelled stopped; Not analyzed / Stats unavailable none; Imported / Timeline ready / Analyzed done; Failed fail). Gate fix: `AnalysisStatusLine` wraps the word in its own span so a mark's sr-only prefix is not in the word's text (schedule-dual-outcomes passes unchanged). New tests/matches-row-state.spec.ts; grouping spec covers cancelled.

**follow-ups:**

1. Old `?analysis=No+video` bookmarks now filter to zero rows and show a stale chip; a legacy alias would need an exception to T5's grep rule.

## T7 · Wire "Cancel analysis" to the route through `CancelAnalysisDialog` — done

**gate:** mechanical pass · completion pass

**changed:** Retry of the blocked run: stash 855addb5 applied cleanly and dropped. New `cancel-analysis-dialog.tsx` (`CancelAnalysisConfirm` view, `CancelAnalysisDialog` with router + async cancel, `requestCancel`/`requestResubmit` helpers): danger ConfirmDialog, exact copy, Clock note with the reserved duration, route refusal shown in-dialog, 200 closes and refreshes. Gate fix: `AnalysisSteps` no longer calls `useRouter()`; the dialog mounts on first open, resend lives in a `ResendAction` component, so the column renders without an app router (uploading-progress-parity unchanged and passing; full offline suite 4512 passed in the worker's run). Design preview passes no-op handlers. Specs: cancel-analysis-dialog (new), analysis-steps-column.

**follow-ups:**

1. "Cancel opens the dialog" is only checked by source assertion; eyes-on at /pr-check should confirm the click, the dialog and the refresh on a queued match.

## T8 · Ask before cancelling an upload — done

**gate:** mechanical pass · completion pass

**changed:** `UploadMatchSuccess.tsx`: the upload Cancel opens `CancelUploadControl`, a synchronous danger ConfirmDialog ("Cancel this upload?", the stays-saved prose, a Clock note "No analysis time has been used…", "Cancel upload" / "Keep uploading"); confirm calls `upload.cancel()`; the control renders only while `upload.cancel` exists, so the dialog unmounts when the upload ends. Meta line reads "… · About 6 min left" via a call-site `sentenceCase` (formatEta unchanged). tests/upload-success-actions.spec.ts extended.

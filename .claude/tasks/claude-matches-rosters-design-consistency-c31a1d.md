# Tasks — claude/matches-rosters-design-consistency-c31a1d

> Scope: one analysis-status vocabulary across Matches, Roster and the steppers; cancel a queued analysis (vendor DELETE) with "Send for analysis again"; upload-cancel confirm; stepper timing. Plan: ~/.claude/plans/artifact-view-context-artifact-0e73c2f1-elegant-mochi.md · Canvas: https://claude.ai/artifact/2nWTUVKjComMwH4Wb1QJRV (boards 4–6)

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Add a terminal `cancelled` job status, `vendor_started_at` and the `cancel_processing_job` RPC

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_processing_jobs_cancelled.sql (new, named by the version `apply_migration` records), tests/database/cancel-processing-job.test.mjs (new, PGlite under `npm run test:database`)
- **done when:**
  - [ ] The migration re-creates `processing_jobs_status_check` in an idempotent DO block whose list includes `'cancelled'`, adds `vendor_started_at timestamptz` with `add column if not exists`, and `CREATE OR REPLACE`s `splitstep_status_rank` so `'cancelled'` returns 9 (above every other status)
  - [ ] The migration defines `public.cancel_processing_job(p_job_id uuid, p_user_id uuid) returns text` as `security definer` with `set search_path = ''`, whose body is one `update processing_jobs set status='cancelled', completed_at=now(), error_code='CANCELLED' where id=p_job_id and created_by=p_user_id and status in ('submitting','queued','processing') returning status`, followed (only when a row was updated) by `update processing_usage set released=true where job_id=p_job_id and released=false`; grants are `revoke execute … from public, anon, authenticated` then `grant execute … to service_role`
  - [ ] The migration `CREATE OR REPLACE`s `admin_uploads_private.attachment_snapshot`, `admin_uploads_private.preserve_video_entry` and `admin_uploads_private.preserve_video_result` with their live bodies (copied from `pg_get_functiondef` via `execute_sql`, not from the repo) where every `not in ('failed','completed','derivation_failed')` also lists `'cancelled'`
  - [ ] `tests/database/cancel-processing-job.test.mjs` runs the RPC against minimal `processing_jobs`/`processing_usage` tables and asserts: a queued job owned by the caller returns `'cancelled'` and its usage row flips to `released=true`; another user's job returns null and its usage stays `released=false`; a `completed` job returns null
  - [ ] The migration file is named by the version `list_migrations` reports and ends with `DO $$ … ASSERT …` blocks that fail the migration unless the status constraint includes `'cancelled'`, `splitstep_status_rank('cancelled') = 9`, and `cancel_processing_job`'s ACL grants execute to `service_role` only
- **notes:** Apply live with the Supabase MCP `apply_migration` first, then save the file under the live version. Run `get_advisors` (security) afterwards and fix anything the RPC introduces. `processing` is accepted in the status list because the vendor is the authority (the route only calls this after the vendor DELETE succeeded). Read `supabase-postgres-best-practices` before writing DDL. Plan §T1.

## T2 · Add `POST /api/splitstep/jobs/[jobId]/cancel`

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/app/api/splitstep/jobs/[jobId]/cancel/handler.ts (new), src/app/api/splitstep/jobs/[jobId]/cancel/route.ts (new), tests/cancel-job-handler.spec.ts (new), MAP.md (regenerated)
- **done when:**
  - [ ] `handler.ts` exports `handleCancelJob(jobId, deps)` with deps `{ currentUserId, loadJob, deleteAtVendor, markCancelled }`, checked in this order: no user → 401; non-UUID → 404; missing job or `created_by !== user` → the same 404; status not in `submitting|queued` or no `external_job_id` → 409 `already_started`
  - [ ] Vendor outcomes map exactly: 2xx → `markCancelled` then 200 `{ status: "cancelled" }`; 409 `JOB_NOT_REMOVABLE` → 409 `already_started` with error "It started a moment ago and can't be cancelled now."; 404 `JOB_NOT_FOUND` → 409 `not_cancellable` (logged); network error, 5xx or 10 s timeout → 503 `vendor_unavailable` with "Couldn't reach Advantage Intelligence. Try again."
  - [ ] Every refusal goes through `errorResponse()`/`jsonResponse()` from `src/lib/services/match-video/http.ts`; `route.ts` applies `checkSameOrigin`, sets `export const runtime = "nodejs"`, builds the vendor URL as `${apiUrl.replace(/\/$/,"")}/${encodeURIComponent(externalJobId)}` with the `X-Api-Key` header from `resolveSplitstepVendorApiConfig()`, parses the DELETE body itself (not via `parseWebhookPayload`), and calls the `cancel_processing_job` RPC through the admin client as `markCancelled`
  - [ ] `tests/cancel-job-handler.spec.ts` (seam-call log, modelled on `tests/rederive-handler.spec.ts`) covers 401, the foreign-job 404, the wrong-status 409, each of the four vendor rows, and asserts `markCancelled` is never called unless the vendor answered 2xx
  - [ ] MAP.md's route table lists the new route (`npm run map` output committed)
- **notes:** Copy the rederive split (`rederive/{route,handler}.ts`). Vendor contract: `DELETE {SPLITSTEP_API_URL}/{job_id}` while queued; 409 `JOB_NOT_REMOVABLE` once processing (api-docs "Removing a Queued Job"). Plan §T2.

## T3 · Guard the pipeline against late webhooks on cancelled jobs and stamp `vendor_started_at`

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/app/api/webhooks/splitstep/route.ts, src/lib/services/splitstep/derive-and-publish.ts, src/lib/services/splitstep/reconcile.ts, src/lib/services/splitstep/adopt-deliveries.ts, src/lib/data/match-analysis.ts (comment at ~950), tests/reconcile-queued-jobs.spec.ts, tests/splitstep-webhook-route.spec.ts
- **done when:**
  - [ ] The webhook's completed branch returns 200 without securing results or deriving when the loaded row's status is `cancelled`, and logs that it skipped
  - [ ] `deriveAndPublish`'s `status: "deriving"` write carries a status guard (`.neq("status","cancelled")` or an `.in(...)` of the statuses it may move from) so a cancelled row is never moved to `deriving`
  - [ ] `refreshQueuedJobs` writes `vendor_started_at` (from the vendor's per-job `updated_at`) in the same update that sets `status='processing'`
  - [ ] The three stale "no vendor cancel endpoint" comments (`webhooks/splitstep/route.ts` ~443, `adopt-deliveries.ts` ~21, `match-analysis.ts` ~950) are rewritten to describe the queued-only DELETE
  - [ ] `tests/reconcile-queued-jobs.spec.ts` asserts the `vendor_started_at` stamp, and `tests/splitstep-webhook-route.spec.ts` (or `derive-and-publish-codes.spec.ts`) has a case where a `cancelled` row receives `job_completed` and no derive/secure seam is called
- **notes:** Plan §T3. Line numbers are from the plan and may have drifted; grep for the comment text.

## T4 · Read `cancelled` and the timing fields in the data layer; let resubmit accept a cancelled parent

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/data/match-analysis.ts, src/lib/data/match-analysis-server.ts, src/hooks/use-live-match-analysis.ts, src/lib/services/splitstep/resubmit-job.ts, tests/analysis-steps-view.spec.ts, tests/resubmit-authorization.spec.ts, tests/match-analysis-timeline.spec.ts (guess)
- **done when:**
  - [ ] `AnalysisStatus` and `STATUS_MAP` include `cancelled`, `ANALYSIS_LABEL.cancelled === "Cancelled"`, and `cancelled` is in none of the in-flight, failed or ready predicates/sets; `matchListGroup` returns the same group as `manual` for it (never "Ready")
  - [ ] `MatchAnalysis` gains `queuedAt` (`queued_ack_at ?? submitted_at`), `vendorStartedAt` and `reservedSeconds` (`billable_seconds`); the server loader's select list and mapping and the live hook's `LiveJobRow`/`LiveAnalysisPatch` projection both populate them
  - [ ] `resubmitJob`'s `TERMINAL_STATUSES` (or its parent check) accepts a `cancelled` parent as well as `failed`, and the doc comment names the "Send for analysis again" path
  - [ ] `tests/resubmit-authorization.spec.ts` has a resubmit-from-cancelled case that reserves time anew, and the match-analysis / analysis-steps specs assert the new status maps and the three new fields
- **notes:** Plan §T4, data half only — the list label rename and row marks are T5. Add a `cancelled` entry to any exhaustive `Record<AnalysisStatus, …>` so typecheck passes.

## T5 · Rename "No video" to "Not analyzed" and lead every list row with a StepMark

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** src/lib/data/match-analysis.ts (matchListGroup), src/components/dashboard/matches/matches-page-content.tsx (ANALYSIS_GROUP_ORDER + Filter menu), src/components/dashboard/matches/row-state.tsx, src/components/dashboard/shared/vertical-steps.tsx (StepState), src/components/dashboard/shared/analysis-status-line.tsx, tests/matches-list-grouping.spec.ts, tests/match-film-entry.spec.ts (guess)
- **routes:** /dashboard/matches, /dashboard/team/matches
- **done when:**
  - [ ] No source or test file under src/ or tests/ still contains the list group label "No video" (grep is empty; the film empty-state "No video for this match" and H2H "No video attached" are unrelated and stay); `matchListGroup` returns "Not analyzed" for `manual` and `cancelled`, and `ANALYSIS_GROUP_ORDER`, the Filter menu and any persisted saved-view/URL value use the new label
  - [ ] `StepState` gains `stopped` (`--ink-100` fill, `--ink-600` x glyph — the Failed chip's shape in grey) and `none` (thin solid `--ink-200` ring), rendered by the shared mark component
  - [ ] `row-state.tsx` leads every lifecycle row with a mark: Cancelled = `stopped`; Not analyzed and Stats unavailable = `none`; Imported and Timeline ready = `done`; Failed keeps `fail`; the words stay ink-500
  - [ ] `tests/matches-list-grouping.spec.ts` asserts a `cancelled` match lands in "Not analyzed" alongside a `manual` one and never in "Ready", and a row-state spec asserts the mark state per lifecycle word
- **notes:** Plan §T4 (list-UI half), decisions 2026-09-30 (board 6d). Design system: read `.skills/advantage-analytics-design/SKILL.md` first. Do not touch the drawer or the stepper here.

## T6 · Stepper timing, the quiet Cancel group and the cancelled view

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** src/components/dashboard/matches/match-detail/analysis-steps.ts, src/components/dashboard/matches/match-detail/analysis-steps-column.tsx, src/lib/data/match-analysis-server.ts (formatWindow, if exported/moved), src/app/design/analysis-steps-preview.tsx, tests/analysis-steps-view.spec.ts, tests/analysis-steps-column.spec.ts
- **routes:** /dashboard/matches/[matchId] (a queued match, a processing match, a cancelled match)
- **done when:**
  - [ ] `analysisStepsView` gives the queued body `meta` "Waiting N min · Takes about an hour once it starts" and `cancel: { reservedSeconds }`, the processing body `meta` "Started N min ago · Usually done in about an hour", and a new `cancelled` view: title "Analysis cancelled", Match saved and Video uploaded as `done`, an analysis step in state `stopped` labelled "Analysis cancelled" with note "Your video is still stored. Nothing was charged.", meta "Cancelled N min ago · 1h 29m returned", and a resend action "Send for analysis again" with the line "Uses about 1h 29m of this month's analysis time"; `drawerAnalysisStepsView` strips `cancel` and the resend action
  - [ ] `analysis-steps-column.tsx` extends `readsClock` to queued, processing and cancelled; renders `meta` as 11px `--ink-400` tabular 8 px under the status note; renders the Cancel group 20 px below as a text action "Cancel analysis" (12/500 `--ink-700`, red on hover, no button, no grey box) with "1h 29m goes back to this month's analysis time" 8 px under it (11px `--ink-400`, linked by `aria-describedby`); the resend action is the same layout with blue on hover and fires `onResend` with no confirm
  - [ ] Elapsed values use `formatEta`-style whole minutes, durations format as "1h 29m" (reuse/extend `formatWindow`), "about an hour" is a `STEPPER_COPY` constant whose comment records the basis (6 completed jobs took 45–80 min for 86–124 min of video), and every meta segment is sentence case (capital after each ·)
  - [ ] `tests/analysis-steps-view.spec.ts` covers the queued and processing bodies, the cancelled view and the drawer strip; `tests/analysis-steps-column.spec.ts` renders the meta line and the Cancel group with a fixed `snapshotAt`, and asserts no Cancel group on processing; `analysis-steps-preview.tsx` shows the queued, processing and cancelled boards
- **notes:** Plan §T5 minus the dialog (T7). Cancel/resend are props (`onCancel`, `onResend`) here — T7 wires them. Cancel appears only in the match page stepper, not the wizard or the drawer. Memory `feedback_stepper_quiet_actions`. Canvas boards 4 and 6a: https://claude.ai/artifact/2nWTUVKjComMwH4Wb1QJRV.

## T7 · Wire "Cancel analysis" to the route through `CancelAnalysisDialog`

- **status:** todo
- **model:** opus
- **needs:** T2, T6
- **files:** src/components/dashboard/matches/match-detail/cancel-analysis-dialog.tsx (new), src/components/dashboard/matches/match-detail/analysis-steps-column.tsx (or its client wrapper), tests/cancel-analysis-dialog.spec.ts (new), tests/analysis-steps-column.spec.ts
- **routes:** /dashboard/matches/[matchId] (a queued match)
- **done when:**
  - [ ] `CancelAnalysisDialog` is a `ConfirmDialog` with `tone="danger"` (pattern from `delete-match-dialog.tsx`: async, `pending`, `error`, `router.refresh()`), titled "Cancel this analysis?", prose "It hasn't started yet. The video stays saved, and you can send it for analysis again from the match page.", a `ConfirmNote` with the lucide `Clock` icon reading "**1h 29m** goes back to this month's analysis time." (duration from `reservedSeconds`), and buttons `confirmLabel` "Cancel analysis" / `cancelLabel` "Keep in line" / `pendingLabel` "Cancelling…"
  - [ ] Confirm POSTs `/api/splitstep/jobs/<jobId>/cancel` (same-origin fetch); a 409 or 503 shows the route's `error` sentence through the dialog's `error` prop and keeps the dialog open; 200 closes it and refreshes
  - [ ] The stepper's "Cancel analysis" action opens the dialog and "Send for analysis again" calls the existing resubmit route directly with no confirm
  - [ ] Specs assert the dialog copy and labels, the 409 error path, and that the stepper column's queued body renders the action that opens the dialog
- **notes:** Plan §T5 (dialog part). Offline component specs: see memory `reference_offline_component_specs` (vm-modules loader). Uploader-only is enforced server-side (T2); the client does not hide the action by role.

## T8 · Ask before cancelling an upload

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx, tests/upload-success-actions.spec.ts
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] The upload Cancel action opens a synchronous `ConfirmDialog` (tone danger, pattern from `StartOverDialog.tsx`) titled "Cancel this upload?" with prose "The match stays saved with its score. Only the video stops, and you can add it again later from the match page." and a `ConfirmNote` with the lucide `Clock` icon "No analysis time has been used. It's only counted once the video is sent."; buttons read "Cancel upload" / "Keep uploading"
  - [ ] Confirm calls `upload.cancel()`; when `upload.cancel` becomes undefined while the dialog is open (upload finished), the dialog closes itself
  - [ ] The upload meta line is sentence case per segment ("612 MB of 1.8 GB · About 6 min left")
  - [ ] `tests/upload-success-actions.spec.ts` asserts the dialog wraps cancel and that the title, prose, note and both button labels are present
- **notes:** Plan §T6 (board 5, dialog A). Independent of T1–T7.

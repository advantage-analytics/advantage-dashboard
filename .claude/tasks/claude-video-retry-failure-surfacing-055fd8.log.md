# Run log — claude/video-retry-failure-surfacing-055fd8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Sync onto splitstep-integration once both dependency branches have merged — done

**gate:** mechanical pass (first run failed only on stale `node_modules` missing `@electric-sql/pglite`/`pg`; `npm ci` then GATE PASS) · completion pass
**changed:** Merged `origin/splitstep-integration` (f473ce0b, carrying PRs #289 advantage-intelligence-ui and #290 match-analysis-failure-retry) into this branch with no conflicts. `isInputRejected`, `liveAnalysisPatch`, `ANALYSIS_FAILURE_COPY.failed.inputRejected` and the `input_rejected` refusal are present with the names T2+ were written against; no task needs amending.
**follow-ups:**

1. `check.sh preflight` only installs when `node_modules` is missing, so a merge that adds dependencies fails the gate on a stale install; preflight could compare the lockfile hash.
2. PR #290 now refuses videos averaging under 29.97 fps (commits 87b8f3a7, ab9831af) instead of the "warn, never block" recorded in this feature's design — confirm it was intended.

## T2 · Add the pure recovery classifier beside isInputRejected — done

**gate:** mechanical pass · completion pass
**changed:** `match-analysis.ts` gains `RecoveryClass`, `RecoveryInput`, `classifyFailure()` (six rules in the design's order; the attempt ceiling also downgrades a download-failure retry) and `showsStoredNote()`. `isDownloadFailure` and `MAX_TOTAL_ATTEMPTS` moved there from `resubmit-job.ts`, which imports and re-exports them, so the webhook route, `reconcile.ts` and `jobs/route.ts` are untouched. The spec adds the ten live rows, the edge cases, null cases and a `showsStoredNote` table.
**follow-ups:**

1. `MAX_TOTAL_ATTEMPTS`'s comment still says "Enforced here and nowhere else"; after the move "here" means `match-analysis.ts`, while enforcement stays in `resubmitJob()` — reword.
2. `showsStoredNote("")` returns true under the literal rule; decide whether an empty code should count as no code.

## T3 · Carry recovery, note and attemptsUsed through the loader, live hook and schedule data — done

**gate:** mechanical pass · completion pass
**changed:** `loadMatchAnalysis` selects the error, key and chain columns, maps the storage keys to `hasVideo`/`hasResults` and computes `attemptsUsed` with the new pure `chainAttempts()`. `jobRecoveryFacts()` + `recoveryFields()` in `match-analysis.ts` are the one path both the loader and `liveAnalysisPatch` use to set `recovery` and `note`; `withLiveAnalysis` bumps `attemptsUsed` for a newly observed resubmitted job and recomputes. `EntryMatch` carries `recovery` and `note`. `inputRejected` and `failNote` unchanged.
**follow-ups:**

1. A stalled `uploaded` row's class is decided at load or on a live event; a page left open past the 3-minute stall threshold won't switch until one happens — surfaces may want a timer recheck of `isSubmitStalled`.
2. `withLiveAnalysis` adds at most one attempt per live row, so two resubmissions seen live in one session undercount by one until reload.
3. The live patch still doesn't update `jobId`/`updatedAt`, so a retry from a live-observed new job acts on the page-load job id.

## T4 · Key ANALYSIS_FAILURE_COPY by recovery class — done

**gate:** mechanical pass · completion pass
**changed:** `analysis-failure-copy.ts` exports `byClass` (typed `Record<RecoveryClass, RecoveryCopy>`); `retry`, `fix_recording` and `stats_unavailable` reference the existing `failed.*` / `failed.inputRejected` / `derivation_failed` strings by property access. New `upload_again` and `rederive` copy, plus `WAIT_OR_ASK_VARIANTS` (allowance / permission / ceiling) and a pure `waitOrAskVariant(errorCode, attemptsUsed)`. Spec adds the class-coverage, banned-string and no-"Retrying" checks; old keys untouched.
**follow-ups:**

1. `byClass.wait_or_ask` is only the allowance default — surfaces (T6, T7, T19) must pick the variant through `waitOrAskVariant()` + `WAIT_OR_ASK_VARIANTS`, not read `byClass.wait_or_ask` directly.

## T5 · Add the RecoveryAction component — done

**gate:** mechanical pass · completion pass (widget-states: action control, no data region; loading = RetryActionButton's pending label; `return null` kept for classes with no action)
**changed:** New `match-detail/recovery-action.tsx`: `retry` → `RetrySubmission` (stalled) or `RetryAnalysis` (failed, `/resubmit`); `rederive` → `RetryActionButton` on `/rederive`; `upload_again` / `fix_recording` → `advButton()` link to `addVideoHref(matchId)` (primary sm on the card, outline md in a drawer); other classes render nothing. Labels come from `byClass`. `tests/recovery-action.spec.ts` covers each class (8 tests).
**follow-ups:**

1. The `drawer` variant has no caller until T7; its outline/md styling mirrors `match-drawer.tsx`'s `RetryButton` and is unverified in a real drawer, while `retry` in a drawer still renders the card-sized `RetryAnalysis` — T7 should check both.

## T6 · Match page progress card renders the recovery class — done

**gate:** mechanical pass · completion pass (widget-states: only the failed/stalled branches changed; loading, in-flight and milestone states untouched)
**changed:** `match-analysis-progress.tsx`'s failed block and stalled branch render the class copy (`note ?? title`, card body; `wait_or_ask` picks its variant through `waitOrAskVariant`) and `<RecoveryAction variant="card">`; the raw `failNote` is no longer rendered and the direct `RetryAnalysis`/`RetrySubmission`/`addVideoHref`/`inputRejected` usages are gone. A stalled uncoded row keeps the "hasn't been sent" wording (local `STALLED_RETRY_COPY`). Minimal additive change outside `files:`: `MatchAnalysis.errorCode`, set in the shared `recoveryFields()`, plus its live-patch type line and one spec assertion. Two old assertions flipped by design: the derivation reconciler note is now absent, and a `retry` row no longer also shows "Upload a new recording" (one action per class).
**follow-ups:**

1. `waitOrAskVariant` picks by error code alone; a failed row at the attempt ceiling that carried a quota/eligibility code would get allowance/permission copy — check `attemptsUsed >= MAX_TOTAL_ATTEMPTS` first.
2. `STALLED_RETRY_COPY` lives in the card; move it into `analysis-failure-copy.ts` if T7's drawers need the same wording.
3. Eyes-on: confirm on screen that a `retry` card losing its secondary "Upload a new recording" link reads right.

## T7 · Drawers render the recovery class through RecoveryAction — blocked

**gate:** mechanical FAIL (`tests/schedule-dual-outcomes.spec.ts:469` "a failed analysis shows its note and offers Retry to a coach only") · completion not run
**reason:** The change contradicts deliberate schedule-drawer behaviour pinned by that spec (T23 "footer follows the Matches drawer"): (1) the event drawer's Retry is the footer's blue primary button labelled "Retry" — `RecoveryAction` renders an outline "Retry analysis"; (2) a coach sees the job note "The video ended before the match did" — the fixture row is uncoded, so the new `showsStoredNote` rule hides it; (3) a viewer who can't edit sees only "The match page has the details.", no note, no retry promise — the task's "one body for every viewer, note whenever the class shows one" shows the retry body to everyone. Needs an author decision on which rule wins before re-running.
**stash:** 7fceca0f51e51ceb576021c6cef67184b6b42827

## T8 · Matches list row action follows the recovery class — done

**gate:** mechanical pass · completion pass
**changed:** `analysisAction()` branches on `analysis.recovery` for failed rows: `upload_again`/`fix_recording` → "Add video", `retry`/`rederive`/`wait_or_ask` → "View match", `stats_unavailable` → "View stats"; a failed row without `recovery` keeps "Start over". Two small helpers (`addVideoAction`, `viewMatchAction`) reuse the existing action shapes. No existing spec pinned `analysisAction`. Spec adds per-class assertions and the no-"Start over"-with-video check.
**follow-ups:**

1. The add-video action is the pre-existing `/dashboard/matches/new` with no match id, so it would start a new match rather than attach video to this one — `addVideoHref(matchId)` (what `RecoveryAction` uses) is probably right for a failed row.
2. `analysisAction()` has no caller in `src` today, so none of this reaches a screen until a list-row UI uses it.

## T9 · Group stats-unavailable matches under Ready in the matches list — done

**gate:** mechanical pass · completion pass (widget-states: grouping/label logic only; no loading, empty or error state touched)
**changed:** New pure helpers `matchListGroup()` and `matchListStatusLabel()` in `match-analysis.ts`: a `stats_unavailable` row groups under Ready and reads "Stats unavailable". `matches-page-content.tsx`'s `analysisGroup` delegates to `matchListGroup` (import + function body only), so the Analysis filter chips and row filtering stay consistent. The row's status word is rendered by `RowLifecycle` in `row-state.tsx` (outside `files:`, required), which now uses both helpers — this also applies on the schedule's dual/tournament detail, which share `RowLifecycle`. `isAnalysisFailed` and `ANALYSIS_LABEL` unchanged. New `tests/matches-list-grouping.spec.ts`. No existing spec pinned the old grouping.

## T11 · resubmitJob refuses every non-retry class — done

**gate:** mechanical pass · completion pass (accepted path confirmed behaviourally unchanged)
**changed:** `resubmitJob()` selects `error_code`/`error_step` and replaces the `invalid_input` check with one `classifyFailure()` call at the same point (after `not_failed`, before any chain load, blob HEAD, insert, reservation or vendor call). `fix_recording` → `input_rejected` (message kept); `upload_again` → `video_unavailable` with the plain upload-again body; any other non-retry class → `not_failed` (unreachable today, kept as a fail-safe). No new refusal reason; `resubmit/route.ts` untouched. Spec adds no-video (no blob HEAD), INTERNAL_ERROR-accepted and auto download-failure cases; existing `input_rejected` cases unedited.
**follow-ups:**

1. `resubmit-job.ts` (server, `src/lib/services`) now imports `byClass` from `src/components/dashboard/matches/analysis-failure-copy.ts`. It's plain TS with no React, so it works, but the copy module might belong under `src/lib` if more server code starts reading it (T19's email will).

## T12 · Stalled uploaded rows record a refusal code and keep the handler's reason — done

**gate:** mechanical pass · completion pass (real block read, not the spec's replica; nothing outside the refusal block changed)
**changed:** New pure `refusalCodeFor(status)` in `splitstep/refusal-code.ts` (429/403/422/503 → QUOTA_EXCEEDED / NOT_ELIGIBLE / INVALID_METADATA / NOT_CONFIGURED, else null), re-exported from `submit-match-video.ts`. The auto-submit refusal block now captures the response status, writes `error_code` on every non-502 refusal (null clears a stale code — fixed in-run after the first draft only wrote non-null codes), and skips its write entirely on a 502 so the handler's vendor text survives. No `status` in any update. New `tests/submit-refusal-code.spec.ts`.
**follow-ups:**

1. The spec's write-path cases test an inlined replica of the refusal block, not `uploadAndSubmitVideo` itself (it imports browser-only upload/trim modules); a harness for the real function would make them load-bearing.
2. The free "Try again" (`RetrySubmission`) POSTs `/api/splitstep/jobs` from the button, not through this block, so a refusal there records no code or message — a stalled row retried from the match page keeps its previous reason.

## T13 · Derivation failures carry a code; unreconciled folds are recorded — done

**gate:** mechanical pass · completion pass
**changed:** `deriveAndPublish()` writes `error_code` on every failure: persist refusals split by a new required `failure: "refused" | "error"` field on `persistTranscript`'s (and `buildTranscriptForJob`'s) failure returns — deterministic refusals (no winner, no stored results, provider mix, transcript not built) → `DERIVATION_REFUSED`, DB read/write errors surfaced the same way → `DERIVATION_ERROR`; RPC errors and throws → `DERIVATION_ERROR`; success clears `error_code`. New `recordUnreconciledFold()` merges `fold: { reconciled: false, reason }` into `derivation_quality` after `completed` is written, keeping existing keys and never failing the derivation. `persist-transcript.ts`'s writes unchanged. RPC call sites untouched. New `tests/derive-and-publish-codes.spec.ts` (9 cases).
**follow-ups:**

1. "job not found" / "match not found" map to `DERIVATION_ERROR` (rebuildable) — right for a failed read, but a truly deleted row will just fail again on rebuild.
2. An invalid-JSON results file throws inside the build and lands as `DERIVATION_ERROR` though it is deterministic; mark it refused explicitly if that matters.
3. The fold merge is read-modify-write; switch to an atomic jsonb `||` RPC if another writer of `derivation_quality` ever runs concurrently.

## T14 · Add the /rederive route — done

**gate:** mechanical pass · completion pass (ownership from `getUser()`; no raw DB errors returned)
**changed:** New `POST /api/splitstep/jobs/[jobId]/rederive`: `handler.ts` (injected deps) runs 401 → 404 (missing / not the uploader) → 409 unless `derivation_failed` + `classifyFailure` = `rederive` + results present → conditional claim `derivation_failed → deriving` (0 rows → 409) → `deriveAndPublish` once with the webhook's deadline formula (start + 60 s − 8 s). Failure reasons go to `pipelineLog` only. `route.ts` is wiring with `runtime = "nodejs"`, `maxDuration = 60`. New `tests/rederive-handler.spec.ts` (9 cases). MAP.md's api list names the route; `npm run map` clean.
**follow-ups:**

1. A platform timeout during the transcript write or the stats RPCs (which the deadline doesn't bound) leaves the row at `deriving` forever — no catch runs, and `/rederive` only claims `derivation_failed`. The webhook path shares this. Needs a sweep that resets stale `deriving` rows to `derivation_failed` / `DERIVATION_ERROR`.
2. `deriveAndPublish` re-writes `deriving` after the claim — harmless, redundant.

## T15 · Extract the webhook's results-securing step into secureResults — done

**gate:** mechanical pass · completion pass (removed block compared line by line: same download timeout, upload, RPC args, logs and `processing_error` path)
**changed:** New `splitstep/secure-results.ts` with `secureResults({ supabase, jobId, strokesUrl, objectKey, deliveryId?, timeoutMs?, logPrefix?, io })`, returning `{ resultsSecured, objectKey, bytes, body }` or `{ resultsSecured: false, error }` (the route needs `body`/`objectKey` downstream). The webhook route calls it in place of the old inline block; its diff is that replacement plus one import. `deliveryId` is optional so the reconciler can call it. `storeVendorJson` is copied (fetch made injectable) because the route still uses its own for per-frame files. New `tests/secure-results.spec.ts` (5 cases). Webhook regression script skipped: needs a running dev server and the webhook secret — left for /pr-check.
**follow-ups:**

1. Two copies of `storeVendorJson` now exist; have the route import the `secure-results.ts` one in a later change (touches frozen route lines, record under guardrails §2).
2. Without a delivery id, a failed download has no delivery row to hold `processing_error` — T16's sweep must record the failure its own way.

## T16 · Reconcile sweep recovers completed jobs whose results never landed — done

**gate:** mechanical pass · completion pass (existing POLLABLE path confirmed unchanged apart from two literals moved into constants)
**changed:** `reconcile.ts` gains `recoverUndeliveredResults`: a separately capped (2) sweep over `completed` jobs with no results, no derivation and `completed_at` > 10 min, scoped to the page's `matchIds`. Each row is claimed by a conditional `last_polled_at` stamp; claimed rows run `secureResults` (stored `sas_url`, webhook key builder) → `gradeResults` → `deriveAndPublish` (40 s deadline), mirroring the webhook's completed path. A missing/expired URL (`sas_expires_at`, else the link's `se=` expiry) or a second failed attempt marks `failed / RESULTS_DELIVERY_LOST` by a conditional update on `status = 'completed'`, with the quota refund and failure email the poll path already sends for that code. Scheduled with `after()` inside `reconcileBeforePageRead` (docs confirm Server Components may call it); errors logged, never thrown. New `tests/reconcile-results-sweep.spec.ts` (12 cases).
**follow-ups:**

1. `processing_jobs.sas_expires_at` is never written by anything (all live rows null) — have `record_splitstep_webhook` write it so the fallback to the URL's `se=` parameter isn't needed.
2. The 40 s derivation budget assumes a 60 s limit for `after()` work on the Vercel plan — unmeasured; a kill mid-derivation leaves the row at `deriving` (same stale-`deriving` gap as T14 follow-up 1).
3. A process death after results are saved but before derivation leaves `results_object_key` set with no derivation — no longer selected by this sweep, and `/rederive` only accepts `derivation_failed`.
4. Only tested with fakes: the live DB has no stuck completed-without-results rows today.

## T17 · A stats-unavailable match renders its page instead of the progress card — done

**gate:** mechanical pass · completion pass (widget-states: the new state is an honest "not available" note — no skeleton, sample data or zeroes; loading/error untouched)
**changed:** `page.tsx` computes `statsUnavailable = isAnalysisFailed(status) && recovery === "stats_unavailable"` and exempts only that from the short-circuit (original condition kept verbatim; every other in-flight/failed state still short-circuits), passing it to the report provider. `MatchReportMeta.statsUnavailable` (optional, defaults false, so `/m/[token]` is unchanged). `statistics-view.tsx` returns early with a `StatsUnavailableNotice` (UnpublishedStatsNotice's shell, `byClass.stats_unavailable` copy) and no stat section, insight or empty state. Per-region check: rail scoreboard, facts, Visualizations (`VizEmpty`) and Film (empty / "no points detected") draw no zeroes. Specs: new gate assertion in `match-film-entry.spec.ts` (source-order test unedited); `report-empty-states.spec.ts` gains the render with and without points.
**follow-ups:**

1. Wording in two empty states is wrong for these matches (no zeroes drawn): Film's "No points were detected … Camera placement is the usual reason" and `VizEmpty`'s "They arrive with a video analysed by Advantage Intelligence" — both could read `meta.statsUnavailable`.
2. `StatsUnavailableNotice` duplicates `UnpublishedStatsNotice`'s markup; give the latter optional title/body props.
3. `page.tsx`'s comment above `jobAnalysis` ("Failures take the same path") is now slightly stale (T20 amends guardrails §3.3).
4. `/m/[token]` never sets `statsUnavailable` — decide whether a shared stats-unavailable match shows the note.
5. Eyes-on owed: open live job b74a1e04's match.

## T18 · Show the unreconciled-score caveat on the Statistics tab — done

**gate:** mechanical pass · completion pass (widget-states: a conditional note strip and one copy clause; no loading, empty or error state changed)
**changed:** `match-detail-server.ts` adds `resolveFoldUnreconciled()` (newest completed job's `derivation_quality.fold.reconciled === false`) inside `getMatchDetailData`'s existing `Promise.all`, exposed as `foldUnreconciled` and passed through `page.tsx` into `MatchReportMeta` (optional, defaults false, so `/m/[token]` is unchanged). `statistics-view.tsx` renders a grey `noteStripCls` strip with the caveat above the statistics (not on the `statsUnavailable` path). `UnpublishedStatsNotice` takes an optional `foldUnreconciled` and drops only its "checked against the final score" clause. `report-empty-states.spec.ts` now renders the real notice (one old marker assertion became a stronger real-markup check) and adds flag on/off cases.
**follow-ups:**

1. `/m/[token]` share pages never show the caveat; decide whether they should.
2. `resolveFoldUnreconciled` itself has no unit test — only the UI spec with a stubbed `meta` covers the path.

## T19 · Failure email uses class copy and skips stats-unavailable — done

**gate:** mechanical pass · completion pass (internal ops alert and success email byte-for-byte unchanged)
**changed:** The athlete-facing `analysisFailedEmail` now renders the recovery class's title and body (wait-or-ask variant via `waitOrAskVariant`), plus the stored note only when `showsStoredNote` allows; `error_code` and the `failed · <step>` label no longer reach the athlete. `notifyAnalysisOutcome` selects the classifier's columns, counts the real attempt chain with `chainAttempts()` (one extra `processing_jobs` read), and skips the athlete email for `stats_unavailable`. The ops alert `analysisFailedInternalEmail` still fires for every failure, including `stats_unavailable`, with its diagnostic fields. New `tests/analysis-mail-copy.spec.ts`; `shell.ts` untouched.
**follow-ups:**

1. The email table in `src/lib/services/email/index.ts` still describes "Analysis failed" generically — note that `stats_unavailable` doesn't send it.

## T20 · Record the guardrail exceptions and correct stale pipeline docs — done

**gate:** mechanical pass · completion pass (factual claims spot-checked against the code)
**changed:** `docs/ui-revamp-guardrails.md` §2 gains one reviewed-exception entry (2026-09-28, video failure recovery) naming `resubmit-job.ts` (refusal), `submit-match-video.ts` + `refusal-code.ts` (code write, no 502 overwrite), `derive-and-publish.ts` (code + fold-flag write), `persist-transcript.ts` (return shape only), the `/rederive` route and handler (new route), `secure-results.ts` with the webhook extraction, and `reconcile.ts` (sweep); it records that `calculate_match_stats`, the SwingVision path and existing rows are untouched and no migration was added. §3.3 notes the single `stats_unavailable` exemption. `docs/video-pipeline-overview.md` now says the status endpoint is wired and the error columns are promoted and used. First draft misattributed the column writes to `finalize_splitstep_results` and to `classifyFailure()`; corrected in-run to `record_splitstep_webhook`, `reconcile.ts`, `submit-match-video.ts` and `derive-and-publish.ts`.
**follow-ups:**

1. `ui-revamp-guardrails.md`'s header still reads "current as of 2026-08-15".
2. The §2 entry predates T7 (drawers), which is blocked; amend it if T7 lands.

## T7 · Drawers render the recovery class through RecoveryAction — done

**gate:** mechanical pass · completion pass (second run, on the author's 2026-09-28 amendment; widget-states: failure notice and footer action only, loading/in-flight states untouched)
**changed:** `AnalysisNotice` works from the recovery class and a `canAct` flag: a viewer who can act sees `note ?? title` and the class drawer body (wait-or-ask variant via `waitOrAskVariant`); a viewer who can't sees the class title and "The match page has the details.", no note, no action. `match-drawer.tsx`'s `RetryButton` became a shared `DrawerRecoveryAction` in `drawer-sections.tsx`: "Retry" (→ `/resubmit`), "Rebuild statistics" (→ `/rederive`), or the upload link; `wait_or_ask` / `stats_unavailable` add nothing. Each drawer keeps today's layout: in the event drawer the recovery action takes the primary slot (View match drops to ghost); in the Matches drawer it stays an outline button under View match, as Retry always was. `EntryMatch` gains `errorCode` / `attemptsUsed`. `tests/schedule-dual-outcomes.spec.ts` passes unedited; its S4 fixture gained the loader-produced `recovery`, `note`, `errorCode`. `drawer-sections.spec.ts` rewritten for class inputs with an upload_again-with-manager case. First run's stash `7fceca0f` used as a reference only, never applied.
**follow-ups:**

1. The event drawer now also offers Rebuild statistics and the upload link, not just Retry — check in eyes-on.
2. The Matches drawer now hides the stored note and class body from viewers who can't manage the match (before, they saw `failNote` as the headline).
3. Stash `7fceca0f51e51ceb576021c6cef67184b6b42827` (blocked: T7) is superseded and can be dropped.

## T10 · Retire inputRejected and the old copy keys — done

**gate:** mechanical pass (first run failed once on `film-playback-refresh.spec.ts:1465`, untouched by this task; it passed 78/78 alone and the full re-run passed) · completion pass (every string confirmed byte-identical)
**changed:** Removed `MatchAnalysis.inputRejected`, `EntryMatch.inputRejected` and the live-patch field; `canRetryAnalysis()` now checks `recovery !== "fix_recording"`. `isInputRejected` and `INPUT_REJECTED_CATEGORY` stay (the classifier's rule 4). `ANALYSIS_FAILURE_COPY` is deleted: its strings now live as literals in `byClass`, plus a new `DRAWER_NO_ACTION_BODY` ("The match page has the details.") used by `drawer-sections.tsx`. Specs updated mechanically. `failNote` kept (ops email still reads it).
**follow-ups:**

1. `canRetryAnalysis()` has no callers in `src`; consider removing it.

## T21 · Seed one failing job per recovery class for the eyes-on verifier — done

**gate:** mechanical pass · completion pass (read closely: every write filtered to the verifier's `created_by`; dry run default; no secrets printed). Promoted from `later` by the author 2026-09-28.
**changed:** New `scripts/eyes-on/seed-failure-classes.ts`: resolves the verifier from `EYES_ON_EMAIL`, builds six personal video matches (marker `tournament_name = "Eyes-on seed · <class>"`) each with one job shaped so the real `classifyFailure` returns retry / upload_again / fix_recording / wait_or_ask / rederive / stats_unavailable (it asserts this before writing). Default is a dry run; `--write` upserts; `--cleanup [--write]` removes only marked, verifier-owned rows (jobs then matches). `external_job_id` null and no `completed` status, so the reconciler poll, results sweep and upload reaper ignore them. Only dry runs were executed; production is unchanged.
**follow-ups:**

1. To seed: `npx tsx scripts/eyes-on/seed-failure-classes.ts --write`; to remove: `... --cleanup --write`.
2. The eyes-on pass must not click actions on seeded rows: "Try again" on the stalled row POSTs `/api/splitstep/jobs`, which may reserve quota and call the vendor with a nonexistent blob.
3. A second `--write` resets the wait_or_ask row's `updated_at`; it reads as stalled again after 3 minutes.

## T22 · Reshape AnalysisSteps into the wizard's card-free column and show it on /design — done

**gate:** mechanical pass (first run failed on `design-drift.spec.ts`: a second off-scale `text-[24px]` copied from the wizard title; fixed in-run with one shared `PAGE_STEPPER_TITLE` constant, count back to its seed of 4) · completion pass
**changed:** `analysis-steps-card.tsx` renamed to `analysis-steps-column.tsx` and rewritten as the wizard's card-free column: `max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)]`, an `<h1>` using `PAGE_STEPPER_TITLE`, the shared `MatchLine`, then the four `VerticalStep` rows — no card chrome, eyebrow or facts row. `MatchLine` and `PAGE_STEPPER_TITLE` moved to `matches/match-line.tsx` and are used by the wizard too (its markup unchanged). `STAGE_NOTE` / `STALLED_RETRY_COPY` now live only in `analysis-steps.ts`. The column owns live updates (`useLiveMatchAnalysis` / `withLiveAnalysis`) and a null-initialised 10 s clock; `analysisStepsView` treats `now: null` as "not stalled, no estimate"; an optional `snapshotAt` fixes the clock for /design and specs. /design renders every variant through the column. New `tests/analysis-steps-column.spec.ts`; `analysis-steps-view.spec.ts` unedited.
**follow-ups:**

1. An already-stalled row shows "Sending for analysis" for up to 10 s before the first tick flips it to "Couldn't send for analysis" — T23 may want an immediate first tick for `uploaded`.
2. Each /design variant carries the full-page top padding, so the preview grid is very tall.

## T23 · Mount the column on the match page and retire MatchAnalysisProgress — done

**gate:** mechanical pass · completion pass (widget-states: awaiting branch renders the column; its states are the covered view states, no zeroes drawn)
**changed:** The match page's `isAwaitingAnalysis` branch now renders only `AnalysisSteps` (T22's column) under the app chrome — no scoreboard rail, share, view switcher or `MatchReportProvider`. Its match line comes from `getMatchSides` (viewer first) and `match.won` (viewer-perspective; null when played sets are level). The gate declarations are byte-identical. `match-analysis-progress.tsx` deleted; guardrails §3.3 names `AnalysisSteps`; comment-only renames elsewhere. Specs: match-film-entry's marker renamed, parity's step count 3 → 4, plus harness-only `match` / `snapshotAt` props; no other assertion changed.
**follow-ups:**

1. The 10 s stalled-state lag stays: `analysis-steps-column.spec.ts` pins exactly one `Date.now()` in `setInterval`, so an immediate first tick needs that assertion relaxed.
2. `AGENTS.md` ("short-circuits to the hero + `MatchAnalysisProgress`") and `.skills/advantage-analytics-design/reference/empty-and-loading.md:80` still name the deleted component.
3. Guardrails §3.3 still says "hero + summary", which is no longer accurate — the branch renders only the column under the app chrome.
4. The result word uses played-set counts only (no best-of on the page), so a stopped 6-4 3-2 match reads "Won" where the wizard's best-of-aware `scoreUndecided` gives no word.
5. `STAGE_NOTE` / `STALLED_RETRY_COPY` exports have no outside importer now.

## T24 · Add the compact drawer Analysis steps and the stalled "Try again" action — done

**gate:** mechanical pass · completion pass (existing AnalysisNotice / DrawerRecoveryAction spec cases unedited; drift counts at seed)
**changed:** `analysis-steps.ts` gains `drawerAnalysisStepsView(analysis, now, canAct)` (built on `analysisStepsView`: same keys/labels/states; null when settled; uploading = floored percent only; processing reads "This fills in as soon as the analysis lands."; stopped step = `note ?? title` + class drawer body for actors, "Analysis stopped" + `DRAWER_NO_ACTION_BODY` otherwise), `STALLED_RETRY_COPY.drawerBody`, `DRAWER_PROCESSING_NOTE`, `DRAWER_NO_ACTION_TITLE`. `drawer-sections.tsx` gains `DrawerAnalysisSteps` (eyebrow + `<ol aria-label="Progress">` of 12px rows reusing `StepMark`; one `role="alert"`, `role="status"` when stalled) and a `stalled` prop on `DrawerRecoveryAction` ("Try again" → POST `/api/splitstep/jobs` `{ jobId }`). `vertical-steps.tsx` only exports `LABEL_INK`. Not mounted yet; `AnalysisNotice` stays until T26.
**follow-ups:**

1. `processed` keeps `STAGE_NOTE.processed` under its (later) stats step in the drawer, matching the page — drop it if the Drawer frames should show nothing there.
2. For T25/T26: each drawer must keep a hydration-safe clock for the stall check, pass it as `now`, and feed the footer from the view's `failure` (`recovery`, `stalled`) — `drawerRecovery` still returns null for stalled rows.

## T25 · Matches drawer draws the Analysis steps — done

**gate:** mechanical pass · completion pass (footer order/variants identical to before; failed-row recovery class matches the old `drawerRecovery`; no `Date.now()` in render)
**changed:** `match-drawer.tsx` renders `DrawerAnalysisSteps` (canAct = `canManage !== false`) where `AnalysisNotice` was, and feeds `DrawerRecoveryAction` from `drawerAnalysisStepsView(...)?.failure` (recovery + stalled), so a stalled hand-off gets the outline "Try again" for actors and wait_or_ask / non-actors get none. A local `useStallClock(status)` is null on first render, ticks once right after mount then every 10 s, only while `uploaded`. Footer unchanged: View match primary (ghost beside Continue upload), Continue upload, recovery outline.
**follow-ups:**

1. No spec renders `MatchDrawer` with a stalled or failed row, so the footer wiring is covered only by the unit specs — a `matches-drafts`-harness case would close it.
2. The stall clock now exists twice (`analysis-steps-column.tsx`, `match-drawer.tsx`); make it one shared hook when T26 needs it too.

## T26 · Schedule event drawer draws the Analysis steps; retire AnalysisNotice — done

**gate:** mechanical pass · completion pass (`schedule-dual-outcomes.spec.ts` and its fixture unedited and green; every old AnalysisNotice case carried by a DrawerAnalysisSteps case)
**changed:** `EntryMatch` gains `updatedAt`, `jobReference`, `uploadPercent` (set in `schedule-server.ts`). `event-line-drawer.tsx` builds a `MatchAnalysis` from the entry, renders `DrawerAnalysisSteps` (canAct = `canEdit`) for played singles lines (doubles unchanged), and feeds the footer from the view's `failure`, so a stalled hand-off puts "Try again" in the footer primary with View match as ghost; the failed-row footer is unchanged. It shares `useStallClock`, now exported from `match-drawer.tsx`. `AnalysisNotice`, its `drawerCopy` helper and its 9 spec cases are deleted.
**follow-ups:**

1. `drawerRecovery` has no caller in `src` now — delete it with its spec case.
2. No spec covers the event drawer's stalled "Try again" footer (the protected fixture has no stalled row) — a separate fixture would pin it.
3. `useStallClock` lives in `match-drawer.tsx` and the event drawer imports it from there; a tiny shared hooks module would be a cleaner home.

## T27 · Share the match page's layout decision and add a cached status hint — done

**gate:** mechanical PASS · completion PASS
**changed:** `match-analysis.ts` exports `isStatsUnavailable` and `matchPageKind` ("steps" | "report"); page.tsx derives `statsUnavailable` / `isAwaitingAnalysis` from them on its post-reconcile analysis. New `match-page-hint-server.ts` exports `getMatchPageHint`, a `cache()`d cookie-client loader (no reap/reconcile) returning `{ analysis, kind }` or null. match-film-entry.spec.ts pins the relocated literals against match-analysis.ts; new match-page-layout.spec.ts pins the truth table. Deviation: live `matches` has no `verification_status`, so the hint selects `verified` and maps it as `transformDbMatchToMatch` does (reviewer verified against live schema).
**follow-ups:**

1. `getMatchPageHint` has no caller yet; T29 is its first consumer and should document the reap/reconcile drift.
2. T27's criterion names a non-existent `verification_status` column; correct any later task text that repeats it.

## T28 · Stepper-column skeleton for the analysing match page — done

**gate:** mechanical PASS · completion PASS
**changed:** New `AnalysisStepsPending` (`loading/analysis-steps-pending.tsx`): a `PendingFrame` ("Loading analysis progress", the single status role) around the stepper column's geometry — title bar, match-line bar, and a `mt-9` list of four `gap-3.5` rows, each a `size-4 rounded-full` mark bar beside a label bar, all `PendingBar`s. New offline spec `tests/analysis-steps-pending.spec.ts` pins the markup. Not mounted yet (T29).

## T29 · Match layout streams a status-aware skeleton; the group loading state goes neutral — done

**gate:** mechanical PASS · completion PASS
**changed:** layout.tsx awaits `getMatchPageHint` first, `notFound()`s on null, then renders the fixed-height wrapper around a `<Suspense>` whose fallback is `AnalysisStepsPending` for kind "steps", else `MatchReportSkeleton`; a new async `MatchData` inside the boundary holds `getMatchDetailData`, its `notFound()`, `MatchDataProvider key={match.id}`, `ClearRetryOnSuccess` and children. `(detail)/loading.tsx` is now an empty fixed-height `PendingFrame`. page.tsx gate unchanged, with a comment that the pre-reconcile hint only picks which skeleton flashes. New tests/match-layout-skeleton.spec.ts pins the source order and the single caller pair. Comment-only touch to analysis-steps-pending.tsx (its "not mounted yet" line went stale).
**follow-ups:**

1. A missing match renders not-found with a 200 status because the group loading.tsx streams first (pre-existing behaviour, not new here).

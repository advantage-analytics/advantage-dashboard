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

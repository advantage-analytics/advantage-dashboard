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

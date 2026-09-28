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

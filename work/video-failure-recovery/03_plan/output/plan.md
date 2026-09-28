# Plan — Retry only where it can help, and surface every video failure

Inputs: `02_design/output/design.md`, and `01_brief/output/brief.md` as the
scope guard. Every step below traces to a design component. Nothing here goes
beyond the brief's scope. The brief's item 7 (the fps check) and its
SwingVision half of item 4 were moved out in stage 02, and neither reappears.

**Open questions from the design.** The plan takes the design's defaults:

- Unknown `video_quality` codes → `retry`.
- `/rederive` is open to the uploader only, like `/resubmit`.
- `NOT_ELIGIBLE` copy says "ask your team's owner".
- The schedule page does not reconcile.

Edit the design to change any of these before stage 04.

## Step 0 — Precondition gate (no code)

- **Check:** both of these must hold before any step below is built.
  - `git merge-base --is-ancestor claude/advantage-intelligence-ui-e6e2f7 origin/splitstep-integration`
    succeeds, with T10–T12 merged.
  - `claude/match-analysis-failure-retry-8769f3` has merged, with at least T1.
- **Then:** sync this branch with `splitstep-integration` (`sync_with_base_branch`)
  and re-read the merged versions of the files listed in stage 02's
  Dependencies table.
  - If T11/T12 landed differently from their task specs, adapt the names in
    steps 2–8. Do not re-open the design.
- **As of 2026-09-27:** neither branch has merged. T10 (05b36eb8) and T1
  (e0ae397c) are committed on their branches with the names the design uses:
  `isInputRejected`, `INPUT_REJECTED_CATEGORY`, `liveAnalysisPatch`,
  `MatchAnalysis.inputRejected`, and the `input_rejected` reason.
- **Verification:** both ancestor checks pass. `npx tsc --noEmit` and
  `npm test` are green on the synced branch before step 1.

## Client data and copy

### Step 1 — The pure classifier (design components §Architecture, §1)

- **Files:**
  - `src/lib/data/match-analysis.ts`
  - `src/lib/services/splitstep/resubmit-job.ts` (move out two definitions only)
  - `tests/match-analysis-input-rejected.spec.ts` (extend)
- **Change:**
  - Add `RecoveryClass` (`retry | upload_again | fix_recording | wait_or_ask |
    rederive | stats_unavailable`), a `RecoveryInput` type, and
    `classifyFailure(input)`, following the design's six rules in order.
    Return `null` for rows that are not failed and not stalled.
  - Add `showsStoredNote(errorCode)`: true when the code is non-null and does
    not start with `DERIVATION_`.
  - Move `isDownloadFailure` and `MAX_TOTAL_ATTEMPTS` out of
    `resubmit-job.ts` into `match-analysis.ts`, so the classifier stays free
    of server imports. `resubmit-job.ts` re-exports both, so the frozen
    webhook route's import (`route.ts`) and `reconcile.ts` don't change.
  - `isInputRejected` stays and is rule 4's test.
  - Nothing else in `resubmit-job.ts` changes.
- **Verification:**
  - The spec gains a `classifyFailure` table covering:
    - the ten live rows from the design's table (45ff4bd7 → fix_recording;
      e6e8dea4 → retry; the five no-video rows → upload_again; b74a1e04 →
      stats_unavailable; c1d36200 with `QUOTA_EXCEEDED` → wait_or_ask;
      85518306 → retry)
    - each rule in isolation
    - rule order (no video + invalid_input → upload_again)
    - the ceiling downgrade (retry with `attemptsUsed: 3` → wait_or_ask)
    - `DERIVATION_ERROR` → rederive
    - an unknown `video_quality` code → retry
  - `showsStoredNote` gets a truth table.
  - The existing `isInputRejected` cases pass unedited.
  - `grep -n "export function isDownloadFailure" src -r` matches only
    `match-analysis.ts`.
  - `tsc` passes.
- **Model:** opus.

### Step 2 — Loader, live hook and schedule projection carry `recovery` (§1)

- **Needs:** step 1.
- **Files:**
  - `src/lib/data/match-analysis-server.ts`
  - `src/hooks/use-live-match-analysis.ts`
  - `src/lib/data/schedule-server.ts`
  - `src/lib/schedule/types.ts`
  - `tests/match-analysis-input-rejected.spec.ts` (extend)
- **Change:**
  - **`loadMatchAnalysis` select.** Add `error_code`, `error_step`,
    `video_object_key`, `results_object_key` and `resubmitted_from_job_id`.
  - **Booleans.** Map both keys to `hasVideo` / `hasResults` inside the
    loader; the keys are never put on `MatchAnalysis`.
  - **`attemptsUsed`.** Count the newest job's chain (root plus descendants
    through `resubmitted_from_job_id`) from the rows already fetched for that
    match.
  - **New fields.** `MatchAnalysis` gains `recovery: RecoveryClass | null`
    and `attemptsUsed`. A `note` field is either the stored `error_message`,
    when `showsStoredNote` allows it, or undefined.
  - **Live hook.** `liveAnalysisPatch` computes `recovery` with the same
    function.
    - The Realtime row has no chain, so `withLiveAnalysis` passes the base
      analysis's `attemptsUsed`, plus 1 when the live row is a new job whose
      `resubmitted_from_job_id` is set.
  - **Schedule data.** `EntryMatch` gains `recovery` and `note`, copied in
    `schedule-server.ts`.
  - `inputRejected` is **kept** until step 8, so T11/T12's components keep
    compiling.
- **Verification:**
  - Spec cases for `liveAnalysisPatch` with a no-video failed row
    (→ upload_again), a stalled uploaded row with `QUOTA_EXCEEDED`
    (→ wait_or_ask, note present), and an uncoded "Failed to fetch" row
    (→ note undefined).
  - A pure-function test for the chain count (three rows in one chain → 3;
    an unrelated earlier upload for the same match isn't counted).
  - The client-exposed type excludes the raw keys:
    `grep -n "video_object_key" src/lib/data/match-analysis.ts` finds none.
  - `tsc` passes.
- **Model:** opus.

### Step 3 — `ANALYSIS_FAILURE_COPY` keyed by class (§2)

- **Needs:** step 1.
- **Files:**
  - `src/components/dashboard/matches/analysis-failure-copy.ts`
  - `tests/analysis-failure-copy.spec.ts` (extend)
- **Change:**
  - Add a `byClass` map with, for each `RecoveryClass`: a title, a card body,
    a drawer body and an action label (or null).
  - Existing strings are **referenced, not rewritten**:
    - `retry` uses T8's `failed.*`
    - `fix_recording` uses T11's `failed.inputRejected`
    - `stats_unavailable` uses T8's `derivation_failed`
  - New copy for `upload_again`:
    - title "The video didn't finish uploading"
    - body "There's nothing to retry from. Upload the video again — your match
      details are kept."
    - action "Upload the video again"
  - New copy for `wait_or_ask`, in three variants chosen by code:
    - allowance, which shows the stored note
    - permission ("ask your team's owner")
    - the attempt ceiling ("This analysis has been tried three times. Contact
      us and we'll look at it.")
  - New copy for `rederive`:
    - title "Statistics didn't finish building"
    - body "The video was analyzed. Rebuilding the statistics doesn't use any
      of your allowance."
    - action "Rebuild statistics"
  - The old top-level keys stay until step 8.
- **Verification:**
  - A spec asserts that every `RecoveryClass` has an entry.
  - Every string matches `/splitstep|swingvision|edge function|failed to fetch|<\?xml/i`
    zero times.
  - `upload_again` and `fix_recording` bodies do not contain "Retrying".
- **Model:** sonnet.

### Step 4 — `RecoveryAction` component (§3)

- **Needs:** steps 1 and 3.
- **Files:**
  - `src/components/dashboard/matches/match-detail/recovery-action.tsx` (new)
  - `tests/recovery-action.spec.ts` (new; pattern
    `tests/analysis-failure-copy.spec.ts` + `tests/fixtures/vm-modules.ts`)
- **Change:** props are `{ recovery, jobId, matchId, variant }`. It switches
  on class:
  - `retry` on a failed row → `RetryActionButton` to `/resubmit`
  - `retry` on a stalled row → `RetrySubmission`
  - `rederive` → `RetryActionButton` to `/api/splitstep/jobs/${jobId}/rederive`
    with the step 3 label
  - `upload_again` and `fix_recording` → a `next/link` styled with
    `advButton()` to `addVideoHref(matchId)`
  - `wait_or_ask`, `stats_unavailable` and null → nothing
  - Read the design-system SKILL.md and `reference/components.md` before
    building it.
- **Verification:**
  - The vm-modules render spec, for each class, contains the expected marker
    or href, or empty markup.
  - No `rounded-full` on the link.
  - The widget-states skill runs, since this is a dashboard component.
- **Model:** sonnet.

### Step 5 — Match page progress card (§3)

- **Needs:** steps 2–4.
- **Files:**
  - `src/components/dashboard/matches/match-detail/match-analysis-progress.tsx`
  - `tests/analysis-failure-copy.spec.ts` (extend)
- **Change:**
  - The failed block and the stalled branch render `byClass[recovery]`:
    - the headline is `note ?? title`
    - the body
    - `<RecoveryAction>`
  - This replaces T8/T11's `status` / `inputRejected` branches and the direct
    `RetryAnalysis` / add-video link.
  - A stalled row with a note (the allowance case) shows it instead of "This
    hasn't been sent for analysis yet".
  - `ANALYSIS_LABEL` and the milestones above it are unchanged.
- **Verification:** vm-modules renders of the progress card:
  - An uncoded failed row with `error_message: "<?xml …AuthorizationFailure…"`
    and `hasVideo: false` shows the upload_again title and the upload link, no
    XML, and no `data-component="RetryActionButton"`.
  - 45ff4bd7's row keeps the vendor note as headline, with no retry.
  - e6e8dea4's row shows retry.
  - The stalled quota row shows its note and no retry.
  - T8/T11's existing cases are updated to class inputs; their assertions are
    kept.
- **Model:** opus.

### Step 6 — Drawers (§3)

- **Needs:** steps 2–4.
- **Files:**
  - `src/components/dashboard/matches/drawer-sections.tsx` (`AnalysisNotice`)
  - `src/components/dashboard/matches/match-drawer.tsx` (the `canRetry` line
    and the `RetryButton` definition)
  - `src/components/dashboard/schedule/event-line-drawer.tsx` (`retryJobId`
    and the `AnalysisNotice` call)
  - `tests/drawer-sections.spec.ts` (extend)
- **Change:**
  - `AnalysisNotice` takes `recovery` and `note`, and renders
    `byClass[recovery]` with the drawer body.
  - `match-drawer.tsx` deletes its `RetryButton` (424-470) and renders
    `<RecoveryAction>` when `canManage !== false`.
  - `event-line-drawer.tsx` does the same through `canEdit`.
  - Viewers without manage rights see the title and body with no action.
- **Verification:**
  - T9/T12's spec cases are updated to class inputs.
  - A new case: an upload_again row with `canManage` shows the upload link and
    no "Retrying".
  - `grep -n "function RetryButton" src -r` finds none.
  - `tsc` passes.
- **Model:** opus.

### Step 7a — Row action per class (§3)

- **Needs:** step 1.
- **Files:**
  - `src/lib/data/match-analysis.ts` (`analysisAction`)
  - `tests/match-analysis-timeline.spec.ts` (extend; it already imports this
    module)
- **Change:** `analysisAction` returns the class's action instead of "Start
  over" for every failure:
  - `upload_again` / `fix_recording` → add-video
  - `retry` / `rederive` → "View" (to the match page, where the button lives)
  - `stats_unavailable` → "View stats"
- **Verification:** unit cases per class. "Start over" is no longer returned
  for a failed row that has video.
- **Model:** sonnet.

### Step 7b — Matches list grouping (§3)

- **Needs:** step 2.
- **Files:**
  - `src/components/dashboard/matches/matches-page-content.tsx` (grouping only,
    ~117-122)
  - The spec that covers the grouping, if one exists. Otherwise a pure helper
    extracted beside the grouping and tested.
- **Change:** a row with `recovery === "stats_unavailable"` groups under
  "Ready", not "Failed", and its label reads "Stats unavailable".
- **Verification:** a grouping unit case. A manual check that no other part
  of this large file is in the diff (`git diff --stat`).
- **Model:** sonnet.

### Step 8 — Retire `inputRejected` and the old copy keys (§1, §2)

- **Needs:** steps 5, 6 and 7a.
- **Files:**
  - `match-analysis.ts`
  - `match-analysis-server.ts`
  - `use-live-match-analysis.ts`
  - `schedule/types.ts`
  - `schedule-server.ts`
  - `analysis-failure-copy.ts`
  - the specs that referenced them
- **Change:**
  - Remove `MatchAnalysis.inputRejected`, `EntryMatch.inputRejected` and the
    old top-level copy keys.
  - Keep `isInputRejected` (rule 4) and `INPUT_REJECTED_CATEGORY`.
- **Verification:**
  - `grep -rn "inputRejected" src` finds only the function name.
  - `grep -rn "ANALYSIS_FAILURE_COPY\.\(failed\|derivation_failed\)" src`
    finds none.
  - `tsc` and `npm test` are green.
- **Model:** sonnet.

## Server

### Step 9 — `resubmitJob` refuses every non-`retry` class (§4)

- **Needs:** steps 1 and 0 (T1 merged).
- **Files:**
  - `src/lib/services/splitstep/resubmit-job.ts`
  - `tests/resubmit-authorization.spec.ts` (extend)
- **Change:**
  - The parent select adds `error_code` and `error_step`.
  - T1's `invalid_input` check becomes one `classifyFailure` check. It needs
    `attemptsUsed`; pass 0 there, because the chain is checked after it by
    the existing `attempt_ceiling` gate, which stays as is.
  - Reasons are mapped, not added:
    - `fix_recording` → T1's `input_rejected` (its message is kept)
    - `upload_again` → `video_unavailable` with step 3's plain upload_again
      body
    - any other non-retry class → `not_failed`
  - `REFUSAL_STATUS` is unchanged.
  - The `auto` path passes through the same check.
- **Verification:**
  - New cases: a no-video parent → `video_unavailable` with the plain message,
    before any blob HEAD. An `INTERNAL_ERROR` parent is still accepted.
  - Each refusal writes no row, reserves nothing and sends no vendor body.
  - T1's cases pass unedited.
  - `npx playwright test tests/resubmit-authorization.spec.ts` passes.
- **Model:** sonnet.

### Step 10 — Stalled `uploaded` rows keep their reason (§5)

- **Files:**
  - `src/lib/services/splitstep/submit-match-video.ts` (443-462)
  - `tests/submit-refusal-code.spec.ts` (new)
- **Change:**
  - Export a pure `refusalCodeFor(status)` (429/403/422/503 → the design's
    codes; others → null).
  - On a refusal that leaves the row `uploaded`, write `error_code` alongside
    `error_message`.
  - On a 502, skip the `error_message` overwrite (the handler already wrote
    the row).
  - The client still never writes `status`.
- **Verification:**
  - A `refusalCodeFor` truth table.
  - A read of the diff confirms `status` is not in any update object this
    step touches.
  - `tsc` passes.
- **Model:** sonnet.

### Step 11 — Derivation codes and the fold flag (§6, §8)

- **Files:**
  - `src/lib/services/splitstep/derive-and-publish.ts`
  - `tests/derive-and-publish-codes.spec.ts` (new; a fake supabase client in
    the style of `tests/resubmit-authorization.spec.ts`'s injected I/O)
- **Change:**
  - Write `error_code: "DERIVATION_REFUSED"` on the persist-transcript
    refusal (:77-80).
  - Write `"DERIVATION_ERROR"` on the RPC-error and throw paths (:115-121,
    :187-190).
  - At :163, on an unreconciled grade, merge `{ fold: { reconciled: false,
    reason } }` into `derivation_quality`. That is a read-modify-write of the
    jsonb in the same function, under the service role.
  - Success clears `error_code` along with `error_message`.
- **Verification:**
  - A refusal writes `DERIVATION_REFUSED`.
  - A rejected RPC writes `DERIVATION_ERROR`.
  - An unreconciled grade leaves the existing `derivation_quality.checks`
    intact and adds `fold`.
  - `calculate_match_stats` is not in the diff (`git diff` shows RPC call
    sites unchanged).
- **Model:** opus.

### Step 12 — `/rederive` route (§6)

- **Needs:** steps 1 and 11.
- **Files:**
  - `src/app/api/splitstep/jobs/[jobId]/rederive/route.ts` (new, wiring)
  - `src/app/api/splitstep/jobs/[jobId]/rederive/handler.ts` (new, the
    decision with injected I/O)
  - `tests/rederive-handler.spec.ts` (new)
- **Change:**
  - The auth ladder copied from `resubmit/route.ts`: 401 when not signed in;
    404 when the job is missing or `created_by` is not the user.
  - Then 409 unless `status = derivation_failed`, `classifyFailure = rederive`
    and `results_object_key` is set.
  - A conditional claim (update to `deriving` where
    `status = 'derivation_failed'`); zero rows → 409.
  - Then `deriveAndPublish({ deadline })` with `maxDuration = 60`, matching
    `/resubmit`.
  - Read `node_modules/next/dist/docs/` for route segment config before
    writing (AGENTS.md).
- **Verification:**
  - Handler cases: 401; 404 (another user's job); 409 for DERIVATION_REFUSED;
    409 on a lost claim; success calls `deriveAndPublish` exactly once.
  - `MAP.md`'s hand-written api list gains `/rederive`, and `npm run map` is
    clean.
- **Model:** opus.

### Step 13a — Extract the results-securing step from the webhook (§9)

- **Files:**
  - `src/app/api/webhooks/splitstep/route.ts` (the 441-476 block only)
  - `src/lib/services/splitstep/secure-results.ts` (new)
  - `tests/secure-results.spec.ts` (new)
- **Change:**
  - Move the results download and `finalize_splitstep_results` call into
    `secureResults({ supabase, jobId, strokesUrl, io })`.
  - The webhook calls it with **identical behaviour**: same logs, same
    `processing_error` write, same `resultsSecured` boolean.
  - No other line of the webhook route changes.
- **Verification:**
  - Spec with an injected fetch: success sets `results_object_key`; a
    download failure writes `processing_error` and returns false.
  - `git diff src/app/api/webhooks/splitstep/route.ts` shows only the call
    replacing the block.
  - `npx tsx scripts/splitstep-webhook-test.ts` against a local dev server,
    if `SPLITSTEP_WEBHOOK_SECRET` is set; if not, it is recorded as skipped
    in the step log.
- **Model:** opus.

### Step 13b — Reconcile sweep for unsecured completed jobs (§9)

- **Needs:** steps 11 and 13a.
- **Files:**
  - `src/lib/services/splitstep/reconcile.ts`
  - The caller `reconcileBeforePageRead` (wherever it lives; the step
    resolves it)
  - `tests/reconcile-results-sweep.spec.ts` (new)
- **Change:**
  - Add a second query: `status = completed`, `results_object_key is null`,
    `derivation_version is null`, `completed_at < now() − 10 min`, capped at
    2 per read.
  - For each row:
    - If `sas_expires_at` has passed, or a second attempt fails (tracked with
      `last_polled_at`), mark it `failed` / `RESULTS_DELIVERY_LOST` with the
      existing message, using a conditional update on `status = completed`.
    - Otherwise run `secureResults`, then `deriveAndPublish`.
  - The work runs inside `after()`, so a page render never awaits it. Confirm
    that `after` is callable from a Server Component in the Next 16 docs
    under `node_modules/next/dist/docs/` before wiring.
- **Verification:**
  - Spec with injected I/O: a fresh sweep secures and derives. An expired URL
    marks `RESULTS_DELIVERY_LOST`. A row that changed status mid-sweep is left
    alone (the conditional update matches 0 rows).
  - The existing polling path's behaviour is unchanged (its spec, if one
    exists, still passes).
- **Model:** opus.

## Match page

### Step 14 — `stats_unavailable` renders the match (§7)

- **Needs:** step 2.
- **Files:**
  - `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` (short-circuit,
    226-227 and 268-307)
  - `src/components/dashboard/matches/match-detail/match-report-context.tsx`
    (`meta.statsUnavailable`)
  - `src/components/dashboard/matches/match-detail/statistics-view.tsx`
  - `tests/match-film-entry.spec.ts` (extend)
- **Change:**
  - `isAwaitingAnalysis` excludes `analysis.recovery === "stats_unavailable"`.
  - The page passes `statsUnavailable` into `meta`.
  - `statistics-view.tsx` renders T8's derivation title and body as a quiet
    note in the `UnpublishedStatsNotice` slot, **and no stat section**.
  - Run `trace-route` for `/dashboard/matches/[matchId]` first, to confirm
    which Statistics, Visualizations and Film components render, and that
    each handles zero points without drawing zeroes. Visualizations must show
    its existing empty state.
- **Verification:**
  - The source-order assertion still holds.
  - A new assertion that the short-circuit condition references
    `stats_unavailable`.
  - Eyes-on (see Test strategy): b74a1e04's match renders hero, Film and the
    note, with no zero-valued chart.
- **Model:** opus.

### Step 15 — Unreconciled fold caveat (§8)

- **Needs:** steps 11 and 14 (both touch `statistics-view.tsx`; run in order).
- **Files:**
  - `src/lib/data/match-detail-server.ts` (select `derivation_quality->fold`
    for the match's completed job)
  - `match-report-context.tsx` (`meta.foldUnreconciled`)
  - `statistics-view.tsx`
  - `match-detail/unpublished-stats-notice.tsx`
- **Change:**
  - A grey `noteStripCls` strip with the design's copy above the Statistics
    tab when `foldUnreconciled`.
  - `UnpublishedStatsNotice` drops its "checked against the final score"
    clause under the same flag.
- **Verification:**
  - A vm-modules render with the flag shows the strip and no "checked
    against".
  - Without the flag, the markup is unchanged from before.
  - The widget-states skill runs.
- **Model:** sonnet.

### Step 16 — Failure email uses class copy (§3)

- **Needs:** steps 1 and 3.
- **Files:**
  - `src/lib/services/notifications/analysis-mail.ts`
  - `src/lib/services/email/templates/analysis.ts`
  - The email's spec, if one exists; otherwise `tests/analysis-mail-copy.spec.ts`
    (new)
- **Change:**
  - `analysis-mail.ts` selects the columns `classifyFailure` needs.
  - The template renders the class title and body, plus the note only under
    `showsStoredNote`.
  - It no longer prints `error_code` or `failed · ${error_step}` to the user.
  - No failure email is sent for `stats_unavailable`.
  - Read `docs/email-system.md` first.
  - `shell.ts` is untouched.
- **Verification:** template renders for an uncoded "Failed to fetch" row
  (no raw string) and for 45ff4bd7 (the vendor note). A `stats_unavailable`
  outcome returns "not sent".
- **Model:** sonnet.

### Step 17 — Docs (§Guardrails bookkeeping)

- **Needs:** steps 9–15.
- **Files:**
  - `docs/ui-revamp-guardrails.md` (§2 and §3.3)
  - `docs/video-pipeline-overview.md` (603-615)
- **Change:**
  - One §2 reviewed-exception entry naming each frozen file touched (steps 9,
    10, 11, 12, 13a, 13b) and what each change is: a refusal, a code write, a
    flag write, a new route, an extraction, a sweep.
  - A §3.3 note that the short-circuit exempts `stats_unavailable` only.
  - Correct the stale "error columns / status endpoint unused" lines.
- **Verification:** `npm run format:check` passes. Each file named in the §2
  entry appears in `git diff --stat splitstep-integration`.
- **Model:** sonnet.

## Order and parallelism

```
0 ─► 1 ─┬─► 2 ─┬─► 5 ─┐
        │      ├─► 6 ─┼─► 8
        ├─► 3 ─┤      │
        │      └─► 4 ─┘ (5 and 6 also need 4)
        ├─► 7a ──────────► 8
        ├─► 9
        └─► 16 (also needs 3)
   2 ─► 7b
   2 ─► 14 ─► 15
  11 ─► 12
  11 ─► 13b
  13a ─► 13b
  11 ─► 15
  9–15 ─► 17
10 and 11 need only 0.
```

**Step 5, step 6 and step 14 each touch one surface and must not be merged.**
The progress card, drawers and match page are separate specs and separate
eyes-on screens. `matches-page-content.tsx` (7b) is large and is kept to the
grouping lines only.

## Test strategy

- **Unit, offline** (the Playwright `offline` project; pure modules imported
  directly, components through `tests/fixtures/vm-modules.ts`):
  - `classifyFailure`, `showsStoredNote` and the chain count: steps 1 and 2.
  - The copy-module invariants: step 3.
  - Per-class render specs for `RecoveryAction`, the progress card and
    `AnalysisNotice`: steps 4, 5 and 6.
  - `analysisAction` and grouping: steps 7a and 7b.
  - `refusalCodeFor`: step 10.
- **Server decisions with injected I/O** (the
  `tests/resubmit-authorization.spec.ts` pattern):
  - resubmit refusals: step 9
  - derivation codes and the fold merge: step 11
  - the rederive handler: step 12
  - `secureResults`: step 13a
  - the reconcile sweep: step 13b
- **The one invariant every surface must hold:** no uncoded `error_message`
  reaches markup. It is asserted in the step 5, 6 and 16 specs with the same
  three raw strings (Azure XML, "Failed to fetch", "Edge Function returned a
  non-2xx status code").
- **No live-DB specs are added.** Every new test injects its I/O. That keeps
  the live-db lock and the prod-auth rate limit out of this feature
  (AGENTS.md).
- **Gates per step:** `npx tsc --noEmit`, the step's specs, `npm run lint`.
  Before the PR: the full `npm test`, and `/pr-check`.
- **Eyes-on** (`/pr-check` Stage 3b, verifier account):
  - The match page, list drawer and schedule drawer for one match per class.
  - The real rows exist only under other users. Stage 04 must decide how the
    verifier account gets one failing job per class: seeded rows on its own
    matches, created and removed by a script, with dry-run as the default.
  - This is flagged, not decided, here, because it writes to the production
    database.
- **Webhook regression:** `scripts/splitstep-webhook-test.ts` after step 13a,
  when the secret is available.

## Also consulted

- `claude/advantage-intelligence-ui-e6e2f7` @ 05b36eb8: `match-analysis.ts`,
  `use-live-match-analysis.ts` and `match-analysis-server.ts`, for T10's
  shipped names.
- `claude/match-analysis-failure-retry-8769f3` @ e0ae397c: the T1 diff
  (`resubmit-job.ts`, `resubmit/route.ts`).

# Review — video-failure-recovery

Sign-off: approved

Gate: `/pr-check`, run over the branch range
`f473ce0b...HEAD` (merge-base with `splitstep-integration`). The working
tree was clean at the start. Review fixes landed as **1c503f22**. Verdict:
**ready**, with one decision left to the author (finding C2 below).

## Gate results

| Stage | Result |
|---|---|
| 1 · lint | pass, 0 errors (35 existing warnings, none in this branch's files) |
| 1 · typecheck | pass |
| 1 · tests | pass: 4056 passed, 343 skipped |
| 2 · simplify | ran, and applied 2 cleanups (see below). The first attempt handed back before its review agents reported, so it was re-run with them in the foreground. |
| 2 · vercel-react-best-practices | triggered by 3 new `"use client"` lines and 5 new components. Every new client file sits inside an existing client tree, so no bundle regression. |
| 3 · code-review (medium) | 2 findings: C1 fixed, C2 left for the author |
| 3 · pipeline-guardrails-reviewer | clean |
| 3 · rls-boundary-reviewer | clean |
| 3 · supabase-postgres-best-practices | not triggered: no migrations and no schema change in range |
| 3b · eyes-on (ui-verifier) | **pass** on run 4, after one finding was fixed |
| Re-gate after fixes | pass: `check.sh gate` (lint, typecheck, full suite) before 1c503f22 |

## Findings and resolutions

**Code review**

- **C1 — fixed (1c503f22).** `getMatchPageHint` ignored the read error from
  `.maybeSingle()`, so a transient database error rendered "not found" for a
  real match. Before this branch, `getMatchDetailData` threw on the same error
  so `error.tsx` could offer a retry. The hint now throws on a read error.
- **C2 — open, author decision.** The match page's stepper
  (`analysis-steps-column.tsx`) shows Retry / Rebuild statistics / Try again
  to every viewer. The `/resubmit` and `/rederive` routes accept only the
  job's `created_by`. A coach or teammate viewing a player's upload who clicks
  would get "Job not found". The drawers already hide the action behind
  `canManage` / `canEdit`.
  - The old progress card had the same ungated Retry, so this is not a new
    regression for retry. It is new for Rebuild statistics.
  - The fix is to pass a `canAct` into `AnalysisSteps` from the page's
    `canManage(view)`. That changes what viewers see, which is why it is left
    for the author.

**Eyes-on (ui-verifier, verifier account, seeded recovery classes)**

- **Run 1 — unverifiable.** The harness's own `next dev` collided with
  another dev server for this checkout.
- **Run 2 — invalid.** Port 3000 had meanwhile become a different worktree's
  server, so the harness captured the wrong branch.
- **Run 3 — needs-work.** The 16 routes were captured from this worktree's
  own server, after the author re-seeded. The seed rows had been deleted from
  the database between 18:40 and 19:31 UTC, cause unknown.
  - **E1 — fixed (1c503f22).** The stalled `wait_or_ask` match page opened
    as "Sending for analysis… nothing else is needed from you", while the list
    ("Not sent") and the drawer said the job had stopped.
    - Cause: `analysisStepsView` decided "stalled" only from the client clock,
      which is null until its first 10 s tick.
    - Fix: an `uploaded` row carrying a server-classified `recovery` is
      treated as stalled from the first render.
    - Two specs that pinned the old null-clock rule were updated. Each now
      asserts both halves: stalled when classified, not stalled when
      unclassified.
- **Run 4 — pass.**
  - The stalled page opens stopped: title "Couldn't send for analysis", the
    allowance headline, and no action.
  - The retry and stats_unavailable pages are unchanged.

The pages run 3 confirmed as `[ok]`:
- `/dashboard`: the failed seeds are listed, and the trigger shows its unread
  dot.
- `/dashboard/matches`: Failed, Not sent and "Stats unavailable" in grey
  (T9).
- Each match page's stepper, for retry, upload_again, fix_recording and
  rederive. No rail and no "Window"/"Job" facts.
- stats_unavailable renders the report: the Statistics pane holds only the
  notice, with no zeroes (T17).
- All six matches drawers (`?match=`). Each has one primary button and the
  right recovery action; wait_or_ask and stats_unavailable get no action.
- `/dashboard/team/schedule` shows its designed empty state.
- `/design` shows all 15 stepper variants.
- 0 console errors on every page.

Screenshots were sent to the author (run 3 and run 4 of `scratchpad/eyes-on/out`).

**Simplify (applied in 1c503f22)**

- `waitOrAskVariant()` no longer takes an attempts parameter it never read.
  Its callers and the spec were updated.
- Card and drawer share one `stoppedCopy()` helper for a stopped step's copy.

**Guardrails and RLS (both clean)**

- The three wizard inputs are untouched.
- The §3.3 gate keeps its behaviour, plus the documented stats_unavailable
  exemption. The layout's hint picks only the skeleton.
- The activity feed turns the storage keys into booleans on the server. It
  keeps the `!inner` join and `scopeToWorkspace`.
- `/rederive` checks the signed-in user, then the creator (404), then
  whether the job is rebuildable, then claims it. The service-role client is
  created lazily.
- The reconcile sweep runs only over already-authorized matchIds, inside
  `after()`.
- Frozen files are untouched. The webhook change is only the documented
  `secureResults` extraction.
- The recorded guardrail exception matches the code.

## Success criteria (brief)

1. **Job 45ff4bd7 shows "Fix the recording" with no Retry; a manual resubmit
   POST is refused with no allowance used — met.** `classifyFailure` maps
   45ff4bd7 to `fix_recording` (T2 spec table). `resubmitJob` refuses every
   class but retry before any spend (T11). Eyes-on shows the fix_recording
   seed with "Upload a new recording" and no retry.
2. **An upload-stage failure offers "Upload again", never a Retry that 409s —
   met.** No video classifies as `upload_again` (T2). Eyes-on shows "Upload
   the video again" on the page and in the drawer, with no retry.
3. **A transient `derivation_failed` offers a rebuild that produces stats
   without another vendor submission — met in code and specs, not run live.**
   `/rederive` (T14) re-runs `deriveAndPublish` from the stored results;
   `tests/rederive-handler.spec.ts` covers the ladder. Eyes-on shows "Rebuild
   statistics"; it was not clicked, per the seed rules.
4. **A failed results download after vendor completion no longer sits at
   "Stats pending" forever — met in code and specs.** The T16 reconcile sweep
   retries once, then marks the job `RESULTS_DELIVERY_LOST` with a refund and
   the failure mail. Not exercised live.
5. **A stalled `uploaded` row shows its stored reason; vendor submit reasons
   reach the user; webhook-signature failures and SwingVision errors — met
   for the parts in scope.**
   - Stalled rows record a refusal code and keep the handler's reason (T12).
     Eyes-on shows the stored allowance note.
   - Webhook-signature 401s need no new code: the existing poll moves the job
     (design §"Webhook signature 401s").
   - SwingVision `process-match` errors were **deferred** in stage 02, so
     they are not part of this feature.
6. **An unreconciled score fold publishes with a visible caveat — met.**
   `deriveAndPublish` records `derivation_quality.fold` (T13), and the
   Statistics tab shows the caveat (T18). No live match currently carries it.
7. **No failure note shown to a user contains Azure XML, "Failed to fetch",
   "non-2xx" or a Postgres error string — met.**
   - `showsStoredNote` hides `DERIVATION_*` notes, and uncoded rows show
     class copy.
   - The copy specs grep every string.
   - Eyes-on: the upload_again seed stores "Failed to fetch", and the string
     appears on neither the page nor the drawer.
8. **A video below the vendor's frame-rate floor is stopped in the wizard
   before upload — met by dependency PR #290 (merged, synced in T1).** The
   average must be at least 29.97 fps. Note: this is a hard refusal, not the
   "warn" the design recorded; see build.md, T1 follow-up 2.
9. **The button shown and the route's decision come from the same
   server-side classification — met.** The page, drawers, list, tray and
   email all read `classifyFailure()` via `recoveryFields()`. `/resubmit` and
   `/rederive` refuse on the same function.

## Consciously left

- **C2.** The page offers recovery actions to viewers who aren't the
  uploader. This is the author's call (see above).
- **Recovery buttons implemented twice.** `RecoveryAction` +
  `RetryActionButton` (card) and `DrawerRecoveryAction` + `DrawerRequestButton`
  (drawer) map the classes to the same three requests and each carry their
  own POST / pending / error / refresh scaffold. Unifying them is a refactor
  with styling differences; it was too risky for the simplify pass.
  Candidate follow-up task.
- **Ceiling vs code order.** `waitOrAskVariant` decides by error code
  alone, so a row at the attempt ceiling that carries a quota code reads as
  allowance, not "Tried three times". simplify removed the unused attempts
  parameter. The ceiling check would have to be added back deliberately if
  wanted.
- **Copy.** The stalled-allowance body reads "Your stored note explains
  what's left and when it resets." It names an internal concept, and no
  separate note sits beside it. The upload_again drawer body also repeats its
  headline. Both are copy fixes.
- **Stale `deriving` row.** Nothing sweeps a stale `deriving` row. A platform
  kill mid-derivation leaves it stuck, and `/rederive` claims only
  `derivation_failed`. From the T14 / T16 follow-ups.
- **Not covered by eyes-on.** The harness cannot open some of these, so none
  was seen on screen:
  - the header Activity tray (the trigger has no URL)
  - the schedule event drawer (the test team has no events)
  - hover and pending states
  - the skeleton flash
  - the top of `/design`, which the beta dialog covers

  The tray is covered by offline render specs (`activity-tray-rows`) only.
- **Seed rows vanished.** The rows disappeared between runs; the cause is
  unknown.
- **Harness gap.** The harness does not warn when `EYES_ON_BASE_URL` points
  at another worktree's server.
- **Remove the seed rows after review:**
  `npx tsx scripts/eyes-on/seed-failure-classes.ts --cleanup --write`.

## Also consulted

- `work/video-failure-recovery/02_design/output/design.md` and
  `03_plan/output/plan.md`: to confirm that the SwingVision and
  webhook-signature items were deferred or out of scope.
- `.claude/tasks/claude-video-retry-failure-surfacing-055fd8.md`: task
  intent and routes for eyes-on.
- Source read to confirm findings:
  - `src/app/api/splitstep/jobs/[jobId]/rederive/{route,handler}.ts`
  - `src/lib/services/splitstep/{reconcile,derive-and-publish,persist-transcript,submit-match-video,refusal-code}.ts`
  - `src/app/dashboard/matches/(detail)/[matchId]/{layout,page}.tsx`
  - `src/lib/data/{match-page-hint-server,match-analysis,activity-server,match-detail-server}.ts`
  - `src/hooks/use-live-match-analysis.ts`
  - `src/components/dashboard/matches/match-detail/{recovery-action,analysis-steps-column,analysis-steps}.tsx/ts`
  - `src/components/dashboard/matches/drawer-sections.tsx`
- Live database (read-only): the seed-row existence checks.

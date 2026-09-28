# Build — video-failure-recovery

The queue has been fully worked through. The branch queue
`.claude/tasks/claude-video-retry-failure-surfacing-055fd8.md` holds 34 tasks,
and all 34 are `done`. None is `blocked`, `todo`, `next`, `doing` or `later`.

Stage 04 queued T1–T21. The author then added three batches through `/task-add`
while the build ran:

| Batch | Contents | Queue commit |
|---|---|---|
| T22–T26 | Analysis stepper redesign: the match page column, both drawers, and `/design` | 0f4f310d |
| T27–T29 | Match page loading skeleton that depends on the analysis status | 001c0649 |
| T30–T34 | Activity tray failed rows that follow the recovery class, direction E | c370a7ad |

These tasks were not in `04_tasks/output/tasks.md`. They extend the feature's
surfaces (every place a video failure shows) and are counted here.

## Task statuses

| Task | Title | Status | Commit |
|---|---|---|---|
| T1 | Sync onto splitstep-integration once both dependency branches merged | done | caf9d2c2 (+ d65a1ef0 bookkeeping) |
| T2 | Pure recovery classifier beside isInputRejected | done | 179c7978 |
| T3 | Carry recovery, note and attemptsUsed through loader, hook, schedule | done | a528c0a7 |
| T4 | Key ANALYSIS_FAILURE_COPY by recovery class | done | c3aace46 |
| T5 | RecoveryAction component | done | f533eb0e |
| T6 | Match page progress card renders the recovery class | done | 32b7dd6b |
| T7 | Drawers render the recovery class (keeping Retry primary) | done, after one block | a9f33362 blocked → 8f550657 amend → fc106ada |
| T8 | Matches list row action follows the recovery class | done | 927fc104 |
| T9 | Group stats-unavailable matches under Ready | done | e3e9ffe5 |
| T10 | Retire inputRejected and the old copy keys | done | c92e0935 |
| T11 | resubmitJob refuses every non-retry class | done | 07e4fb07 |
| T12 | Stalled uploaded rows record a refusal code and keep the reason | done | 8fcce3fa |
| T13 | Derivation failures carry a code; unreconciled folds recorded | done | c50e7426 |
| T14 | /rederive route | done | 3600f175 |
| T15 | Extract secureResults from the webhook | done | 3c20f8ac |
| T16 | Reconcile sweep recovers completed jobs whose results never landed | done | da700405 |
| T17 | Stats-unavailable match renders its page, not the progress card | done | b6ec7fa8 |
| T18 | Unreconciled-score caveat on the Statistics tab | done | f3b13e94 |
| T19 | Failure email uses class copy and skips stats-unavailable | done | 06ac954a |
| T20 | Guardrail exceptions recorded; stale pipeline docs corrected | done | e1e9af39 |
| T21 | Seed one failing job per recovery class for the eyes-on verifier | done | 020831b2 |
| T22 | AnalysisSteps reshaped into the wizard's card-free column (+ /design) | done | 2ecba065 (design baseline 1decda0c) |
| T23 | Stepper column mounted on the match page; old card retired | done | 58efca52 |
| T24 | Compact drawer Analysis steps + stalled "Try again" | done | fa24754f |
| T25 | Matches drawer draws the Analysis steps | done | cc58b86f |
| T26 | Schedule drawer draws the Analysis steps; AnalysisNotice retired | done | 42aa8f1d |
| T27 | Shared layout decision + cached status hint | done | da98fe4a |
| T28 | Stepper-column skeleton | done | 73627bfb |
| T29 | Layout streams a status-aware skeleton; group loading goes neutral | done | fcf484bd |
| T30 | analysisAction's Add video points at this match | done | 9b39f4b9 |
| T31 | Activity feed carries each failed row's recovery class | done | 26a6ed2d |
| T32 | Tray failure helpers (which rows, where, what it says) | done | c6b9729e |
| T33 | Tray rows become whole-row links with the stepper's marks | done | db317bce |
| T34 | Stalled hand-off shows as a tray failure row | done | e56ab669 |

Each task passed `check.sh gate`, which runs lint, typecheck and the full
Playwright suite, and then `task-completion-reviewer` before its commit.

One commit landed outside the queue: **71f0b988**. The author asked for it in
session and chose the copy with ux-copy. It makes two changes:
- A stalled `wait_or_ask` row in the tray now shows its cause (allowance,
  permission or ceiling) instead of the generic stalled title. The allowance
  line reuses the match page's "Not enough analysis time left this month".
- The design-system tray doc (`.skills/advantage-analytics-design/reference/chrome.md`)
  now matches the shipped tray.

The full gate passed before that commit.

## Commit range

`git log --oneline origin/splitstep-integration..HEAD` holds 49 commits. It
starts at `4e5510fd pipeline(video-failure-recovery): scaffold workspace` and
ends at `71f0b988`. The range covers:
- the pipeline stage commits for stages 01–04
- the T1 sync merge, which brought in dependency PRs #289 and #290
- the task and queue commits listed above

The current merge-base with `origin/splitstep-integration` is `f473ce0b`. The
base branch has since moved **32 commits ahead**, so stage 07 will need a sync
before opening the PR.

## Blocked items

None are still blocked. For the record, one task was blocked along the way:

- **T7** blocked at `a9f33362`. The mechanical gate failed at
  `tests/schedule-dual-outcomes.spec.ts:469`. The task's rules contradicted
  schedule-drawer behaviour that that spec pins:
  - the footer's blue primary "Retry"
  - the coach seeing an uncoded job note
  - the non-editor line "The match page has the details."

  The author chose to keep the existing behaviour. T7 was amended (8f550657)
  and re-run clean (fc106ada). Its stash `7fceca0f51e51ceb576021c6cef67184b6b42827`
  was superseded and can be dropped.

## Carried into review (from the run log's follow-ups)

These are ideas, not tasks. Stage 06 should look at the ones marked ★.

- ★ Run `rls-boundary-reviewer`: `activity-server.ts` (T31) now selects the
  storage-key columns server-side. They are reduced to booleans, and a spec
  checks that none reach items.
- ★ Eyes-on: the verifier's six seeded matches are live, seeded 2026-09-28
  ~18:40 UTC. Check each one:
  - The tray shows five stopped rows. `stats_unavailable` is absent.
  - `wait_or_ask` reads as stalled with "Not enough analysis time left this
    month".
  - Each match page shows the stepper, with the stepper skeleton while loading.
  - `stats_unavailable` shows the report, with the report skeleton.
  - The event drawer now also offers Rebuild statistics and the upload link
    (T7 follow-up).
- ★ A stale `deriving` row is never swept. A platform kill during derivation
  leaves it stuck, because `/rederive` only claims `derivation_failed`. Found
  in T14 and T16; still open.
- A missing or forbidden match renders not-found with a 200 status, because the
  group `loading.tsx` streams first. This was pre-existing and is noted by T29.
- `waitOrAskVariant` decides by error code first. A ceiling row that carries a
  quota code reads as allowance (T6 follow-up).
- A stalled row's class is fixed at load or on a live event. A page left open
  doesn't flip at the 3-minute threshold (T3 follow-up).
- Two copies of `storeVendorJson` exist (T15). `processing_jobs.sas_expires_at`
  is never written (T16).
- `canRetryAnalysis()` has no callers (T7 follow-up).
- The header of `ui-revamp-guardrails.md` still reads "current as of
  2026-08-15" (T20).
- The eyes-on seed rows are removed with
  `npx tsx scripts/eyes-on/seed-failure-classes.ts --cleanup --write`, which
  the author runs after review.

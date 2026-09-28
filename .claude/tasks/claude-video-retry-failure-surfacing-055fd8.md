# Tasks — claude/video-retry-failure-surfacing-055fd8

> Scope: video-failure-recovery pipeline (work/video-failure-recovery) — one recovery class per failed video job, retry only where it can help, every failure surfaced in plain copy.

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

## T1 · Sync onto splitstep-integration once both dependency branches have merged

- **status:** done
- **model:** sonnet
- **files:** none beyond the merge commit (guess)
- **done when:**
  - [ ] `git merge-base --is-ancestor claude/advantage-intelligence-ui-e6e2f7 HEAD` exits 0
  - [ ] `git merge-base --is-ancestor claude/match-analysis-failure-retry-8769f3 HEAD` exits 0, or, if that branch merged without T2/T3, `git log origin/splitstep-integration --oneline | grep "T1: Refuse to resubmit an invalid_input failure"` matches and HEAD contains it
  - [ ] `grep -n "export function isInputRejected" src/lib/data/match-analysis.ts` and `grep -n '"input_rejected"' src/lib/services/splitstep/resubmit-job.ts` both match on HEAD
  - [ ] `npx tsc --noEmit` passes
- **notes:** Plan step 0. `later` on purpose: promote to `todo` by hand only after both branches are in `origin/splitstep-integration`; every other task needs this one, so the queue is inert until then. Sync with the host `sync_with_base_branch` tool where available, else `git merge origin/splitstep-integration`. T2+ were written against T10 (05b36eb8) and T1 (e0ae397c) as of 2026-09-27. If the merged T11/T12 differ from their task specs, later tasks adapt names to the merged code — do not re-open the design.

## T2 · Add the pure recovery classifier beside isInputRejected

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/data/match-analysis.ts, src/lib/services/splitstep/resubmit-job.ts (move-out only), tests/match-analysis-input-rejected.spec.ts (guess)
- **done when:**
  - [ ] `match-analysis.ts` exports `RecoveryClass` (`retry | upload_again | fix_recording | wait_or_ask | rederive | stats_unavailable`), `classifyFailure(input)` implementing the design's six rules in order, and `showsStoredNote(errorCode)` (true iff non-null and not prefixed `DERIVATION_`)
  - [ ] `isDownloadFailure` and `MAX_TOTAL_ATTEMPTS` are defined in `match-analysis.ts` and re-exported from `resubmit-job.ts`; `grep -rn "export function isDownloadFailure" src` matches only `match-analysis.ts`; `src/app/api/webhooks/splitstep/route.ts` and `reconcile.ts` are not in the diff
  - [ ] The spec gains a `classifyFailure` table asserting the ten live rows from the design (45ff4bd7 → fix_recording; e6e8dea4 → retry; 70748f2a, cca2efbe, f91bad2c, eb7f9fe5, 6b7406fa → upload_again; b74a1e04 → stats_unavailable; c1d36200 with `QUOTA_EXCEEDED` → wait_or_ask; 85518306 → retry), plus: no video + invalid_input → upload_again; retry with `attemptsUsed: 3` → wait_or_ask; `DERIVATION_ERROR` → rederive; unknown `video_quality` code → retry
  - [ ] A `showsStoredNote` truth table is in the spec, the existing `isInputRejected` cases pass unedited, and `npx tsc --noEmit` passes
- **notes:** Design §Architecture + §1; plan step 1. `match-analysis.ts` must stay free of server imports (client components use it). Rules: stalled uploaded → QUOTA_EXCEEDED/NOT_ELIGIBLE/NO_BILLING_WORKSPACE wait_or_ask else retry; failed & no video → upload_again; failed & isDownloadFailure → retry; failed & isInputRejected → fix_recording; failed else → retry (ceiling → wait_or_ask); derivation_failed DERIVATION_ERROR → rederive else stats_unavailable. Guardrails §3.2: the three predicates stay untouched.

## T3 · Carry recovery, note and attemptsUsed through the loader, live hook and schedule data

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/lib/data/match-analysis-server.ts, src/hooks/use-live-match-analysis.ts, src/lib/data/schedule-server.ts, src/lib/schedule/types.ts, src/lib/data/match-analysis.ts (`MatchAnalysis` type), tests/match-analysis-input-rejected.spec.ts (guess)
- **done when:**
  - [ ] `loadMatchAnalysis`'s select adds `error_code, error_step, video_object_key, results_object_key, resubmitted_from_job_id`; the keys become `hasVideo`/`hasResults` booleans inside the loader and `grep -n "video_object_key\|results_object_key" src/lib/data/match-analysis.ts` finds no field on `MatchAnalysis`
  - [ ] `MatchAnalysis` and `EntryMatch` gain `recovery` and `note` (stored `error_message` only when `showsStoredNote` allows); `inputRejected` is still present on both
  - [ ] `attemptsUsed` comes from an exported pure chain-count helper; the spec asserts a three-row chain → 3 and an unrelated earlier upload for the same match is not counted
  - [ ] Spec cases for `liveAnalysisPatch`: no-video failed row → `upload_again`; stalled uploaded row with `QUOTA_EXCEEDED` → `wait_or_ask` with note present; uncoded "Failed to fetch" failed row → note undefined. `npx tsc --noEmit` passes
- **notes:** Design §1; plan step 2. Realtime rows carry no chain: `withLiveAnalysis` passes the base analysis's `attemptsUsed`, +1 when the live row is a new job with `resubmitted_from_job_id` set. Guardrails §3.2 — one function for both paths (the `withStatsPublished` lesson). `inputRejected` is retired in T10, not here.

## T4 · Key ANALYSIS_FAILURE_COPY by recovery class

- **status:** done
- **model:** sonnet
- **needs:** T2
- **files:** src/components/dashboard/matches/analysis-failure-copy.ts, tests/analysis-failure-copy.spec.ts (guess)
- **done when:**
  - [ ] The module exports a `byClass` map with, for every `RecoveryClass`, a title, card body, drawer body and action label (or null); `retry`, `fix_recording` and `stats_unavailable` reference T8/T11's existing strings rather than new text
  - [ ] New entries match the plan's copy: `upload_again` (title "The video didn't finish uploading", action "Upload the video again"), `rederive` (title "Statistics didn't finish building", action "Rebuild statistics"), and `wait_or_ask` with allowance, permission ("ask your team's owner") and ceiling variants
  - [ ] The spec asserts every `RecoveryClass` has an entry, every string matches `/splitstep|swingvision|edge function|failed to fetch|<\?xml/i` zero times, and the `upload_again` and `fix_recording` bodies do not contain "Retrying"
  - [ ] The old top-level `failed` / `derivation_failed` keys still exist, and `npx tsc --noEmit` passes
- **notes:** Design §2; plan step 3. Customer strings never name the vendor (guardrails §2); "Advantage Intelligence" is the only provider name. Old keys are removed in T10.

## T5 · Add the RecoveryAction component

- **status:** done
- **model:** sonnet
- **needs:** T2, T4
- **files:** src/components/dashboard/matches/match-detail/recovery-action.tsx (new), tests/recovery-action.spec.ts (new; pattern tests/drawer-sections.spec.ts + tests/fixtures/vm-modules.ts) (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `RecoveryAction({ recovery, jobId, matchId, variant, stalled })` renders `RetryActionButton` → `/api/splitstep/jobs/${jobId}/resubmit` for `retry` on a failed row, `RetrySubmission` for `retry` on a stalled row, and `RetryActionButton` → `/api/splitstep/jobs/${jobId}/rederive` for `rederive`
  - [ ] `upload_again` and `fix_recording` render a `next/link` to `addVideoHref(matchId)` styled with `advButton()`; `wait_or_ask`, `stats_unavailable` and `null` render nothing
  - [ ] `tests/recovery-action.spec.ts` renders each class through `createLoader` and asserts the expected marker, href or empty markup; `grep -n "rounded-full" src/components/dashboard/matches/match-detail/recovery-action.tsx` finds none
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 4. Read `.skills/advantage-analytics-design/SKILL.md` and `reference/components.md` first. Primary buttons come from `advButton()` (`src/lib/ui/adv-button.ts`). The widget-states hook will fire on this dashboard file.

## T6 · Match page progress card renders the recovery class

- **status:** done
- **model:** opus
- **needs:** T3, T4, T5
- **files:** src/components/dashboard/matches/match-detail/match-analysis-progress.tsx, tests/analysis-failure-copy.spec.ts (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] The failed block and the stalled branch render `byClass[recovery]` (headline `note ?? title`, card body) and `<RecoveryAction>`; `grep -n "inputRejected\|RetryAnalysis\|addVideoHref" src/components/dashboard/matches/match-detail/match-analysis-progress.tsx` finds none
  - [ ] Spec: an uncoded failed row with `error_message` starting `<?xml` and `hasVideo: false` renders the upload_again title and the upload link, and the markup contains neither `<?xml` nor `data-component="RetryActionButton"`
  - [ ] Spec: 45ff4bd7's row keeps "The video must be at least 29.9 fps." as the headline with no retry marker; e6e8dea4's row renders the retry action; the stalled quota row renders its stored note and no retry
  - [ ] T8/T11's existing cases are moved to class inputs with their assertions kept, and `ANALYSIS_LABEL` and the milestone rendering are not in the diff; `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 5. One surface only — the drawers are T7. Guardrails §3.3: `page.tsx`'s short-circuit is T17's, not this task's.

## T7 · Drawers render the recovery class through RecoveryAction

- **status:** done
- **model:** opus
- **needs:** T3, T4, T5
- **files:** src/components/dashboard/matches/drawer-sections.tsx (`AnalysisNotice`), src/components/dashboard/matches/match-drawer.tsx, src/components/dashboard/schedule/event-line-drawer.tsx, src/lib/schedule/types.ts, src/lib/data/schedule-server.ts, tests/drawer-sections.spec.ts, tests/fixtures/schedule-dual-outcomes-data.ts (guess)
- **routes:** /dashboard/matches, /dashboard/team/schedule/[eventId]
- **done when:**
  - [ ] For a viewer who can act (`canManage !== false` in the match drawer, `canEdit` in the event drawer), `AnalysisNotice`'s failure block renders headline `note ?? byClass[recovery].title` and the class drawer body (wait-or-ask through `waitOrAskVariant`); it no longer branches on `inputRejected` and never renders the raw `failNote`
  - [ ] For a viewer who cannot act, the failure block keeps today's behaviour: the class title as headline, the body "The match page has the details.", no note, no "Retrying" text and no action
  - [ ] The recovery action for `retry` stays the footer's primary button labelled exactly "Retry" (today's `RetryButton` styling), `rederive` uses the same primary styling labelled "Rebuild statistics", and `upload_again` / `fix_recording` take that primary slot with the upload link; `wait_or_ask` and `stats_unavailable` add no action, and no drawer ever holds two primaries
  - [ ] `tests/schedule-dual-outcomes.spec.ts` passes unedited, with its S4 fixture in `tests/fixtures/schedule-dual-outcomes-data.ts` given the loader-produced fields (`recovery: "retry"`, `note` equal to its `failNote`, a vendor `errorCode`) beside `failNote`; `tests/drawer-sections.spec.ts` moves T9/T12's cases to class inputs and adds an upload_again case with a manager (upload link, no "Retrying")
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 6. Amended 2026-09-28 by the author after the first run was blocked: keep the existing drawer behaviour pinned by `tests/schedule-dual-outcomes.spec.ts` (T23 "footer follows the Matches drawer") — Retry is the footer primary labelled "Retry", and non-editors see only "The match page has the details." The first run's work is stash `7fceca0f51e51ceb576021c6cef67184b6b42827` (`git stash show -p 7fceca0f`) — a usable starting point for the class-copy and `EntryMatch.errorCode`/`attemptsUsed` plumbing, but its outline "Retry analysis" button and everyone-sees-the-body rule are what this amendment reverses.

## T8 · Matches list row action follows the recovery class

- **status:** done
- **model:** sonnet
- **needs:** T2
- **files:** src/lib/data/match-analysis.ts (`analysisAction`), tests/match-analysis-timeline.spec.ts (guess)
- **done when:**
  - [ ] `analysisAction` returns add-video for `upload_again` and `fix_recording`, a View-the-match action for `retry` and `rederive`, and "View stats" for `stats_unavailable`
  - [ ] `tests/match-analysis-timeline.spec.ts` asserts each class's action, and asserts "Start over" is not returned for a failed row that has a video
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §3 (flagged out-of-scope by T8 on advantage-intelligence-ui); plan step 7a.

## T9 · Group stats-unavailable matches under Ready in the matches list

- **status:** done
- **model:** sonnet
- **needs:** T3
- **files:** src/components/dashboard/matches/matches-page-content.tsx (grouping only, ~117-122), a spec for the grouping helper (guess)
- **routes:** /dashboard/matches
- **done when:**
  - [ ] A row with `recovery === "stats_unavailable"` groups under "Ready", not "Failed", and its status label reads "Stats unavailable"
  - [ ] The grouping decision lives in an exported pure helper (extracted beside the grouping if none exists) with a unit spec covering `stats_unavailable`, `retry` (Failed) and a completed row (Ready)
  - [ ] `git diff --stat` shows no other region of `matches-page-content.tsx` changed beyond the grouping and the helper's import; `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 7b. `matches-page-content.tsx` is very large — touch only the grouping lines (task-size guidance: one surface, small diff).

## T10 · Retire inputRejected and the old copy keys

- **status:** done
- **model:** sonnet
- **needs:** T6, T7, T8
- **files:** src/lib/data/match-analysis.ts, src/lib/data/match-analysis-server.ts, src/hooks/use-live-match-analysis.ts, src/lib/schedule/types.ts, src/lib/data/schedule-server.ts, src/components/dashboard/matches/analysis-failure-copy.ts, affected specs (guess)
- **done when:**
  - [ ] `MatchAnalysis.inputRejected`, `EntryMatch.inputRejected` and the `inputRejected` field on the live patch are removed; `isInputRejected` and `INPUT_REJECTED_CATEGORY` remain exported
  - [ ] `grep -rn "inputRejected" src` matches only the `isInputRejected` function name and its call sites
  - [ ] `grep -rn "ANALYSIS_FAILURE_COPY\.\(failed\|derivation_failed\)" src` finds none
  - [ ] `npx tsc --noEmit` and `npm test` pass
- **notes:** Design §1, §2; plan step 8. Mechanical cleanup once every consumer reads `recovery`.

## T11 · resubmitJob refuses every non-retry class

- **status:** done
- **model:** sonnet
- **needs:** T2
- **files:** src/lib/services/splitstep/resubmit-job.ts, tests/resubmit-authorization.spec.ts (guess)
- **done when:**
  - [ ] The parent select adds `error_code` and `error_step`, and T1's `invalid_input` check is replaced by one `classifyFailure` check (with `attemptsUsed: 0`; the existing `attempt_ceiling` gate stays after it)
  - [ ] Refusals map to existing reasons only: `fix_recording` → `input_rejected` (T1's message kept), `upload_again` → `video_unavailable` with T4's upload_again body, other non-retry classes → `not_failed`; `ResubmitRefusalReason` gains no member and `REFUSAL_STATUS` in `resubmit/route.ts` is not in the diff
  - [ ] New spec cases: a no-video parent refuses `video_unavailable` with the plain message before any blob HEAD; an `INTERNAL_ERROR` parent with video is still accepted; each refusal writes no row, reserves nothing and sends no vendor body
  - [ ] T1's existing `input_rejected` cases pass unedited and `npx playwright test tests/resubmit-authorization.spec.ts` passes
- **notes:** Design §4; plan step 9. The `auto` path passes through the same check; `isDownloadFailure` ⊂ retry, so auto-retry behaviour is unchanged. Guardrails §2: `resubmit-job.ts` is frozen integration code — this is a refusal only; recorded in T20.

## T12 · Stalled uploaded rows record a refusal code and keep the handler's reason

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** src/lib/services/splitstep/submit-match-video.ts (~443-462), tests/submit-refusal-code.spec.ts (new) (guess)
- **done when:**
  - [ ] `submit-match-video.ts` exports a pure `refusalCodeFor(status)`: 429 → `QUOTA_EXCEEDED`, 403 → `NOT_ELIGIBLE`, 422 → `INVALID_METADATA`, 503 → `NOT_CONFIGURED`, anything else → null; the spec covers each plus 502 and 409
  - [ ] On a refusal that leaves the row `uploaded`, the update writes `error_code: refusalCodeFor(status)` alongside `error_message`
  - [ ] On a 502 the client no longer writes `error_message` (the handler already marked the row failed with the vendor text)
  - [ ] No update object this task touches contains `status`; `npx tsc --noEmit` passes
- **notes:** Design §5; plan step 10. The browser holds UPDATE on `processing_jobs.error_code` (verified 2026-09-27 via `column_privileges`), so no migration. Guardrails §3.1: a submit failure must not mark the job failed.

## T13 · Derivation failures carry a code; unreconciled folds are recorded

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/splitstep/derive-and-publish.ts, tests/derive-and-publish-codes.spec.ts (new; fake supabase in the style of tests/resubmit-authorization.spec.ts) (guess)
- **done when:**
  - [ ] A persist-transcript refusal writes `status: "derivation_failed", error_code: "DERIVATION_REFUSED"`; an RPC error or a throw writes `error_code: "DERIVATION_ERROR"`; success clears `error_code` with `error_message`
  - [ ] An unreconciled grade merges `{ fold: { reconciled: false, reason } }` into the job's `derivation_quality`, leaving existing keys (`grade`, `checks`, `failures`, …) intact
  - [ ] `tests/derive-and-publish-codes.spec.ts` asserts all four behaviours above
  - [ ] The `calculate_match_stats` and `backfill_returns_in_and_net_points` call sites are unchanged in the diff; `npx tsc --noEmit` passes
- **notes:** Design §6, §8; plan step 11. Guardrails §2: `calculate_match_stats` is called, never edited. `derivation_quality` jsonb already exists and is written at grade time — no migration.

## T14 · Add the /rederive route

- **status:** done
- **model:** opus
- **needs:** T2, T13
- **files:** src/app/api/splitstep/jobs/[jobId]/rederive/route.ts (new, wiring), src/app/api/splitstep/jobs/[jobId]/rederive/handler.ts (new, decision), tests/rederive-handler.spec.ts (new), MAP.md (api list) (guess)
- **done when:**
  - [ ] The handler, with injected I/O, returns 401 when signed out and 404 for a missing job or one whose `created_by` is another user, mirroring `resubmit/route.ts`'s ladder
  - [ ] It returns 409 unless `status = derivation_failed`, `classifyFailure` = `rederive` and `results_object_key` is set, and 409 when the conditional claim (`deriving` where `status = 'derivation_failed'`) updates zero rows
  - [ ] On success it calls `deriveAndPublish` exactly once with a deadline, and `route.ts` sets `maxDuration = 60`
  - [ ] `tests/rederive-handler.spec.ts` covers 401, 404, 409 for DERIVATION_REFUSED, 409 on a lost claim, and success; MAP.md's hand-written api list names the route; `npm run map` leaves no diff and `npx tsc --noEmit` passes
- **notes:** Design §6; plan step 12. Read `node_modules/next/dist/docs/` for route segment config first (AGENTS.md). Re-derive is safe to repeat: `persist-transcript.ts` deletes the match's derived points before inserting. No allowance, no attempt counted. Guardrails §2: the route.ts/handler.ts split is the frozen-path pattern.

## T15 · Extract the webhook's results-securing step into secureResults

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/app/api/webhooks/splitstep/route.ts (the ~441-476 block only), src/lib/services/splitstep/secure-results.ts (new), tests/secure-results.spec.ts (new) (guess)
- **done when:**
  - [ ] `secureResults({ supabase, jobId, strokesUrl, io })` performs the results download and `finalize_splitstep_results` call and returns the `resultsSecured` boolean
  - [ ] The webhook route calls it in place of the moved block; `git diff src/app/api/webhooks/splitstep/route.ts` shows only that replacement plus its import
  - [ ] `tests/secure-results.spec.ts` with an injected fetch asserts success sets `results_object_key`, and a download failure writes `processing_error` and returns false
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §9; plan step 13a. Behaviour must be identical — same logs, same `processing_error` write. If `SPLITSTEP_WEBHOOK_SECRET` is set, also run `npx tsx scripts/splitstep-webhook-test.ts` against a local dev server and record the result (or "skipped: no secret") in the step's commit body. Guardrails §2: the webhook route is frozen — extraction only, recorded in T20.

## T16 · Reconcile sweep recovers completed jobs whose results never landed

- **status:** done
- **model:** opus
- **needs:** T13, T15
- **files:** src/lib/services/splitstep/reconcile.ts, the `reconcileBeforePageRead` caller, tests/reconcile-results-sweep.spec.ts (new) (guess)
- **done when:**
  - [ ] A second, separately capped (2 per read) query selects `status = completed`, `results_object_key is null`, `derivation_version is null`, `completed_at` older than 10 minutes
  - [ ] Each row either runs `secureResults` then `deriveAndPublish`, or — when `sas_expires_at` has passed or a second attempt fails — is marked `failed` / `RESULTS_DELIVERY_LOST` by a conditional update on `status = completed`
  - [ ] The sweep's work is scheduled with `after()`, so the page-read path does not await it
  - [ ] `tests/reconcile-results-sweep.spec.ts` with injected I/O asserts: a fresh row secures and derives; an expired URL marks `RESULTS_DELIVERY_LOST`; a row whose status changed mid-sweep is left alone (conditional update matches 0 rows); `npx tsc --noEmit` passes
- **notes:** Design §9; plan step 13b. Confirm in `node_modules/next/dist/docs/` that `after` is callable from the Server Component path that calls `reconcileBeforePageRead` before wiring. The existing polling path (`POLLABLE_STATUSES`) is unchanged. Webhook 401s need no new code — the existing poll already reaches `RESULTS_DELIVERY_LOST`.

## T17 · A stats-unavailable match renders its page instead of the progress card

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/app/dashboard/matches/(detail)/[matchId]/page.tsx (short-circuit ~226-227, ~268-307), src/components/dashboard/matches/match-detail/match-report-context.tsx, src/components/dashboard/matches/match-detail/statistics-view.tsx, tests/match-film-entry.spec.ts (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `isAwaitingAnalysis` excludes `analysis.recovery === "stats_unavailable"`, and every other in-flight or failed class still short-circuits
  - [ ] `meta` gains `statsUnavailable`; with it set, `statistics-view.tsx` renders the `stats_unavailable` copy in the `UnpublishedStatsNotice` slot and no stat section
  - [ ] `tests/match-film-entry.spec.ts`'s source-order assertion still passes, and a new assertion checks the short-circuit condition references `stats_unavailable`
  - [ ] A vm-modules render of `statistics-view.tsx` with `statsUnavailable` contains the note and none of the stat-section components; `npx tsc --noEmit` passes
- **notes:** Design §7; plan step 14. Run `trace-route` for `/dashboard/matches/[matchId]` first and confirm Film and Visualizations handle zero points without drawing zeroes. Guardrails §3.3 is amended in T20. User decision 2026-09-27: deterministic derivation failures must not block the match.

## T18 · Show the unreconciled-score caveat on the Statistics tab

- **status:** done
- **model:** sonnet
- **needs:** T13, T17
- **files:** src/lib/data/match-detail-server.ts, src/components/dashboard/matches/match-detail/match-report-context.tsx, src/components/dashboard/matches/match-detail/statistics-view.tsx, src/components/dashboard/matches/match-detail/unpublished-stats-notice.tsx (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `match-detail-server.ts` reads `derivation_quality->fold` for the match's completed job and exposes `meta.foldUnreconciled`
  - [ ] With the flag, `statistics-view.tsx` renders a `noteStripCls` strip whose text starts "Advantage Intelligence couldn't match every point to the final score you entered", and `UnpublishedStatsNotice` omits its "checked against the final score" clause
  - [ ] A vm-modules render spec asserts both with the flag set, and that markup without the flag contains no strip and keeps the original clause
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §8; plan step 15. Match page only. Jobs derived before T13 carry no flag and show nothing — no backfill (guardrails §2).

## T19 · Failure email uses class copy and skips stats-unavailable

- **status:** done
- **model:** sonnet
- **needs:** T2, T4
- **files:** src/lib/services/notifications/analysis-mail.ts, src/lib/services/email/templates/analysis.ts, tests/analysis-mail-copy.spec.ts (new unless a spec exists) (guess)
- **done when:**
  - [ ] `analysis-mail.ts` selects the columns `classifyFailure` needs and passes the class to the template; no failure email is sent for `stats_unavailable` (the function returns a "not sent" result)
  - [ ] The template renders the class title and body, and the stored note only when `showsStoredNote` allows; `error_code` and `failed · ${error_step}` no longer appear in user-visible output
  - [ ] The spec renders an uncoded "Failed to fetch" row (raw string absent) and 45ff4bd7's row (vendor note present), and asserts the `stats_unavailable` "not sent" path
  - [ ] `src/lib/services/email/shell.ts` is not in the diff; `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 16. Read `docs/email-system.md` first.

## T20 · Record the guardrail exceptions and correct stale pipeline docs

- **status:** done
- **model:** sonnet
- **needs:** T11, T12, T13, T14, T15, T16, T17, T18
- **files:** docs/ui-revamp-guardrails.md (§2, §3.3), docs/video-pipeline-overview.md (~603-615) (guess)
- **done when:**
  - [ ] §2 gains one reviewed-exception entry naming `resubmit-job.ts`, `submit-match-video.ts`, `derive-and-publish.ts`, the `/rederive` route and handler, `secure-results.ts` with the webhook extraction, and `reconcile.ts`, each with what the change is (refusal, code write, code and flag write, new route, extraction, sweep)
  - [ ] §3.3 gains a note that the short-circuit exempts `stats_unavailable` only
  - [ ] `docs/video-pipeline-overview.md` no longer states that the error columns or the vendor status endpoint are unused
  - [ ] Every file named in the §2 entry appears in `git diff --stat origin/splitstep-integration`, and `npm run format:check` passes
- **notes:** Design §Guardrails bookkeeping; plan step 17. Follow the format of the existing 2026-09-26 and 2026-09-27 exception entries.

## T21 · Seed one failing job per recovery class for the eyes-on verifier

- **status:** done
- **model:** opus
- **needs:** T20
- **files:** scripts/eyes-on/seed-failure-classes.ts (new) (guess)
- **done when:**
  - [ ] The script defaults to dry-run and prints the rows it would write; writing requires an explicit `--write` flag
  - [ ] It resolves the verifier account from `EYES_ON_EMAIL` and only inserts or updates `matches` / `processing_jobs` rows whose `created_by` is that account, one job per `RecoveryClass`
  - [ ] A `--cleanup` mode deletes exactly the rows the script created (identified by a marker it writes), and a dry run of `--cleanup` lists them
  - [ ] `npx tsc --noEmit` passes
- **notes:** Plan Test strategy. **Author decision required before promoting to `todo`:** this writes to the production database. Nothing depends on it; `/pr-check` Stage 3b can run without it on the real rows the verifier can see, at lower coverage.

## T22 · Reshape AnalysisSteps into the wizard's card-free column and show it on /design

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/analysis-steps.ts, src/components/dashboard/matches/match-detail/analysis-steps-card.tsx (rename allowed, e.g. analysis-steps-column.tsx), src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx (MatchLine extraction only), src/components/dashboard/matches/match-line.tsx (new), src/components/dashboard/matches/match-detail/match-analysis-progress.tsx (copy imports only), src/app/design/analysis-steps-preview.tsx, tests/analysis-steps-column.spec.ts (new) (guess)
- **routes:** /design
- **done when:**
  - [ ] `AnalysisSteps` renders a wrapper with `max-w-[488px]`, `px-6` and `pt-[clamp(64px,18vh,176px)]`, an `<h1>` title with `text-[24px]` + `font-light` + `tracking-[-0.3px]`, a 13px `--ink-600` match line "{player} vs {opponent} · Won|Lost <ScoreLine>", then the four `VerticalStep` rows from `analysisStepsView` — and none of `--radius-card`, `--shadow-card`, `--border-card`, an "Analysis" eyebrow `<h2>`, or a `<dl>` of Video/Window/Job/Stage facts
  - [ ] The match line is one shared component (plain props: player, opponent, `won: boolean | null`, sets) imported by both `UploadMatchSuccess.tsx` and `AnalysisSteps`; the wizard's file-local `MatchLine` is gone and the markup it renders is unchanged
  - [ ] `STAGE_NOTE` and `STALLED_RETRY_COPY` are declared only in `analysis-steps.ts` (`grep -rn "Turning detected strokes into points\|This hasn't been sent for analysis yet" src` hits only that file) and `match-analysis-progress.tsx` imports both; the "Verbatim. That file still owns them" comment is gone
  - [ ] `AnalysisSteps` keeps `MatchAnalysisProgress`'s live behaviour: it merges `useLiveMatchAnalysis` patches through `withLiveAnalysis` gated on `isLiveUpdating` of the server status, and its clock starts null and is only ever set from an interval (never during render)
  - [ ] A new vm-modules spec (`tests/fixtures/vm-modules.ts`) renders `AnalysisSteps` for uploading, processing, failed retry, failed upload_again and stalled retry: each render has exactly one `<h1>`, four `<li`, the failure headline and the `RecoveryAction` markup inside the failing `<li>`, and no "Window"/"Job" text; `/design`'s `AnalysisStepsPreview` renders every VARIANT through the new column with a fixed match line and no card wrapper; `npx tsc --noEmit` passes
- **notes:** Approved design 2026-09-28 (artifact https://claude.ai/artifact/Fn78DpgqH2PbRDGeEM5qtt, `Page-*` frames); baseline preview 1decda0c. Does not mount anything on the match page (T23). `tests/analysis-steps-view.spec.ts` must pass unedited — the view model does not change here. Never read `failNote`. The upload ETA stays the measured-progress projection `uploadEtaSeconds`; no other estimate. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first; buttons stay `RecoveryAction`/`advButton()`, no `rounded-full` except `StepMark`'s own.

## T23 · Mount the column on the match page and retire MatchAnalysisProgress

- **status:** done
- **model:** opus
- **needs:** T22
- **files:** src/app/dashboard/matches/(detail)/[matchId]/page.tsx (the `if (isAwaitingAnalysis)` branch, ~300-335), src/components/dashboard/matches/match-detail/match-analysis-progress.tsx (delete), tests/analysis-failure-copy.spec.ts, tests/uploading-progress-parity.spec.ts, tests/match-film-entry.spec.ts, docs/ui-revamp-guardrails.md (§3.3 wording) (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] The `if (isAwaitingAnalysis)` branch returns T22's column with `analysis`, `matchId`, and a match line built from `getMatchSides(match, statsResult)` (viewer's side first, result stated from the viewer's side); the source slice from that `if` to `<MarkReportSeen` contains none of `MatchReportRail`, `MatchReportScoreboard`, `ShareMatchButton`, `FilmTab`, `MatchReportViewSwitcher`
  - [ ] The `statsUnavailable` and `isAwaitingAnalysis` declarations are byte-identical to before; `match-film-entry.spec.ts`'s "a stats_unavailable match is let past the short-circuit, and only it" test passes unedited, and its "the analysing short-circuit still returns before any Film entry" test changes only the `<MatchAnalysisProgress` marker to the new component (gate-before, `<FilmTab`-after, condition-string and no-FilmTab/no-switcher checks all kept)
  - [ ] `match-analysis-progress.tsx` is deleted and `grep -rn "MatchAnalysisProgress" src tests docs/ui-revamp-guardrails.md` finds nothing; §3.3 names the new component with the rest of its gate wording unchanged
  - [ ] `analysis-failure-copy.spec.ts`'s panel cases (stats_unavailable, retry, fix_recording, upload_again with `<?xml`, 45ff4bd7, e6e8dea4, stalled quota, stalled permission, stalled uncoded) render the new component and keep every assertion (headline, body, action or its absence, no `<?xml`, no `RetryActionButton` marker where there is none today, no raw `failNote`); `uploading-progress-parity.spec.ts` points `PANEL` at the new file and keeps its title, step order, floored-percent, both-notes and one-copy-module checks — the only loosened assertion is the step count 3 → 4 (the Stats step)
  - [ ] `npx tsc --noEmit` passes
- **notes:** Guardrails §3.3: the gate stays; only what it renders changes. stats_unavailable keeps T17's full page. On this branch only the app chrome (icon rail + header) shows; the normal report and its rail return once stats are ready. Layout's `MatchDataProvider` untouched; `MatchReportProvider` can be dropped from this branch if nothing inside needs it. The match line's side orientation is attribution-sensitive — use the scoreboard's source (`getMatchSides`), never raw `player1`/`player2`. `tests/report-empty-states.spec.ts` does not reference these components and needs no change.

## T24 · Add the compact drawer Analysis steps and the stalled "Try again" action

- **status:** done
- **model:** opus
- **needs:** T22
- **files:** src/components/dashboard/matches/match-detail/analysis-steps.ts, src/components/dashboard/matches/drawer-sections.tsx (new `DrawerAnalysisSteps`, `DrawerRecoveryAction`), tests/analysis-steps-view.spec.ts, tests/drawer-sections.spec.ts (guess)
- **done when:**
  - [ ] A pure drawer projection in `analysis-steps.ts` takes `(analysis, now, canAct)` and returns the same four step keys, labels and states as `analysisStepsView` (null for a status that is not in flight, failed or stalled); the uploading step's value is the floored percent with no body; the running step's note is `STAGE_NOTE`'s line, except processing, which reads "This fills in as soon as the analysis lands."
  - [ ] Its stopped step, stalled included: with `canAct`, headline `note ?? title` and the class's `drawerBody` (wait_or_ask via `waitOrAskVariant`; a stalled retry uses `STALLED_RETRY_COPY.title` and a new `STALLED_RETRY_COPY.drawerBody` "Trying again costs nothing; nothing needs uploading again."); without `canAct`, "Analysis stopped" and `DRAWER_NO_ACTION_BODY` and no note — `tests/analysis-steps-view.spec.ts` asserts each, and that a raw `failNote` never appears
  - [ ] `DrawerAnalysisSteps` in `drawer-sections.tsx` renders an "Analysis" eyebrow and an `<ol aria-label="Progress">` of 12px labels using `StepMark` from `vertical-steps.tsx`; the stopped step's text sits in exactly one `role="alert"` element (`role="status"` for a stalled hand-off); it imports no `AnalysisProgressTrack` and adds no `rounded-full`
  - [ ] `DrawerRecoveryAction` takes `stalled`: a stalled `retry` renders "Try again" (pending "Sending…") and POSTs `/api/splitstep/jobs` with body `{ jobId }` — the request `RetrySubmission` makes; non-stalled Retry, Rebuild statistics and the upload link are unchanged
  - [ ] `tests/drawer-sections.spec.ts` renders `DrawerAnalysisSteps` for every existing `AnalysisNotice` case (stats_unavailable, retry with and without note, cannot-act — now "Analysis stopped" + the details line, no note, no "Retrying" — fix_recording, the wait_or_ask variant, upload_again with a manager, in-flight with no alert) plus uploading at 62% (value only, no progress bar) and stalled retry; the existing `AnalysisNotice` and `DrawerRecoveryAction` cases pass unedited; `npx tsc --noEmit` passes
- **notes:** Artifact `Drawer-*` frames (Processing, Uploading, StalledRetry, ViewerNoAction); the two new strings are verbatim from `Drawer-Processing` and `Drawer-StalledRetry`. The in-flight placeholder "Serve and pressure numbers appear here once analysis finishes." is deliberately not carried over, but the "no alert while in flight" assertion is. `AnalysisNotice` stays until T26 so both drawers keep compiling. Update `drawerRecovery`'s doc comment (it says a stalled row is in-flight for drawers). The planner proposed fable (T7, opus, was blocked once on this drawer rule); routed to opus because fable was over its spend limit on 2026-09-28 — escalate if this blocks.

## T25 · Matches drawer draws the Analysis steps

- **status:** done
- **model:** opus
- **needs:** T24
- **files:** src/components/dashboard/matches/match-drawer.tsx (guess)
- **routes:** /dashboard/matches
- **done when:**
  - [ ] `match-drawer.tsx` renders `DrawerAnalysisSteps` from `match.analysis` with `canAct = match.canManage !== false` in `AnalysisNotice`'s place, and no longer imports `AnalysisNotice`
  - [ ] The footer keeps its order and variants: View match (primary, or ghost beside Continue upload), Continue upload, then `DrawerRecoveryAction` as `outline` for `canAct` — never two primaries
  - [ ] For a stalled `uploaded` row (`isSubmitStalled`) and `canAct`, `DrawerRecoveryAction` gets `stalled` and the row's class (retry when it has none) and renders the outline "Try again"; a stalled row whose class has no action (wait_or_ask), or a viewer who cannot act, gets no action
  - [ ] `npx tsc --noEmit` passes and `tests/matches-drafts.spec.ts` passes unedited
- **notes:** T7's footer rule stands: View match primary, recovery outline under it. Live patches already reach `match.analysis` through `matches-page-content.tsx`.

## T26 · Schedule event drawer draws the Analysis steps; retire AnalysisNotice

- **status:** done
- **model:** opus
- **needs:** T24, T25
- **files:** src/components/dashboard/schedule/event-line-drawer.tsx, src/lib/schedule/types.ts (`EntryMatch`), src/lib/data/schedule-server.ts (~261-281), src/components/dashboard/matches/drawer-sections.tsx, tests/drawer-sections.spec.ts (guess)
- **routes:** /dashboard/team/schedule/[eventId]
- **done when:**
  - [ ] `EntryMatch` gains optional `updatedAt`, `jobReference` and `uploadPercent`, set in `schedule-server.ts` from the same analysis map it reads `jobId` and `recovery` from
  - [ ] `event-line-drawer.tsx` renders `DrawerAnalysisSteps` for a played singles line with `canAct = canEdit` in `AnalysisNotice`'s place; doubles lines keep their score-only note and draw no steps
  - [ ] For a viewer with `canEdit`, a stalled hand-off counts toward `showRecovery`, so "Try again" takes the footer primary and View match drops to ghost (T7's rule); the failed-row footer is unchanged
  - [ ] `tests/schedule-dual-outcomes.spec.ts` passes with no edit to it or to `tests/fixtures/schedule-dual-outcomes-data.ts`, and `tests/schedule-tournament-outcomes.spec.ts` and `tests/event-table.spec.ts` pass
  - [ ] `AnalysisNotice` is deleted from `drawer-sections.tsx` with its spec cases (T24 already carries their assertions against `DrawerAnalysisSteps`); `grep -rn "AnalysisNotice" src tests` finds nothing; `npx tsc --noEmit` passes
- **notes:** `schedule-dual-outcomes.spec.ts` uses strict `getByRole("alert")`, so the drawer must hold exactly one alert. For a coach it must contain both "The video ended before the match did" and "Retrying uses the video you already", and Retry must be the footer's `PRIMARY_CLASS` button labelled exactly "Retry". For a player it must contain "The match page has the details." without the note, with no Retry and View match primary. The S4 fixture has no `updatedAt`, so it is never stalled. The planner proposed fable (T7, opus, was blocked once on this spec); routed to opus because fable was over its spend limit on 2026-09-28 — escalate if this blocks.

## T27 · Share the match page's layout decision and add a cached status hint

- **status:** done
- **model:** opus
- **files:** src/lib/data/match-analysis.ts (shared pure predicates), src/lib/data/match-page-hint-server.ts (new, guess), src/app/dashboard/matches/(detail)/[matchId]/page.tsx, tests/match-film-entry.spec.ts, tests/match-page-layout.spec.ts (new, guess)
- **done when:**
  - [ ] `match-analysis.ts` exports a pure function returning whether a `{ status, recovery }` is stats-unavailable (`isAnalysisFailed(status) && recovery === "stats_unavailable"`) and a pure function returning the page kind the match renders — `"steps"` when `(isInFlight(status) || isAnalysisFailed(status))` and not stats-unavailable, else `"report"` — with both literal expressions present verbatim in that module
  - [ ] page.tsx derives `statsUnavailable` and `isAwaitingAnalysis` only by calling those two functions on its own post-reconcile `loadMatchAnalysis` result, exactly as today; the names `isAwaitingAnalysis`, `if (isAwaitingAnalysis)`, `statsUnavailable={statsUnavailable}` and the `const [data, jobs, video, filmEntry, workspace, preferences, shareState] =` destructure are unchanged; in tests/match-film-entry.spec.ts no assertion is deleted — each literal it pinned in page.tsx is now asserted against `match-analysis.ts`'s source, and page.tsx is asserted to call the shared functions
  - [ ] A new `*-server.ts` module exports a `cache()`-wrapped loader of the hint keyed by matchId that uses `createClient` from `@/lib/supabase/server` (never `admin`), reads the RLS-scoped `matches` row (`id, source_provider, verification_status`), returns `null` when it is absent, and otherwise returns `analysisFor(await loadMatchAnalysis(supabase, [matchId]), …)` — no `reap`, no `reconcileBeforePageRead` — plus the kind from the shared function; `match-analysis-server.ts` gains no import of `@/lib/supabase/server` or `react`
  - [ ] A new spec pins the truth table: "steps" for uploading, uploaded, queued, processing, deriving and processed; "steps" for failed and derivation_failed with every non-`stats_unavailable` recovery class and with no recovery; "report" for `derivation_failed` + `stats_unavailable`, completed, timeline, imported and manual; an in-flight status carrying `recovery: "stats_unavailable"` still returns "steps"
  - [ ] `npm run typecheck` passes, and tests/match-film-entry.spec.ts plus the new spec pass
- **notes:** Guardrails §3.2 lesson — the skeleton (T29) and the page must share one predicate. `withStatsPublished` only maps `completed` to `timeline`, and both are outside the gate, so the hint needs no `match_stats`. Reusing `loadMatchAnalysis` + `analysisFor` keeps the status/recovery projection identical to the page's; the only possible drift is the page's reap/reconcile writes, which T29 documents. Do not put `cache()` or the server client into `match-analysis-server.ts` — client components import it. The hint is not the page's gate input; the page may reuse the hint's RLS row for its pre-reconcile existence check only if that check stays on the cookie client. Moving the pinned literals from page.tsx's source to match-analysis.ts's source was approved by the author (2026-09-28) as a relocation, not a weakening.

## T28 · Stepper-column skeleton for the analysing match page

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/loading/analysis-steps-pending.tsx (new, guess), tests/analysis-steps-pending.spec.ts (new, guess)
- **done when:**
  - [ ] A new exported component is built only from `PendingFrame` / `PendingRegion` / `PendingBar` (`loading/pending.tsx`), has a single `role="status"` labelled "Loading analysis progress" (or a similar "Loading …" label), and every bar sits under `aria-hidden`
  - [ ] Its column carries `mx-auto w-full max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)]` (matching `analysis-steps-column.tsx`'s `<section>`); inside are one title bar, one match-line bar, then a list of exactly four rows, each a `size-4 rounded-full` mark bar beside a label bar, spaced like `VerticalStep` (`gap-3.5`, `mt-9` above the list)
  - [ ] The new file contains no `--surface-skeleton`, no `text-[`, no `animate-spin`, no hex colour and no `<button>`; tests/skeleton-primitives.spec.ts and tests/design-drift.spec.ts pass with no edit to either
  - [ ] A new offline spec (`renderToStaticMarkup` through `tests/fixtures/vm-modules.ts` `createLoader`, like tests/match-report-pending.spec.ts) asserts the markup: one status role with a "Loading" label, the column classes above, four mark circles, and every bar `aria-hidden`
- **notes:** Not mounted yet; T29 uses it as the layout's Suspense fallback. Keep it free of `next/navigation` so it renders offline. The DS rule and skeleton-primitives spec allow only `pending.tsx` to write the skeleton token, so use `PendingBar`, which already carries it and `motion-safe:animate-pulse`. T22's log recorded a design-drift failure from an off-scale `text-[24px]` — add no `text-[Npx]` here.

## T29 · Match layout streams a status-aware skeleton; the group loading state goes neutral

- **status:** done
- **model:** opus
- **needs:** T27, T28
- **files:** src/app/dashboard/matches/(detail)/[matchId]/layout.tsx, src/app/dashboard/matches/(detail)/loading.tsx, src/app/dashboard/matches/(detail)/[matchId]/page.tsx (comment only), src/components/dashboard/loading/match-report-skeleton.tsx (comment), tests/match-layout-skeleton.spec.ts (new, guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] layout.tsx's first `await` after `params` is T27's hint loader, calls `notFound()` when it is null before any `<Suspense>` in the file, then renders the same fixed-height `h-[calc(100vh-var(--header-h))]` wrapper around a `<Suspense>` whose fallback is T28's skeleton when the hint's kind (via T27's shared function) is `"steps"`, else `<MatchReportSkeleton />`
  - [ ] `getMatchDetailData`, the `notFound()` on its null result, `MatchDataProvider` (still `key={match.id}`), `ClearRetryOnSuccess` and `children` live in an async component rendered inside that `<Suspense>`; across `src/`, `getMatchDetailData(` is called only there and in page.tsx, and it is still the `cache()`-wrapped export
  - [ ] `(detail)/loading.tsx` no longer imports `MatchReportSkeleton`; it renders a `PendingFrame` with no rail, pane or stepper shapes (page ground only), and its header comment explains it now covers only the status-hint query
  - [ ] page.tsx still computes its gate from its own reconciled `loadMatchAnalysis` result, not from the hint, and a comment near the gate states that the layout's hint is read before reap/reconcile, so a stale hint can change only which skeleton flashes, never what the page renders
  - [ ] A new source-order spec asserts that in layout.tsx the hint call and its `notFound()` precede `<Suspense`, that `getMatchDetailData(` appears only after it, and that loading.tsx does not contain `MatchReportSkeleton`; tests/match-film-entry.spec.ts, tests/match-report-pending.spec.ts, tests/skeleton-primitives.spec.ts and tests/design-drift.spec.ts pass without their assertions being weakened
- **notes:** Routed opus — would be fable (a Next 16 streaming/RSC restructure around the §3.3 gate) but fable is over its monthly spend limit today. Next 16 docs (`03-file-conventions/loading`, `02-guides/streaming.md`): `loading.js` never wraps its sibling layout, which is why the boundary sits at `(detail)/`. The group `loading.tsx` already commits the response to 200, so the 404 is a not-found render, not a status code; keep `notFound()` before the Suspense anyway, as the docs advise. A throw from the Suspense child keeps today's error routing because it is still rendered by the layout. Update `MatchReportSkeleton`'s doc comment ("`(detail)/loading.tsx`'s body"). Eyes-on: the verifier's seeded matches (T21) should show the stepper skeleton for the stopped classes and the report skeleton for `stats_unavailable` and completed matches; do not click "Try again" on seeded rows. The widget-states hook will run on this dashboard diff.

## T30 · Point analysisAction's failed-row Add video at this match

- **status:** todo
- **model:** sonnet
- **files:** src/lib/data/match-analysis.ts, tests/match-analysis-timeline.spec.ts
- **done when:**
  - [ ] For a failed row whose `recovery` is `upload_again` or `fix_recording`, `analysisAction(analysis, matchId)` returns label "Add video" with `href` equal to `addVideoHref(matchId)` (imported from `@/lib/matches/add-video-href`), i.e. `/dashboard/matches/new?match=<id>`, not bare `/dashboard/matches/new`
  - [ ] The `manual` branch and the no-`recovery` "Start over" fallback keep today's label and `href` (`/dashboard/matches/new`); retry / rederive / wait_or_ask / stats_unavailable are unchanged
  - [ ] In tests/match-analysis-timeline.spec.ts, the "upload_again and fix_recording get the Add video action" case now expects `/dashboard/matches/new?match=m1`; its label assertion and every other `analysisAction` assertion in the file are left as they are, and the spec passes
  - [ ] `analysisAction`'s doc comment says the add-video action for these classes opens the wizard on this match (`addVideoHref`), not a new match; `npm run typecheck` passes
- **notes:** T8 follow-up 1. `RecoveryAction` already uses `addVideoHref(matchId)` for these classes, so the list action and the page now agree. `add-video-href.ts` has no imports and is client-safe. `analysisAction` has no caller in `src` yet; T32 is the first. `manual` is left alone on purpose (author decision 2026-09-28).

## T31 · Activity feed carries each failed row's recovery class

- **status:** todo
- **model:** opus
- **files:** src/lib/data/activity-server.ts, tests/activity-feed-recovery.spec.ts (new, guess)
- **done when:**
  - [ ] `getActivityFeed`'s `processing_jobs` select still carries `matches!inner(player1_name, player2_name, program_id)` and `scopeToWorkspace`, and adds the columns recovery needs (`id, error_code, error_category, error_step, video_object_key, results_object_key, resubmitted_from_job_id, external_job_id, updated_at`) but not `error_message`
  - [ ] Each item's `recovery` comes from `recoveryFields(jobRecoveryFacts({...row, hasVideo, hasResults}), chainAttempts(<that match's fetched rows>, row.id), null)`, with no hand-built `RecoveryInput`; `ActivityAnalysis` gains `recovery`, `jobId`, `attemptsUsed` and `errorCode`, and nothing holding a storage key, `note`, `failNote` or an error message
  - [ ] A new offline spec calls `getActivityFeed` with a stubbed `SupabaseClient` (a fake chainable query builder resolving fixture rows) and asserts one item per match with the class per fixture: failed with a null video key → `upload_again`; failed with `error_category` input-rejected → `fix_recording`; failed plain → `retry`; a three-row resubmission chain ending failed → `wait_or_ask`; `derivation_failed` + `DERIVATION_ERROR` → `rederive`; `derivation_failed` with another code → `stats_unavailable`
  - [ ] The same spec asserts `JSON.stringify(items)` contains neither `object_key` nor any fixture storage-key value, and `npm run typecheck` passes
- **notes:** Intent (author, 2026-09-28): "Can we also update the activity dropdown – it currently says start over for all". Live patches already carry `recovery`, but the tray only subscribes while something is live-updating, so a failed row's class has to come from the server. Reusing `jobRecoveryFacts` / `recoveryFields` / `chainAttempts` keeps it identical to `loadMatchAnalysis`. The chain count only sees rows inside the 50-row `MAX_ITEMS` window; say so in a comment. Storage keys become `hasVideo` / `hasResults` booleans on the server and never reach an item. `processing_jobs` carries a live SAS credential and its own `created_by` policy, so the `!inner` join is load-bearing; keep it and its comment. `errorCode` is the code only (e.g. `QUOTA_EXCEEDED`), which T32 needs for `waitOrAskVariant`. `jobId` / `attemptsUsed` let `withLiveAnalysis` re-decide `recovery` after a live resubmit. tests/personal-home-scope.spec.ts is a live-DB spec that copies the old select string; it needs no edit and must not be run against prod. Worth an `rls-boundary-reviewer` pass at `/pr-check`.

## T32 · Tray failure helpers: which rows, where the row goes, what it says

- **status:** todo
- **model:** sonnet
- **needs:** T30, T31
- **files:** src/components/dashboard/activity/tray-failure.ts (new, guess), src/components/dashboard/matches/analysis-failure-copy.ts, tests/activity-tray-failure.spec.ts (new, guess)
- **done when:**
  - [ ] A new pure module (no `"use client"`, no React) exports `isTrayFailure(analysis)`, exactly `matchListGroup(analysis) === "Failed"` (so `stats_unavailable` is false and every in-flight status is false)
  - [ ] It exports `trayFailureAction(analysis, matchId)` returning `{ label, href }`: `upload_again` / `fix_recording` → "Add video" at `/dashboard/matches/new?match=<id>`; `retry` / `rederive` / `wait_or_ask` → "Open" at `/dashboard/matches/<id>`; failed with no `recovery` → "Start over" at `/dashboard/matches/new`. Hrefs come from `analysisAction`, not retyped
  - [ ] `analysis-failure-copy.ts` exports a `TRAY_REASON` map and the module exports `trayFailureReason(analysis)`: `upload_again` "Upload didn't finish"; `fix_recording` "Recording didn't meet the requirements"; `retry` "Analysis stopped · retry available"; `rederive` "Stats need rebuilding"; `wait_or_ask` by `waitOrAskVariant(errorCode, attemptsUsed)`: allowance "No analysis time left this month", permission "Needs your team's owner", ceiling "Tried three times"; no `recovery` "Analysis failed"
  - [ ] The new spec pins every case above (label, href and reason per class and per wait_or_ask variant, plus `isTrayFailure` false for `stats_unavailable` and each in-flight status); tests/match-analysis-timeline.spec.ts passes unedited and `npm run typecheck` passes
- **notes:** Direction E on the design canvas (https://claude.ai/artifact/Fn78DpgqH2PbRDGeEM5qtt, "E · Whole-row hover + click"), chosen by the author 2026-09-28. "Open" is the tray's short word for `analysisAction`'s "View match": the row is the link, so the word only says where the click goes. The reasons are short on purpose; the tray draws them on one truncating line. No "free": a failed retry's cost is not the tray's claim to make. The tray never POSTs `/resubmit` or `/rederive`; those live on the match page and in the drawers.

## T33 · Tray rows become whole-row links with the stepper's marks

- **status:** todo
- **model:** opus
- **needs:** T32
- **files:** src/components/dashboard/activity/activity-tray.tsx, src/components/dashboard/activity/tray-detail.ts (comment only), src/components/dashboard/shared/vertical-steps.tsx, tests/activity-tray-rows.spec.ts (new, guess)
- **routes:** /dashboard/matches
- **done when:**
  - [ ] `activity-tray.tsx` partitions `failed` with `isTrayFailure` after the live merge, so a `stats_unavailable` row renders no `FailedRow` and adds nothing to `trayDetail`'s failed count or the trigger's `unread` dot
  - [ ] `FailedRow` is one `Link` (`ROW_CLASS` + `ROW_INTERACTIVE_CLASS`, `href` from `trayFailureAction`) with two single-line, truncating lines (the match title in `font-medium` ink-900 12px; `trayFailureReason` in 11px ink-500) and a trailing grey (`--ink-600`, `--ink-900` on row hover/focus) action word plus the 13px ink-400 `ChevronRight`. No bordered button, no blue, no "Analysis failed —" sentence, and no `href="/dashboard/matches/new"` literal in the file
  - [ ] `StepMark` gains an optional compact size (14px, glyph scaled to match) that leaves every existing caller's markup unchanged; `InFlightRow` leads with `StepMark state="now"` (the spinner, still under `motion-reduce`) and `FailedRow` with `StepMark state="fail"`, both compact, replacing the blue `DOT` and the `CircleX`. Invitation rows keep the blue dot
  - [ ] The file header ("Start over keeps its border", "There is no retry endpoint"), `FailedRow`'s doc comment and `tray-detail.ts`'s "carries Start over" comment describe the new rows and marks
  - [ ] A new offline spec renders `ActivityTray` rows (via tests/fixtures/vm-modules.ts `createLoader()`) and asserts: an `upload_again` row's link targets `?match=<id>` and reads "Add video"; a `retry` row targets `/dashboard/matches/<id>` and reads "Open"; a `stats_unavailable` item renders no failed row; tests/activity-tray-detail.spec.ts, tests/skeleton-primitives.spec.ts and tests/design-drift.spec.ts pass
- **notes:** Direction E (see T32's notes); the board's leading marks are the stepper's own at 14px. Blue in the chrome now means waiting on you: the trigger's unread dot and the invitation row's dot. Keep the 14px `Lead` column so every row's text still starts on one x. Touch has no hover, so the action word is always visible; hover only darkens it with the row wash. The tray is navigation-only. Eyes-on: the verifier's T21 seeded matches (one per class) sit in its personal workspace; open the tray on any dashboard page and expect five failed rows (no stats_unavailable), "Add video" on two and "Open" on three. Do not click through seeded rows' actions. The widget-states hook will run on this dashboard diff.

## T34 · Stalled hand-off shows as a tray failure row

- **status:** todo
- **model:** sonnet
- **needs:** T33
- **files:** src/components/dashboard/activity/tray-failure.ts, src/components/dashboard/activity/activity-tray.tsx, tests/activity-tray-failure.spec.ts
- **routes:** /dashboard/matches
- **done when:**
  - [ ] `isTrayFailure` also returns true for `status === "uploaded"` carrying a `recovery` (the server-classified stalled hand-off, `retry` or `wait_or_ask`), and `activity-tray.tsx`'s `inFlight` list excludes exactly those rows, so a stalled hand-off renders one `FailedRow`, no `InFlightRow`, and counts under "failed" in `trayDetail`
  - [ ] For such a row `trayFailureAction` returns "Open" at `/dashboard/matches/<id>` and `trayFailureReason` returns `STEPPER_COPY.titles.stalled` ("Couldn't send for analysis"), imported from `match-detail/analysis-steps.ts`, not retyped
  - [ ] Spec cases: `uploaded` + `retry` and `uploaded` + `wait_or_ask` → `isTrayFailure` true, "Open", the stalled reason; `uploaded` with no `recovery` → false (still in flight); every T32 case still passes; `npm run typecheck` passes
- **notes:** Kept by the author (direction E draws the stalled row). A deliberate divergence from `matchListGroup`, which keeps a stalled `uploaded` row under "In progress"; the page (T23) and both drawers (T25/T26) already show it as stopped. Server-classified only: a row that stalls while the tray is open flips on the next navigation. No clock in the tray, `hasLiveWork` unchanged, and the tray POSTs nothing.

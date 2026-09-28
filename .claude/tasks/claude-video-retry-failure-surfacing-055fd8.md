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

- **status:** todo
- **model:** opus
- **needs:** T3, T4, T5
- **files:** src/components/dashboard/matches/drawer-sections.tsx (`AnalysisNotice`), src/components/dashboard/matches/match-drawer.tsx, src/components/dashboard/schedule/event-line-drawer.tsx, tests/drawer-sections.spec.ts (guess)
- **routes:** /dashboard/matches, /dashboard/team/schedule/[eventId]
- **done when:**
  - [ ] `AnalysisNotice` takes `recovery` and `note` and renders `byClass[recovery]` with the drawer body; the failure block no longer branches on `status` or `inputRejected`
  - [ ] `grep -rn "function RetryButton" src` finds none; `match-drawer.tsx` renders `<RecoveryAction>` when `canManage !== false` and `event-line-drawer.tsx` when `canEdit`
  - [ ] `tests/drawer-sections.spec.ts`: T9/T12's cases are moved to class inputs with their assertions kept, and a new case (an upload_again row with a manager) contains the upload link and not "Retrying"
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §3; plan step 6. The event drawer used to pass `failNote` only when retryable; it now passes `note` whenever the class shows one. Viewers without manage rights get title and body, no action.

## T8 · Matches list row action follows the recovery class

- **status:** todo
- **model:** sonnet
- **needs:** T2
- **files:** src/lib/data/match-analysis.ts (`analysisAction`), tests/match-analysis-timeline.spec.ts (guess)
- **done when:**
  - [ ] `analysisAction` returns add-video for `upload_again` and `fix_recording`, a View-the-match action for `retry` and `rederive`, and "View stats" for `stats_unavailable`
  - [ ] `tests/match-analysis-timeline.spec.ts` asserts each class's action, and asserts "Start over" is not returned for a failed row that has a video
  - [ ] `npx tsc --noEmit` passes
- **notes:** Design §3 (flagged out-of-scope by T8 on advantage-intelligence-ui); plan step 7a.

## T9 · Group stats-unavailable matches under Ready in the matches list

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** later
- **model:** opus
- **needs:** T20
- **files:** scripts/eyes-on/seed-failure-classes.ts (new) (guess)
- **done when:**
  - [ ] The script defaults to dry-run and prints the rows it would write; writing requires an explicit `--write` flag
  - [ ] It resolves the verifier account from `EYES_ON_EMAIL` and only inserts or updates `matches` / `processing_jobs` rows whose `created_by` is that account, one job per `RecoveryClass`
  - [ ] A `--cleanup` mode deletes exactly the rows the script created (identified by a marker it writes), and a dry run of `--cleanup` lists them
  - [ ] `npx tsc --noEmit` passes
- **notes:** Plan Test strategy. **Author decision required before promoting to `todo`:** this writes to the production database. Nothing depends on it; `/pr-check` Stage 3b can run without it on the real rows the verifier can see, at lower coverage.

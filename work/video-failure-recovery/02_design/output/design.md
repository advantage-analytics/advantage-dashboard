# Design — Retry only where it can help, and surface every video failure

Input: `01_brief/output/brief.md`. This is the second run of stage 02. The first
run duplicated, and in one place contradicted, work already queued on two
other branches. This run builds on them.

## Decisions made in chat during this stage

- **Deterministic derivation failures don't block the match.** A refusal such
  as "5 point(s) resolved no winner" lets the page render, and the statistics
  show as not available. We'll deal with the cause later.
- **SwingVision `process-match` errors are deferred.** They are the import
  path, not video, and guardrails §2 says never touch it. They join the
  non-goals.
- **The frame-rate check belongs to `claude/match-analysis-failure-retry-8769f3`
  T2/T3.** It warns on a whole-track container average below 29.96 fps and
  never blocks. Job 45ff4bd7's container averages 29.94; the vendor measured
  29.80. This feature adds **no** fps work, which removes brief scope item 7
  and its open question.
- **Build on the other branches, don't run alongside them.** One failure
  vocabulary, not two.

## Dependencies (must merge into `splitstep-integration` first)

| Branch | Tasks | What this design takes from it |
| --- | --- | --- |
| `claude/advantage-intelligence-ui-e6e2f7` | T8, T9 done; T10–T12 queued and being drained | `src/components/dashboard/matches/analysis-failure-copy.ts` (`ANALYSIS_FAILURE_COPY`); `derivation_failed` copy on the progress card and `AnalysisNotice`; T10's `isInputRejected()` + `MatchAnalysis.inputRejected` through the loader, the live hook (`liveAnalysisPatch`) and `EntryMatch`; T11/T12 hide Retry for input-rejected |
| `claude/match-analysis-failure-retry-8769f3` | T1–T3 queued | T1: `resubmitJob` refuses `error_category = invalid_input` as `input_rejected` (409). T2/T3: the frame-rate warning |

**Stage 05 must not start until `advantage-intelligence-ui` has merged.** Its
T10–T12 edit the same files this feature does (`match-analysis.ts`,
`match-analysis-server.ts`, `use-live-match-analysis.ts`, `schedule-server.ts`,
`drawer-sections.tsx`, `match-drawer.tsx`, `event-line-drawer.tsx`,
`match-analysis-progress.tsx`). `failure-retry` T1 must land before this
feature's `resubmit-job.ts` change. T2/T3 are independent.

## What the live data says (2026-09-27)

Every non-healthy `processing_jobs` row in production, with the class this
design gives it. "After deps" is what the user sees once both dependency
branches have merged, before this feature.

| Job | Status | Code / category / step | Video | Stored note | After deps | This design |
| --- | --- | --- | --- | --- | --- | --- |
| 45ff4bd7 | failed | VIDEO_FRAME_RATE_TOO_LOW / invalid_input / trimming_video | yes | "The video must be at least 29.9 fps." | no Retry, "Upload a new recording" ✓ | `fix_recording` (unchanged in effect) |
| e6e8dea4 | failed | INTERNAL_ERROR / internal / downloading_video | yes | "An unexpected error occurred…" | Retry ✓ | `retry` |
| 70748f2a, cca2efbe | failed | none | **no** | "Failed to fetch" | raw note, Retry that always 409s ✗ | `upload_again` |
| f91bad2c, eb7f9fe5 | failed | none | **no** | "Upload stopped before it finished…" | Retry that always 409s ✗ | `upload_again` |
| 6b7406fa | failed | none | **no** | "Edge Function returned a non-2xx status code" | raw note, Retry 409s ✗ | `upload_again` |
| b74a1e04 | derivation_failed | none | yes, results yes | "5 point(s) resolved no winner" | match hidden behind the progress card | `stats_unavailable`: the match renders |
| c1d36200 | uploaded (stalled) | none | yes | "This match needs 2 hr 3 min of analysis but only 2 hr is left…" | "hasn't been sent", free Try again; the real reason is hidden ✗ | `wait_or_ask`, with the stored reason shown |
| 85518306 | uploaded (stalled) | none | yes | none | free Try again ✓ | `retry` (free) |

## Approaches considered

**A. Promote T10's `inputRejected` boolean to one recovery class, reusing
T8's copy module (recommended).**

- After the dependency branches merge, T10's `isInputRejected()` is the
  pattern: one pure function, called by both the loader and the live hook.
- This design generalises that one function into `classifyFailure()`, which
  returns a class, and replaces `MatchAnalysis.inputRejected` with
  `MatchAnalysis.recovery`.
- `ANALYSIS_FAILURE_COPY` grows from two keys to one entry per class, and the
  existing `derivation_failed` and `failed` copy moves under its class
  unchanged.
- Result: the loader, hook, card and drawers branch on one field, and one copy
  module feeds them. `resubmitJob` asks the same function, so T1's
  `input_rejected` generalises to "class is not `retry`".

**B. Add more booleans next to `inputRejected`.** Rejected.

- The feature would need `noVideo`, `stalledReason`, `derivationTransient`,
  `statsUnavailable` and `ceilingReached` as well.
- Every surface would then evaluate a stack of flags in its own order. That
  is the loader-versus-hook drift guardrails §3.2 records as a past bug.

**C. Persist a `recovery_class` column written by every failure writer.**
Rejected.

- About ten writers set a failure, including two SQL functions.
- Existing rows would need a backfill, which §2 forbids.
- Every new vendor code would mean edits in several places.

## Chosen design

### Architecture

The classifier and the copy stay in the two places the dependency branches
created:

- `isInputRejected` lives in `src/lib/data/match-analysis.ts`, and so does
  its replacement, `classifyFailure`.
- `ANALYSIS_FAILURE_COPY` lives in
  `src/components/dashboard/matches/analysis-failure-copy.ts`.

No new module is added.

```
classifyFailure(input) → RecoveryClass

input = { dbStatus, errorCode, errorCategory, errorStep,
          hasVideo, hasResults, attemptsUsed, stalledSubmit }
```

**Classes** (the brief's five, plus the "match shows" case decided in chat):

| Class | Action | Spends allowance or an attempt? |
| --- | --- | --- |
| `retry` | **Retry analysis** → `/resubmit` (failed row), or **Try again** → `/api/splitstep/jobs` (stalled `uploaded` row) | resubmit: yes, bounded by the ceiling; Try again: no |
| `upload_again` | **Upload the video again** → `addVideoHref(matchId)` | no |
| `fix_recording` | **Upload a new recording** → `addVideoHref(matchId)` (T11's existing link) | no |
| `wait_or_ask` | None. The stalled-row variant keeps **Try again** for once the reason clears | no |
| `rederive` | **Rebuild statistics** → new `/rederive` route | no. The vendor isn't called and no attempt is counted |
| `stats_unavailable` | None. The match page renders | no |

**Rules.** The first rule that matches wins.

1. `uploaded` and stalled (the existing `isSubmitStalled`):
   - `error_code = QUOTA_EXCEEDED` → `wait_or_ask`.
   - `NOT_ELIGIBLE` or `NO_BILLING_WORKSPACE` → `wait_or_ask`.
   - Anything else → `retry` (free).
2. `failed` with no video → `upload_again`. This comes before any code rule,
   because nothing can be resent.
3. `failed` and `isDownloadFailure(code, step)` → `retry`. This is the
   existing predicate, so the automatic retry stays a subset.
4. `failed` and `isInputRejected(...)` → `fix_recording`.
   - This is T10's function, now called here rather than projected as its own
     field.
   - `video_quality` stays excluded, as T10 decided.
5. `failed`, anything else → `retry`.
   - This covers INTERNAL_ERROR, JOB_STALE, RESULTS_DELIVERY_LOST,
     provider 5xx, and no code.
   - If `attemptsUsed ≥ MAX_TOTAL_ATTEMPTS`, it becomes `wait_or_ask`
     ("contact us") instead, so no button offers a retry the route refuses.
6. `derivation_failed` with `error_code = DERIVATION_ERROR` → `rederive`.
   With `DERIVATION_REFUSED` or no code → `stats_unavailable`.

### Components and changes

**1. The loader and live hook carry `recovery`, replacing `inputRejected`.**
- The `loadMatchAnalysis` select adds `error_code`, `error_step`,
  `video_object_key`, `results_object_key` and `resubmitted_from_job_id`.
  `error_category` already arrives with T10.
- The two keys are mapped to booleans on the server and never reach the
  client.
- `attemptsUsed` is counted from the chain in rows already fetched for the
  match, so it needs no extra query.
- T10's `liveAnalysisPatch(row)` sets `recovery` through the same function.
  The Realtime payload carries the full row.
- `EntryMatch.inputRejected` becomes `EntryMatch.recovery`.
- `isInputRejected` stays exported as rule 4's building block. T1's literal
  in `resubmit-job.ts` switches to it, which is the "consolidate after both
  merge" note in T10.

**2. Copy: `ANALYSIS_FAILURE_COPY` is keyed by class.**
- Existing strings move and are not rewritten:
  - T8's `failed.*` → `retry`.
  - T11's `failed.inputRejected` → `fix_recording`.
  - T8's `derivation_failed` → `stats_unavailable`. Its body, "…so no
    statistics were saved for this match", already fits a page that renders
    without stats.
- New entries: `upload_again`, `wait_or_ask` (allowance, permission and
  ceiling variants) and `rederive`.
- **When the stored note is shown.** T11/T12 already decided that the vendor's
  `error.message` is its designated end-user string and stays the headline.
  This design keeps that and adds the missing rule:
  - `error_message` is shown only when `error_code` is non-null and does not
    start with `DERIVATION_`. That covers vendor codes, and codes whose
    message we write ourselves in plain words: `QUOTA_EXCEEDED`,
    `NOT_ELIGIBLE`, `JOB_STALE`, `RESULTS_DELIVERY_LOST`.
  - Every row without a code is one of our own writers ("Failed to fetch",
    Azure XML, "Edge Function returned a non-2xx status code", "Provider
    returned 502: …"). Those get the class headline and never the raw string.
  - This one rule removes brief item 5 from every surface.

**3. Surfaces switch on `recovery`.**
- `match-analysis-progress.tsx`: the failed and stalled branches render
  `copy[recovery]` and a new `RecoveryAction`. This replaces the per-status
  and `inputRejected` branches that T8 and T11 added, and the stalled branch's
  fixed "hasn't been sent" copy when a reason is stored.
- `drawer-sections.tsx` `AnalysisNotice` takes `recovery` in place of
  `status` + `inputRejected` for the failure block.
- `match-drawer.tsx`: `canRetry` becomes
  `canManage !== false && recovery has an action`. Its duplicate
  `RetryButton` (424-470) is replaced by `RecoveryAction`, which
  `event-line-drawer.tsx` imports.
- `RecoveryAction` (new, `match-detail/recovery-action.tsx`) switches on class:
  - `retry` → the existing `RetryActionButton` (resubmit) or `RetrySubmission`
    (stalled).
  - `rederive` → `RetryActionButton` pointed at `/rederive`.
  - The two upload classes → an `advButton()` link to `addVideoHref(matchId)`.
  - The other classes → nothing.
- `analysisAction()` (`match-analysis.ts:555`): the list row follows the
  class instead of "Start over" for every failure. T8 flagged this as out of
  its scope.
- Matches-list grouping: `stats_unavailable` is not "Failed". It groups under
  "Ready" with the label "Stats unavailable".
- `analysis-mail.ts` / `email/templates/analysis.ts`: the failure email uses
  the class copy and the same note rule. It is not sent for
  `stats_unavailable`. T8 flagged that the email currently fires "failed" for
  a derivation refusal.

**4. `resubmitJob` refuses every non-`retry` class.**
- T1 made the parent select include `error_category` and added the
  `input_rejected` refusal. This widens that one check:
  - The select adds `error_code`, `error_step` and `video_object_key`.
    `video_object_key` is already there for the existing check.
  - The check calls `classifyFailure`.
  - Anything other than `retry` refuses. `fix_recording` keeps T1's
    `input_rejected` reason and message. `upload_again` keeps the existing
    `video_unavailable`, with plain copy in place of "no completed video
    upload to retry from". A ceiling downgrade keeps `attempt_ceiling`.
- No new reason codes, and the route's `REFUSAL_STATUS` is unchanged.
- The automatic callers inherit it, as T1 intended.

**5. Stalled `uploaded` rows keep their real reason.**
File: `submit-match-video.ts:443-462`.
- On a refusal that leaves the row `uploaded`, write `error_code` from the
  HTTP status: 429 → `QUOTA_EXCEEDED`, 403 → `NOT_ELIGIBLE`,
  422 → `INVALID_METADATA`, 503 → `NOT_CONFIGURED`.
  - The browser already holds UPDATE on `error_code` (verified in
    `column_privileges`), so this needs no migration.
- On a 502, the handler has already marked the row `failed` with the vendor
  text (`jobs/handler.ts:680-700`). The client stops overwriting it with
  "Could not submit this match for analysis.".
- The client still never sets `status`, so guardrails §3.1 ("a submit failure
  must not mark the job failed") still holds.

**6. Derivation failures carry a code; transient ones can be rebuilt.**
- `derive-and-publish.ts` writes `error_code`:
  - `DERIVATION_REFUSED` when `persistTranscript` refuses (:77-80). This is
    deterministic.
  - `DERIVATION_ERROR` on an RPC error or a throw (:115-121, :187-190). This
    is transient.
  - `calculate_match_stats` is called, never edited (§2).
- New `POST /api/splitstep/jobs/[jobId]/rederive`, with `route.ts` as wiring
  and `handler.ts` holding the decision behind injected dependencies (the §2
  pattern).
  - Auth: the same ladder as `/resubmit`.
  - It requires `derivation_failed`, `classifyFailure = rederive` and results
    present.
  - A conditional claim, `derivation_failed → deriving where status =
    'derivation_failed'`, answers a second click with 409.
  - Then it runs `deriveAndPublish({ deadline })` within `maxDuration`.
  - Re-running is safe: `persist-transcript.ts:203` deletes the match's
    derived points before inserting.

**7. `stats_unavailable`: the match renders.**
- `page.tsx`'s `isInFlight || isAnalysisFailed` short-circuit narrows by one
  class. For `stats_unavailable` it renders the normal page with
  `meta.statsUnavailable`.
- The Statistics tab renders T8's `derivation_failed` title and body as a
  quiet note in place of every stat section, in `statistics-view.tsx`'s
  `UnpublishedStatsNotice` slot.
- Film plays if `hasPlayableVideo`. Visualizations shows its existing empty
  state.
- The gate holds for every other class. §3.3 gets an amended note.

**8. Unreconciled score folds show a caveat.**
- `derive-and-publish.ts:163`: in addition to the console.warn, merge
  `{ fold: { reconciled: false, reason } }` into the job's existing
  `derivation_quality` jsonb. No migration.
- `match-detail-server.ts` exposes `meta.foldUnreconciled`. A grey note strip
  (`noteStripCls`) above the Statistics tab reads: "Advantage Intelligence
  couldn't match every point to the final score you entered, so some points
  may sit in the wrong game. The score shown is the one you entered."
- It appears on the match page only.
- `UnpublishedStatsNotice` drops its "checked against the final score"
  clause when the flag is set.
- Jobs derived before this change have no flag and show no caveat. No
  backfill.

**9. A failed results download after the vendor completes recovers.**
- `reconcile.ts` adds a separately capped sweep: `status = completed`,
  `results_object_key is null`, `derivation_version is null`, `completed_at`
  older than 10 minutes.
  - It re-fetches results from the stored strokes URL with the webhook's own
    download and `finalize_splitstep_results` step, then `deriveAndPublish`.
  - It runs in `after()`, so a page render never waits on it.
  - If the URL has expired or the fetch fails twice, the row becomes
    `failed / RESULTS_DELIVERY_LOST`. That code is already used and already
    plain, and it classifies as `retry`.
- **Webhook signature 401s need no new code.** The existing poll already moves
  a finished-but-unheard `processing` job to `RESULTS_DELIVERY_LOST` after 30
  minutes, and that now reads as `retry` with plain copy.

### Data flow

```
failure writers (unchanged, plus the codes from 5 and 6)
        │  processing_jobs
        ▼
loadMatchAnalysis ─┐
liveAnalysisPatch ─┼─► classifyFailure ─► MatchAnalysis.recovery ─► card / drawers / list / email
resubmitJob ───────┤                                   (copy from ANALYSIS_FAILURE_COPY[recovery])
rederive handler ──┘   refuse unless the class matches
```

### Error handling

- The classifier is total: every input returns a class, and it never throws.
- `RecoveryAction` keeps `RetryActionButton`'s network and refusal handling.
  Refusal messages are now class copy, so showing them verbatim is safe.
- The `/rederive` claim is conditional, so a concurrent reconcile sweep and a
  double click can't both derive.

### Testing

The offline specs extend the dependency branches' own specs rather than
adding parallel ones.

- `tests/match-analysis-input-rejected.spec.ts` (T10) → gains the
  `classifyFailure` table: the ten live rows above, each rule, the ceiling
  downgrade and unknown codes. `isInputRejected`'s own cases stay.
- `tests/analysis-failure-copy.spec.ts` (T8/T11) → each class renders its
  action or none. A row whose uncoded `error_message` is Azure XML, "Failed to
  fetch" or "non-2xx" never shows that string. Copy matches
  `/splitstep|swingvision/i` zero times.
- `tests/drawer-sections.spec.ts` (T9/T12) → `AnalysisNotice` per class.
- `tests/resubmit-authorization.spec.ts` (T1) → `upload_again` and the ceiling
  refuse before any insert or `reserveQuota`. T1's `input_rejected` cases
  still pass.
- `tests/rederive-handler.spec.ts` (new): the auth ladder, class gate,
  conditional claim (a second call gets 409), and `deriveAndPublish` called
  once.
- `tests/match-film-entry.spec.ts`: the short-circuit ordering still holds,
  and `stats_unavailable` bypasses it.
- `/pr-check` Stage 3b eyes-on: the match page, the list drawer and the
  schedule drawer for one seeded row per class.

### Guardrails bookkeeping

- `docs/ui-revamp-guardrails.md` §2 gets one reviewed-exception entry covering:
  - `resubmit-job.ts` (a refusal only)
  - `derive-and-publish.ts` (codes and the fold flag)
  - `reconcile.ts` (the results sweep)
  - `submit-match-video.ts` (the code and no overwrite)
  - the new `/rederive` route and handler
- §3.3 gets a note on the narrowed short-circuit.
- `docs/video-pipeline-overview.md:603-615` is stale (it says the error
  columns and the status endpoint are unused). Correct it in the same PR.
- No migration.

## Open questions

1. **Unknown vendor codes default to `retry`.** Unknown `invalid_input` codes
   are already `fix_recording` through T10's category rule. Unknown
   `video_quality` codes, which T10 excluded on purpose, retry and spend an
   attempt. Keep it that way?
2. **Who may rebuild statistics.** This design mirrors `/resubmit` (the
   uploader only), so a team coach gets no button, although the drawer's
   `canManage` suggests coaches expect to act.
3. **Wait-or-ask copy on a team workspace.** Should it name who to ask?
   This design says "ask your team's owner" for `NOT_ELIGIBLE`.
4. **The schedule page doesn't reconcile.** A stuck job recovers only when
   the match page or the list is opened. Acceptable?
5. **The dependency branches' shape may shift before they merge.** If T10–T12
   land differently from their task specs, stage 03 re-reads the merged code
   and adapts. Stage 03 should also re-check that
   `advantage-intelligence-ui` and `failure-retry` T1 have merged.

## Also consulted

- `docs/ui-revamp-guardrails.md` and `.skills/advantage-analytics-design/SKILL.md` (declared)
- `MAP.md` (declared)
- Live DB: `processing_jobs` columns, constraints, failure rows,
  `derivation_quality`, and `column_privileges`
- `claude/advantage-intelligence-ui-e6e2f7`: `analysis-failure-copy.ts`,
  commits 62500b73 and 1571d2bf, and the T8–T12 queue entries
- `claude/match-analysis-failure-retry-8769f3`: the T1–T3 queue entries
- `src/lib/services/splitstep/persist-transcript.ts` (rebuild on re-run)
- `src/lib/services/splitstep/derivation/reconcile.ts` (unresolved-winner gate)
- The fps sources checked in the first run (`splitstep-validator.ts`,
  `probe.ts`, `config.ts`, mediabunny types), now out of scope
- Two read-only code traces from the first run (server failure paths; UI
  surfaces and tests). Their file list is unchanged: `resubmit-job.ts`, the
  resubmit route, `reconcile.ts`, `derive-and-publish.ts`, the webhook route,
  `submit-match-video.ts`, `jobs/handler.ts`, `match-analysis.ts`,
  `match-analysis-server.ts`, `match-analysis-progress.tsx`,
  `drawer-sections.tsx`, `match-drawer.tsx`, `event-line-drawer.tsx`,
  `schedule-server.ts`, `use-live-match-analysis.ts`, `page.tsx` for
  `[matchId]`, `statistics-view.tsx`, `unpublished-stats-notice.tsx`,
  `analysis-mail.ts`, `tests/`

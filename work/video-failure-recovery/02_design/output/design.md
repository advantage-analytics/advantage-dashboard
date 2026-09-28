# Design — Retry only where it can help, and surface every video failure

Input: `01_brief/output/brief.md`. Decisions made in chat during this stage:

- **Deterministic derivation failures** (for example "5 point(s) resolved no
  winner") don't block the match. The page renders; statistics show as not
  available yet. We'll deal with the cause later.
- **SwingVision `process-match` errors are deferred.** They are the import
  path, not video, and the guardrails say never touch it (§2). They move to
  non-goals.

## What the live data says (2026-09-27)

Every non-healthy `processing_jobs` row in production:

| Job | Status | Code / step | Video | Stored note | Class this design gives it |
| --- | --- | --- | --- | --- | --- |
| 45ff4bd7 | failed | VIDEO_FRAME_RATE_TOO_LOW / trimming_video, category `invalid_input` | yes | "The video must be at least 29.9 fps." | Fix the recording |
| e6e8dea4 | failed | INTERNAL_ERROR / downloading_video | yes | "An unexpected error occurred…" | Retry |
| 70748f2a, cca2efbe | failed | none | **no** | "Failed to fetch" | Upload again |
| f91bad2c, eb7f9fe5 | failed | none | **no** | "Upload stopped before it finished…" | Upload again |
| 6b7406fa | failed | none | **no** | "Edge Function returned a non-2xx status code" | Upload again |
| b74a1e04 | derivation_failed | none | yes, results yes | "5 point(s) resolved no winner" | Stats unavailable (match shows) |
| c1d36200 | uploaded (stalled) | none | yes | "This match needs 2 hr 3 min of analysis but only 2 hr is left…" | Wait or ask (allowance) |
| 85518306 | uploaded (stalled) | none | yes | none | Retry (free "Try again") |

The vendor's own frame-rate floor is **29.9 fps**, taken from its rejection
message on 45ff4bd7. Our constant is `MIN_VIDEO_FPS = 30`.

## Approaches considered

**A. A pure classifier, derived at read time from the stored columns
(recommended).** A single pure function maps a job row (`status`,
`error_code`, `error_category`, `error_step`, whether the video and results
exist, attempts used) to a recovery class plus copy.

- Callers: the analysis loader (server), the Realtime hook (client, same
  function), `resubmitJob` and the new re-derive route all call it, so the
  button and the route cannot disagree.
- Existing rows classify correctly without any write, which the "no
  backfills" guardrail requires.
- The only writes this approach adds are codes that are missing today: submit
  refusals on stalled `uploaded` rows, and derivation failures.

**B. Persist a `recovery_class` column, written by every failure writer.**
Rejected.

- About ten writers set a failure, including two SQL functions
  (`reap_stalled_uploads`, `record_splitstep_webhook`) and the admin
  reconcile RPC. Every one of them would need to agree, and a missed writer
  leaves the class stale.
- Existing rows would need a backfill, which §2 forbids.
- A new vendor code would need a migration or a code change in several places.

**C. Map the copy on the client only.** Rejected.

- The resubmit route would still accept permanent failures, so the brief's
  core complaint (allowance and attempts spent on a doomed resend) would
  remain.

## Chosen design

### Architecture

A new pure module, `src/lib/data/failure-recovery.ts`, sits beside
`match-analysis.ts`. It has no server imports, so client code can use it.

```
classifyFailure(input) → { class, code, headline, body, action, note? }

input = { status, errorCode, errorCategory, errorStep,
          hasVideo, hasResults, attemptsUsed, isStalledSubmit }
```

**Recovery classes** (six: the brief's five plus the "match shows" case
decided in chat):

| Class | Action | Spends allowance or an attempt? |
| --- | --- | --- |
| `retry` | **Retry analysis** → `/resubmit` (failed row), or **Try again** → `/api/splitstep/jobs` (stalled `uploaded` row, which is free) | Resubmit: yes, bounded by the attempt ceiling. Try again: no |
| `upload_again` | **Upload the video again** → `addVideoHref(matchId)` | no |
| `fix_recording` | **Upload a new recording** → `addVideoHref(matchId)`, plus the requirement it failed | no |
| `wait_or_ask` | No button, or **Try again** once the reason has cleared (stalled row) | no |
| `rederive` | **Rebuild statistics** → new `/rederive` route | no. The vendor isn't called and no attempt is counted |
| `stats_unavailable` | None. The match page renders, and a quiet note stands in for statistics | no |

**Classification order.** The first rule that matches wins.

1. `uploaded` and stalled (`isSubmitStalled`):
   - `error_code = QUOTA_EXCEEDED` → `wait_or_ask` (allowance).
   - `NOT_ELIGIBLE` or `NO_BILLING_WORKSPACE` → `wait_or_ask` (permission).
   - Anything else, including no code, `INVALID_METADATA` and
     `SUBMIT_FAILED` → `retry` (free Try again).
2. `failed` and no video → `upload_again`. This rule comes before any code
   rule, because nothing can be resent.
3. `failed` and `isDownloadFailure(code, step)` → `retry`. This reuses the
   existing predicate from `resubmit-job.ts:119`, so the automatic retry rule
   stays a subset of this one.
4. `failed` and (`error_category ∈ {invalid_input, video_quality}` or
   `error_code ∈ FIX_RECORDING_CODES`) → `fix_recording`.
   - `FIX_RECORDING_CODES` = `VIDEO_FRAME_RATE_TOO_LOW`,
     `VIDEO_RESOLUTION_TOO_LOW`, `VIDEO_UNREADABLE`. Grow it as the vendor
     sends new codes.
5. `failed`, anything else → `retry`.
   - This covers `INTERNAL_ERROR`, `JOB_STALE`, `RESULTS_DELIVERY_LOST`,
     provider 5xx, and no code.
   - If `attemptsUsed ≥ MAX_TOTAL_ATTEMPTS` (3), the class becomes
     `wait_or_ask` ("contact us") instead, so the button never offers a
     retry the route will refuse.
6. `derivation_failed` with `error_code = DERIVATION_ERROR` → `rederive`.
   With `DERIVATION_REFUSED` or no code → `stats_unavailable`. That makes the
   one live row, b74a1e04, render its match.

**Unknown vendor codes** fall to rule 5 (`retry`). The attempt ceiling bounds
the spend. See Open questions.

### Components and changes

**1. The loader and live data carry what the classifier needs.**
- In `match-analysis-server.ts`, add `error_code`, `error_category`,
  `error_step`, `video_object_key`, `results_object_key` and
  `resubmitted_from_job_id` to the `processing_jobs` select.
- Map the two keys to booleans on the server. The keys themselves never reach
  the client.
- Compute `attemptsUsed` from the chain in rows already fetched for the match.
  That needs no extra query.
- `MatchAnalysis` gains `recovery: Recovery` and drops `failNote` from
  rendering. The field stays for email and ops.
- `use-live-match-analysis.ts` classifies the Realtime row with the same
  function. The Realtime payload carries the full row, so the booleans are
  derived there.
- The schedule surface gets this for free, because
  `readScheduleWithClient` calls the same `loadMatchAnalysis`.

**2. User copy comes from the class and code, never from `error_message`.**
- `RECOVERY_COPY` in the same module holds the headline, body and action for
  each class, with per-code overrides. Examples:
  - `VIDEO_FRAME_RATE_TOO_LOW`: "This recording runs below 30 frames per
    second, which Advantage Intelligence can't analyse. Record at 30 fps or
    higher (60 is best) and upload the new recording."
  - The upload-again body: "The video didn't finish uploading, so there's
    nothing to retry from. Upload it again — your match details are kept."
- `error_message` is shown only for codes whose message we write ourselves
  and know to be plain: `QUOTA_EXCEEDED`, which carries the "needs 2 hr 3 min
  … resets next month" sentence. That rule is an allow-list inside the module.
- The "Retrying uses the video you already uploaded" sentence moves into the
  `retry` copy only.

**3. The surfaces render the class.** Trace-route confirmed each one.
- `match-analysis-progress.tsx`, on `/dashboard/matches/[matchId]`:
  - It renders `recovery.headline`, `recovery.body` and one `RecoveryAction`.
  - It replaces the raw `failNote` line (219), the fixed retry sentence
    (222-224), the `status === "failed"` gates (232, 238) and the stalled
    branch's fixed copy (248-273).
- `drawer-sections.tsx` `AnalysisNotice`, used by the match drawer (list) and
  the event-line drawer (schedule): same swap.
  - `canRetry` becomes `canManage && recovery.action !== null`.
- `match-drawer.tsx`: its duplicate `RetryButton` (424-470) is replaced by
  the shared `RecoveryAction`.
  - `event-line-drawer.tsx`, which imports it, follows automatically.
- New `RecoveryAction` component (`match-detail/recovery-action.tsx`). It
  switches on class:
  - `retry` uses the existing `RetryActionButton` (for a failed row) or
    `RetrySubmission` (for a stalled row).
  - `rederive` uses `RetryActionButton` pointed at `/rederive`.
  - The two upload classes render an `advButton()` link to
    `addVideoHref(matchId)`.
  - The other classes render nothing.
- `analysisAction()` (`match-analysis.ts:555`): the matches-list row action
  follows the class instead of "Start over" for every failure.
- `stats_unavailable` is not grouped as "Failed" in the list. It groups with
  "Ready" and is labelled "Stats unavailable", reusing `ANALYSIS_LABEL.manual`'s
  wording.
- `analysis-mail.ts` / `email/templates/analysis.ts`: the failure email uses
  the same class copy instead of the raw `error_code` and `error_message`.

**4. `resubmitJob` refuses permanent classes.** File: `resubmit-job.ts`.
- The parent select gains `error_code`, `error_category` and `error_step`.
- After the `not_failed` check (:323), and before `loadChain`, the blob HEAD,
  the child insert and `reserveQuota`, it runs `classifyFailure`. Anything
  other than `retry` returns a new reason, `not_retryable` (the route maps it
  to 409), with the class body as the message.
- The `auto` path is unchanged. `isDownloadFailure` ⊂ `retry`, so the two
  can't conflict.

**5. Stalled `uploaded` rows keep their real reason.**
File: `submit-match-video.ts:443-462`.
- On a refusal that leaves the row `uploaded`, write `error_code` from the
  HTTP status: 429 → `QUOTA_EXCEEDED`, 403 → `NOT_ELIGIBLE`,
  422 → `INVALID_METADATA`, 503 → `NOT_CONFIGURED`.
  - The browser already has UPDATE on `error_code` (verified in
    `column_privileges`), so this needs no migration.
- On a 502, the handler has already marked the row `failed` with the vendor
  text (`handler.ts:680-700`), so the client stops overwriting it with "Could
  not submit this match for analysis.".
- "A submit failure must not mark the job failed" (guardrails §3.1) still
  holds: the client never sets `status`.

**6. Derivation failures carry a code; transient ones can be rebuilt.**
- `derive-and-publish.ts` writes `error_code`:
  - `DERIVATION_REFUSED` when `persistTranscript` refuses (:77-80). This is
    deterministic.
  - `DERIVATION_ERROR` on an RPC error or a throw (:115-121, :187-190). This
    is transient.
  - That is its only change. `calculate_match_stats` is called, never
    edited (§2).
- New route `POST /api/splitstep/jobs/[jobId]/rederive`. Following the
  §2 pattern, `route.ts` is wiring and `handler.ts` holds the decision with
  injected dependencies.
  - Auth: the same ladder as `/resubmit` (signed in, `created_by` is the user).
  - It requires `status = derivation_failed`, `classifyFailure` = `rederive`
    and `results_object_key` present.
  - It claims the job with a conditional update,
    `derivation_failed → deriving where status = 'derivation_failed'`, so a
    double click is refused 409.
  - Then it runs `deriveAndPublish({ deadline })` inside `maxDuration`.
  - Re-running is safe: `persist-transcript.ts:203` deletes the match's
    derived points before inserting.
  - No allowance and no attempt are used.

**7. `stats_unavailable`: the match shows.**
- `page.tsx`'s short-circuit (`isInFlight || isAnalysisFailed`, 226-227)
  narrows. For `stats_unavailable` it renders the normal page with a new
  `meta.statsUnavailable` flag.
  - Guardrails §3.3 says keep the gate because stat sections draw zeroes.
    This design keeps the gate for every other class. For this one class,
    the **Statistics tab renders a quiet note in place of every stat section**
    (`statistics-view.tsx`, the same slot `UnpublishedStatsNotice` uses).
    Film plays if `hasPlayableVideo`, and Visualizations shows its existing
    empty state.
  - Copy: "Statistics aren't available for this match yet. The video and
    match details are all here."
- §3.3 gets an amended entry recording the narrowing.

**8. Unreconciled score folds show a caveat.**
- `derive-and-publish.ts:163`: instead of the console.warn alone, merge
  `{ fold: { reconciled: false, reason } }` into the job's existing
  `derivation_quality` jsonb. It already exists, is written at grade time and
  needs no migration.
- `match-detail-server.ts` exposes `meta.foldUnreconciled`. The Statistics
  tab shows a grey note strip (`noteStripCls`) above the stats: "Advantage
  Intelligence couldn't match every point to the final score you entered, so
  some points may sit in the wrong game. The score shown is the one you
  entered."
- On the match page only (resolved from the brief's open question): the list
  and drawers stay quiet.
- `UnpublishedStatsNotice` currently claims every point "has been checked
  against the final score you entered". That clause is dropped when the flag
  is set.
- Jobs derived before this change have no flag and show no caveat. No
  backfill.

**9. A failed results download after vendor completion recovers.**
- `reconcile.ts` adds a second, separately capped sweep: `status = completed`,
  `results_object_key is null`, `derivation_version is null`, `completed_at`
  older than 10 minutes.
  - It re-fetches results from the stored strokes URL (`sas_url`) with the
    webhook's own download and `finalize_splitstep_results` step, then
    `deriveAndPublish`.
  - It runs in `after()`, so a page render never waits on a results download
    or the insights call.
  - If the URL has expired (`sas_expires_at < now`) or the fetch fails
    twice, the row is marked `failed` with `RESULTS_DELIVERY_LOST`. That code
    is already used and already plain, and it classifies as `retry`.
- **Webhook signature 401s need no new code.** The existing poll (`reconcile.ts`
  :211-227) already moves a `processing` job the vendor finished to
  `failed / RESULTS_DELIVERY_LOST` after 30 minutes. It now classifies as
  `retry` with plain copy instead of sitting at "Processing". The
  only remaining gap is that the schedule page doesn't run reconcile; that
  stays a gap (see Open questions).

**10. The wizard's frame-rate check agrees with the vendor.**
- Why 45ff4bd7 got through, most likely: `snapToStandardFps` has a 2%
  tolerance, so any measured rate from about 29.4 to 30.6 snaps to 30. On top
  of that, `measureFps` samples only 20 presented frames. A variable-rate
  phone clip that averages, say, 29.7 passes our check and fails the vendor's
  29.9 floor, which it applies to the average.
  - Not yet confirmed. See Open questions for the check.
- Add a container-level average: mediabunny (already a dependency,
  `media-inspection.ts`) `getPrimaryVideoTrack().computePacketStats()`
  → `averagePacketRate`. That is the same figure ffmpeg reports, and ffmpeg
  is what the vendor runs.
  - It is compared **unsnapped** against a new
    `VENDOR_MIN_AVERAGE_FPS = 29.9` in `config.ts`, with a comment citing
    the vendor's rejection text.
  - Below it → a pick-time refusal in `evaluateVideoProbe`: "This video
    averages 29.7 fps. Advantage Intelligence needs at least 30 — record at
    30 fps or higher."
  - If mediabunny can't read the container, the check falls back to today's
    behaviour, where a null rate is a warning and never a refusal.
- The trim cut is a remux, so it keeps the source rate, and one check at pick
  time covers it.

### Data flow

```
failure writers (unchanged, plus new codes from 5 and 6)
        │  processing_jobs: status, error_code/category/step, keys
        ▼
loadMatchAnalysis ──► classifyFailure ──► MatchAnalysis.recovery ──► page / drawers / list / email
useLiveMatchAnalysis (Realtime row) ──► classifyFailure ──┘
resubmitJob / rederive handler ──► classifyFailure ──► refuse unless the class matches
```

### Error handling

- The classifier is total: every input returns a class, and the default is
  `retry`, bounded by the ceiling. It never throws.
- `RecoveryAction` keeps `RetryActionButton`'s existing network and refusal
  handling. A refusal message from `/resubmit` or `/rederive` is now plain
  class copy, so showing it verbatim is safe.
- The `/rederive` claim is conditional, so a concurrent reconcile sweep or a
  double click can't run derivation twice.
- If the fps packet-stats read throws or times out, the check degrades to the
  existing rVFC probe, and the wizard never refuses on uncertainty.

### Testing

The offline specs follow the repo pattern: pure modules are imported
directly, and components go through `tests/fixtures/vm-modules.ts`.

- `tests/failure-recovery.spec.ts`: a table-driven test of `classifyFailure`
  over the ten live rows above plus each code path, the ceiling downgrade and
  unknown codes. It also asserts that no copy string contains "splitstep",
  "Edge Function", "Failed to fetch", `<?xml` or "failed:".
- `tests/resubmit-authorization.spec.ts` (extend): `not_retryable` for
  fix_recording and upload_again rows, asserting that `reserveQuota` and the
  child insert are **never called**.
- `tests/rederive-handler.spec.ts`: the auth ladder, class gate, conditional
  claim (a second call gets 409) and `deriveAndPublish` called once, all with
  injected dependencies.
- `tests/upload-video-requirements.spec.ts` (extend): `evaluateVideoProbe`
  with `averageFps` 29.7 refuses, 29.97 passes and null warns.
  `tests/match-video-probe.spec.ts` gets a variable-rate fixture if one can be
  generated small.
- `AnalysisNotice` / `MatchAnalysisProgress` render specs via vm-modules:
  given a row whose `error_message` is Azure XML, the raw string is absent
  from the markup. Each class renders its action or none.
- `tests/match-film-entry.spec.ts`'s source-order assertion still holds, and
  a new assertion checks that `stats_unavailable` bypasses the short-circuit.
- `/pr-check` Stage 3b eyes-on covers the match page, drawer and schedule
  drawer for a seeded failure of each class.

### Guardrails bookkeeping

- `docs/ui-revamp-guardrails.md` §2 gets one reviewed-exception entry. It
  covers the frozen files touched:
  - `resubmit-job.ts` (refusal only)
  - `derive-and-publish.ts` (codes plus the fold flag)
  - `reconcile.ts` (results-recovery sweep)
  - `submit-match-video.ts` (error_code and no overwrite)
  - `config.ts` (the constant)
  - the new `/rederive` route and handler
- §3.3 gets a note on the narrowed short-circuit.
- `docs/video-pipeline-overview.md:603-615` is stale (it says the error
  columns and the status endpoint are unused). Correct it in the same PR.
- No migration. Every new column write targets columns that exist and are
  already granted.

## Open questions

1. **Confirm the fps hypothesis on 45ff4bd7 before building item 10.** Run
   `ffprobe` on its blob (azure-storage skill): `avg_frame_rate` below 29.9
   while a 20-frame rVFC sample reads about 30 confirms it. If the file is a
   constant 29.97, the vendor's 29.9 floor is doing something else and item
   10 needs rethinking. Stage 03 should make this the first task.
2. **Unknown vendor codes default to Retry.** That repeats one allowance
   spend per unknown rejection until the code is added to
   `FIX_RECORDING_CODES`. The alternative is to default unknown
   `invalid_input` or `video_quality` *categories* to `fix_recording`, which
   rule 4 already does. Rule 5 then only catches unknown `internal` failures.
   Recommend keeping it.
3. **Who may re-derive.** This design mirrors `/resubmit` (the uploader only).
   A team coach viewing a player's match gets no button. Is that right for
   teams? The drawer's `canManage` suggests coaches expect to act.
4. **Wait-or-ask copy on a team workspace.** Should it name who to ask (owner
   or coach)? The design uses a generic "ask your team's owner" for
   `NOT_ELIGIBLE`.
5. **The schedule page doesn't reconcile.** A job stuck from a 401 recovers
   only when someone opens the match page or the list. Acceptable (this
   design), or should `readScheduleWithClient` call
   `reconcileBeforePageRead` too?
6. **`stats_unavailable` pages still say "statistics aren't available yet"
   indefinitely.** Fine under "we will deal with this later", but b74a1e04's
   owner gets no signal when or if it changes.

## Also consulted

- `docs/ui-revamp-guardrails.md` and `.skills/advantage-analytics-design/SKILL.md` (declared)
- `MAP.md` (declared)
- Live DB: `processing_jobs` columns, check constraints, failure rows,
  `derivation_quality`, and `column_privileges` for `authenticated`
- `src/lib/services/upload/validators/splitstep-validator.ts` (fps gate)
- `src/lib/video/probe.ts` (snap tolerance, 20-frame sample)
- `src/lib/services/splitstep/config.ts` (`MIN_VIDEO_FPS`)
- `src/lib/services/splitstep/persist-transcript.ts` (rebuild on re-run)
- `src/lib/services/splitstep/derivation/reconcile.ts` (unresolved-winner gate, `ACCEPT_UNRECONCILED_FOLD`)
- `node_modules/mediabunny/dist/mediabunny.d.ts` (`computePacketStats`, `averagePacketRate`)
- Two read-only code traces (server failure paths; UI surfaces and tests),
  which covered `resubmit-job.ts`, the resubmit route, `reconcile.ts`,
  `derive-and-publish.ts`, the webhook route, `submit-match-video.ts`,
  `jobs/handler.ts`, `api/upload/route.ts`, `match-analysis.ts`,
  `match-analysis-server.ts`, `match-analysis-progress.tsx`,
  `drawer-sections.tsx`, `match-drawer.tsx`, `event-line-drawer.tsx`,
  `schedule-server.ts`, `use-live-match-analysis.ts`, `page.tsx` for
  `[matchId]`, `statistics-view.tsx`, `unpublished-stats-notice.tsx`,
  `analysis-mail.ts`, and `tests/`

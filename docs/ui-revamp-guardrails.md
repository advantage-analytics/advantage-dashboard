# UI revamp guardrails — what the Advantage Intelligence pipeline needs from the UI

**Status:** current as of 2026-08-15, branch `splitstep-integration` @ `60204fd`
**Read alongside:** [`video-pipeline-overview.md`](video-pipeline-overview.md) (how the pipeline works), [`ux-overhaul-brief.md`](ux-overhaul-brief.md) (what to build — but see §6, parts of it are stale)

The video pipeline works end to end and has carried one real full-length match.
This document exists so a UI rewrite does not silently break it. It is written
for an agent or developer who did not build the integration.

The short version: **the UI owns everything the player sees. It does not own the
five inputs the vendor needs, the status vocabulary, or the deletion path.**
Redesign freely around those.

---

## 1. What is done — do not re-litigate

Verified against a real job (86 min, vendor job `778912d7`, our job
`2a11168d`), not a test harness:

|                                  | Evidence                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| Chunked upload → Azure           | 1.54 GB committed                                                           |
| Auto-submit on upload completion | vendor accepted, `external_job_id` recorded                                 |
| `VideoUrl` SAS                   | vendor fetched it                                                           |
| Webhook receipt + HMAC           | 2 deliveries, both `signature_verified: true`                               |
| Signature enforcement            | `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true`, suite green                     |
| Results JSON                     | 645 KB → `match-results` bucket                                             |
| Trimmed video capture            | 1.43 GB copied into our container, `copyStatus: success`                    |
| Source reclaim                   | 1.54 GB deleted, vendor's SAS neutralised (policy since retired, see below) |
| Quota                            | reserved to the second; refund on failure tested                            |

Turnaround was 75 minutes for an 86-minute video. Their results SAS expires
after ~7 days.

**What the trimmed video actually is** (watched 2026-08-16, after the table
above was written): the `StartTime`/`EndTime` window from our own job request,
re-encoded. Not dead time removed, no annotations, no overlays. Submitted window
5181.207s, returned video 5181.268s. Anything in the UI that offers this file to
a player should call it the match video, never a highlight or condensed cut —
for a player who trimmed nothing it is their upload at a lower bitrate.

**Superseded, September 2026:** the vendor copy also arrived with **no audio
track**. It is no longer downloaded, and the source is no longer deleted. The
browser now cuts the selected window out of the athlete's own file before upload
(a remux — `src/lib/video/trim.ts`), the job is sent as `StartTime 0 / EndTime =
cut length`, and that file is what the film room plays
(`src/lib/data/match-video-choice.ts`). It is still the match video, never a
highlight. The cut is **not** written faststart — its `moov` follows the `mdat`,
because Mediabunny's `'reserve'` mode needs a per-track packet count that a copy-only
`Conversion` cannot supply and `'in-memory'` would hold the whole cut in memory (see the
comment on `fastStart` in `src/lib/video/trim.worker.ts`), so every trimmed file on Azure
keeps its metadata at the tail; an untrimmed original keeps whatever layout the camera
wrote.

---

## 2. Never touch

**The SwingVision path.** `swingvision-parser.ts`, `swingvision-validator.ts`,
the `process-match` Edge Function, and every existing row. Every video code path
is additive; nothing about the file-import flow was changed and nothing should
be. Doubles teams and existing users depend on it.

**`calculate_match_stats`.** If you believe it must change, stop and ask.

**Existing match data.** No backfills, no mutations.

> **One reviewed exception, added 2026-08-22: `merge_program_players`.**
>
> The roster's duplicate-repair tool re-points `matches.player1_id` /
> `player2_id` from an absorbed profile to the one that survives. It was
> weighed against this rule and allowed, because it is the opposite of what the
> rule is aimed at — a silent bulk rewrite during a redesign. It is: a single
> explicit action by program staff, requiring both rows to already carry the
> same name AND the operator to type that name; scoped to one program's rows
> carrying one id; touching **only** the attribution columns — never `score`,
> `format`, `program_id` or `event_entry_id`, and nothing under `match_stats`,
> `points` or `shots`; and audit-logged to `program_audit_log` with every match
> id it moved, so a mistake can be reversed by hand.
>
> Nothing else in the coach-managed-profile feature writes to an existing match.
> Claiming a profile deliberately does not: the profile id stays in
> `player1_id`, and `my_player_ids()` in the read predicate is what lets the
> claimant see their own history. That is the whole reason the claim was built
> as a binding rather than a re-attribution.
>
> `calculate_match_stats` is untouched and does not re-run — every player-level
> aggregate is computed at read time, and `match_stats` is keyed on
> `match_id` + `is_player1`, never on a player id.

> **A second reviewed exception, added 2026-09-01: `release_my_account_from_programs`.**
>
> Account deletion re-points `matches.player1_id` / `player2_id` from the
> departing login id to that person's roster profile id, on one program's
> rows, and clears `created_by` on the same rows. Weighed against this rule
> on the merge exception's terms and allowed for the same reason: it is the
> opposite of a silent bulk rewrite. It is a single explicit action by the
> data subject; scoped to their own rows in programs they belong to;
> touching **only** the attribution and uploader columns — never `score`,
> `format`, `program_id` or `event_entry_id`, and nothing under
> `match_stats`, `points` or `shots`; and audit-logged to `program_audit_log`
> as `member.account_deleted` with the counts. Without it a self-uploaded
> team match would detach from the coach-managed profile the moment the
> login that filed it disappears. Design:
> `docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md`.

> **A third reviewed exception, added 2026-09-13: `attach_match_to_event_line`.**
>
> The Edit Match dialog's "Add to an event" files an existing one-off team
> match under a scheduled line. It writes `event_entry_id` — which
> `matches_block_client_regraft` otherwise refuses to move on UPDATE — plus
> the facts the line owns (`tournament_name`, `round`, `date`, `match_type`,
> `court_type`). Allowed on the same terms as the two above: a single explicit
> action by the match's own uploader, who must also run that program's
> schedule; scoped to one match and one line in the same program; only from
> no line to a line (never between lines, never off one); **never** `score`,
> `format`, `player1_id` or `program_id`, and nothing under `match_stats`,
> `points` or `shots`; and audit-logged to `program_audit_log` as
> `match.attached`. The trigger accepts the transition only inside that
> function (a transaction-local marker), so its checks — singles line, not
> forfeited, no other match on the line or round — and the audit row cannot
> be skipped by a bare client UPDATE. `guard_schedule_result` still refuses a
> line with a saved outcome. Migration:
> `supabase/migrations/20260913120000_attach_match_to_event_line.sql`.

> **A fourth reviewed exception, added 2026-09-29: the event-delete detach in
> `guard_event_delete`.**
>
> Deleting a schedule event that holds matches leaves those matches as
> unassigned program matches (decision 2026-09-22, PR #255). The detach was
> meant to ride on `matches_event_entry_id_fkey ON DELETE SET NULL`, but that
> referential UPDATE fires `matches_block_client_regraft`, which refused every
> entry → NULL move for a signed-in user, so no event with a match could be
> deleted from the app. The BEFORE DELETE trigger on `program_events` now
> performs the detach itself, and the regraft trigger accepts the move only
> while a transaction-local marker names the event the entry belongs to.
> Allowed on the attach exception's terms: a single explicit action by an
> owner or coach who runs that program's schedule (`delete_schedule_event`);
> scoped to the matches on the lines of the one event being deleted; only
> from a line to no line; touching **only** `event_entry_id`,
> `tournament_name` and `round` (`date`, `match_type` and `court_type` stay —
> they hold without a line; a round only means something inside the line
> that gave it) — **never** `score`, `format`, `player1_id` or
> `program_id`, and nothing under `match_stats`, `points` or `shots`; and
> audit-logged to `program_audit_log` as `event.deleted` with
> `detached_matches`, counted before the detach. A bare client UPDATE that
> nulls `event_entry_id` is refused exactly as before. Migrations:
> `supabase/migrations/20260929210705_event_delete_detaches_under_client.sql`,
> then `round` added to the detach in `20260929213016_detach_clears_round.sql`.
>
> The same exception covers `detach_match_from_event_line`, added the same
> day: the single-match inverse of `attach_match_to_event_line`, from the
> Edit Match dialog. It is allowed on the attach exception's terms exactly —
> a single explicit action by the match's own uploader, who must also run
> that program's schedule; scoped to one match; only from a line to no line;
> touching **only** `event_entry_id`, `tournament_name` and `round` (`date`,
> `match_type` and `court_type` stay — they describe the match, not the
> line) — **never** `score`, `format`, `player1_id` or `program_id`, and
> nothing under `match_stats`, `points` or `shots`; and audit-logged to
> `program_audit_log` as `match.detached` with the match, entry and event
> ids. The regraft trigger accepts the move only while a second
> transaction-local marker names that one match, so a bare client UPDATE
> stays refused; a saved outcome on the line does not block the detach and
> is left untouched. Migrations:
> `supabase/migrations/20260929210741_detach_match_from_event_line.sql`,
> then `round` added to the detach in `20260929213016_detach_clears_round.sql`.

> **A fifth reviewed exception, added 2026-09-29: `set_match_round_on_line`.**
>
> The Edit Match dialog's "Edit round" changes the round of a match that is
> already on a tournament line — the one column the attach set on the way on
> and the detaches cleared on the way off, with no path in between except
> detach-and-re-attach (two audit rows, and `date`, `match_type` and
> `court_type` re-derived from the event). Allowed on the attach exception's
> terms exactly: a single explicit action by the match's own uploader, who
> must also run that program's schedule; scoped to one match; tournament
> lines only (a dual line's round is its slot, and the line decides it); the
> match stays on its line; touching **only** `round` — **never**
> `event_entry_id`, `tournament_name`, `date`, `match_type`, `court_type`,
> `score`, `format`, `player1_id` or `program_id`, and nothing under
> `match_stats`, `points` or `shots`; and audit-logged to `program_audit_log`
> as `match.round_changed` with the match, entry and event ids and the
> `from`/`to` rounds. The function refuses a blank round and a round another
> match on the entry already holds; `guard_schedule_result` still refuses one
> with a saved outcome. The regraft trigger now also fires on `round`, and
> accepts a round change on a linked match only while a third
> transaction-local marker names that one match — so a bare client UPDATE of
> `round` on a linked match is refused, while a round change on an unlinked
> match (the Details form) passes as before. Migration:
> `supabase/migrations/20260929215610_set_match_round_on_line.sql`.

> **A one-off data repair, 2026-09-26: two `matches.result` captions.**
>
> Not a code path — a single hand-run `UPDATE`, approved by the owner in
> session, recorded here so the rule's history stays complete. `matches.result`
> is the caption over the score, not an outcome (`patch-match.ts` explains
> why). An earlier version of the score-edit endpoint overwrote it with `win`,
> and two SwingVision rows (`5b882f87-…`, `e4b2e025-…`) still carried that word,
> which the matches gallery printed as "WIN" above the score. Their `result`
> was reset to `player1_name || ' Wins'` — "Scott Watson Wins", the caption
> SwingVision itself writes — guarded on `result = 'win'` and
> `score.winner = 'player1'`, which both rows had. **Only** `result` changed;
> never `score`, attribution, `program_id`, or anything under `match_stats`,
> `points` or `shots`. Blank captions (`""`) were fixed in the read path
> instead, not by rewriting rows. This is not a precedent for backfills.

> **A reviewed exception, added 2026-09-26: guards on the frozen paths, from the
> final-pass codebase review** (`claude/code-review-tools-order-68b9e9`, tasks
> T9–T11, T13, T15, T18, T21 in its queue). Each is a refusal or a bookkeeping
> fix, never a change to what a file parses, attributes or computes:
>
> - `process-match` (and `generate-insights`, `generate-key-moments`) now verify
>   the caller — service role, or a user token whose `matches.created_by` is the
>   match — pin the bucket and object prefix, and refuse a second run for a match
>   that already has points. The body's `userId` is never read. Parsing,
>   `is_player1` (still keyed on the Settings "Host Team" cell) and every write
>   shape are as they were. Not yet deployed — a user step, all three together.
> - `swingvision-parser.ts` `transformToFormData` no longer swaps
>   `playerName`/`opponentName` on the blank-Guest fallback: host is always
>   player1, which is what `process-match` already assumed, so the name and the
>   statistics agree. The flag, its detection and every other parser path are
>   untouched; no existing row is touched.
> - `upload-url/route.ts` `recordBlobName` writes only the match's live job
>   (`status in pending|uploading|uploaded`); `submit-match-video.ts`'s terminal
>   `uploaded` write moved into `mark-job-uploaded.ts`, is checked and retried
>   once, and a failure marks the job failed instead of submitting into a 409.
>   `upload-url/handler.ts` and `video-url/types.ts` changed doc comments only.
> - `process-match`'s four writes — `points`, `shots`, `calculate_match_stats`,
>   `backfill_returns_in_and_net_points` — now run inside one Postgres function,
>   `import_match_rows` (T18), in one transaction under a per-match advisory
>   lock: a match has all of them or none, and a concurrent second run is
>   refused with the pre-check's 409 instead of doubling every statistic. Point
>   ids are assigned by the edge function (`crypto.randomUUID()`) before the
>   call rather than returned by the insert. Every row value, the `is_player1`
>   keying and `calculate_match_stats` itself are unchanged — the RPC calls it,
>   never edits it — and no existing row is touched. Migration
>   `supabase/migrations/20260927040947_import_match_rows.sql`, applied live
>   2026-09-26. The function is still not deployed — the user's step, and the
>   migration had to land first.
> - `process-match` also carries the admin console's claim flow (T21), which
>   the live function — v22, deployed 2026-09-19 from `codex/admin-uploads`, a
>   branch never merged here — had and this file did not, on top of T9's
>   guards and T18's RPC. Every call asks `admin_claim_match_file` whether the
>   match is a console attempt; the answer is null for every other match, so
>   the SwingVision upload path is unchanged — except that `resolveStoragePath`
>   now also refuses, on the percent-decoded path, the `_admin-console/`
>   namespace, a `..` segment and a backslash (a literal `%` in a file name
>   still resolves). A claimed attempt takes its one
>   file, its actor and the sha256 from `admin_file_attempts` — the body decides
>   nothing — hashes the downloaded bytes before parsing and refuses a
>   mismatch, and settles the attempt through `admin_finish_match_file` after
>   `import_match_rows`: completed, or failed for review on any other exit. So:
>   a claim before the writes, a digest check on the bytes, a finish after.
>   Parsing, `is_player1`, every row value and `calculate_match_stats` are
>   unchanged and no existing row is touched. Both RPCs are already live
>   (`schema_migrations` 20260919044716), so nothing was applied; the codex
>   migrations are cited, not copied. Still not deployed — the user's step.
>
> `calculate_match_stats`, `swingvision-validator.ts` and existing match data
> were not touched. Anything beyond this list on these paths still needs its own
> entry here.

**These files are the integration, not UI.** Changing them to suit a layout is
almost always the wrong fix:

```
src/app/api/webhooks/splitstep/route.ts     receives vendor deliveries
src/app/api/splitstep/jobs/route.ts        wiring: clients, deps, the after() block
src/app/api/splitstep/jobs/handler.ts      the decision: eligibility, quota, vendor
src/app/api/splitstep/upload-url/route.ts  wiring: clients, deps, the blob-name write
src/app/api/splitstep/upload-url/handler.ts  the decision: eligibility, a read-only allowance peek, then the SAS
src/lib/services/splitstep/**              payload build, keys, quota, Azure
supabase/migrations/**                     never edit an applied migration
```

Each `route.ts` above is now wiring only; the authorization ladder lives in the
sibling `handler.ts`, which takes its I/O as injected dependencies so the vendor
call and the quota reservation can be stubbed in a test. If you are looking for
where a request is _refused_, it is the handler. The split exists because Next
reserves a route file's exports to the HTTP methods, so there was nowhere else
to put a testable seam.

> **User-approved exception, 2026-09-19: `upload-url/handler.ts` now peeks the
> allowance before minting.** After the `explainVideoRefusal` check and before
> `videoObjectKey()` / `mintUploadSas`, the handler reads
> `processing_jobs.billable_seconds` for the match and calls `peekQuota()`
> (`src/lib/services/splitstep/quota.ts`) for the billing workspace. A window
> that will not fit answers 429 with `{ error, usedSeconds, capSeconds }`
> before a credential is ever signed, so a doomed upload does not push
> gigabytes to Azure only to be refused at `reserveQuota()` afterward. The
> peek is a plain read — no insert, no lock — and fails open: a failed or
> unreadable figure is logged and the handler proceeds to mint, because
> `reserveQuota()` at `/api/splitstep/jobs` remains the sole authority and
> still refuses at the spend either way.

> **A reviewed exception, added 2026-09-27: the admin console's video path,
> from `codex/admin-uploads`.** The admin console submits a video for a
> program's match through the same two routes the wizard uses, so `jobs/` and
> `upload-url/` each gain one `adminVideo` branch rather than a second copy of
> the decision. `authorizeAdminVideo()` re-verifies the caller through the
> `admin_video_access` RPC (program active, the actor is the operation's owner
> and an admin, roster eligibility) and builds the billing workspace with the
> same `getAdminUploadContext()` every other console path uses, so
> `canSubmitVideo` comes from the one `program.status === "active"` rule;
> `uploadEligibility()` itself is called unchanged. Quota for an admin job
> goes through `admin_reserve_video_quota`, which calls the same
> `reserve_processing_quota()` as `reserveQuota()` — one ledger, two authorised
> callers. A later submit that disagrees with the job row's saved
> `initialTopPlayerIsPlayer1` / `adScoring` / `fixedCamera` is refused 409; the
> three inputs keep their meaning and `job-request.ts` is untouched. Two fixes
> rode along for every caller: `submitting.error` is now checked, and
> `recordBlobName` writes only the match's live job. Also on the frozen list
> and covered by this entry: `video-url/azure-sas.ts` accepts an optional
> `AZURE_STORAGE_ENDPOINT` for the Azurite emulator, only outside production
> and only for plain http on a loopback host (`tests/azure-local-endpoint.spec.ts`
> asserts the production refusal); and `swingvision-parser.ts` /
> `swingvision-validator.ts` change one line each in `getExcelJS()` —
> `exceljs.default ?? exceljs`, the ESM/CommonJS interop the admin file route
> needs to run them in Node — with parsing, validation, attribution and the
> blank-Guest fallback untouched. The webhook route is not touched.

> **A reviewed exception, added 2026-09-27: input-rejected retries and the
> frame-rate warning, from `claude/match-analysis-failure-retry-8769f3`**
> (tasks T1–T3 in its queue). Both touches are a refusal or a constant, never a
> change to what the pipeline sends, bills or computes:
>
> - `resubmit-job.ts` selects the parent's `error_category` and refuses to
>   resubmit one the vendor marked `invalid_input` (reason `input_rejected`,
>   409 from the resubmit route). Resubmitting sends the identical blob, so it
>   can only fail the same way and spend quota. The refusal sits after the
>   existing not-failed check and before the video check, returns before
>   `reserveQuota()`, and lives inside `resubmitJob()` so the webhook,
>   `reconcile.ts` and jobs-route auto paths inherit it unchanged; the route's
>   ownership check still runs first, so only the uploader sees the message.
>   Live case: job 45ff4bd7, `VIDEO_FRAME_RATE_TOO_LOW`.
> - `config.ts` gains `MIN_CONTAINER_AVERAGE_FPS = 29.97`, read only by the
>   upload validator. A file whose whole-track container average (MP4/MOV, via
>   `src/lib/video/container-frame-rate.ts`) is under it is refused before
>   upload, in every browser. This is not an invented floor: the vendor's API
>   docs (https://splitstep.ai/api-docs.html, re-read 2026-09-27) guarantee
>   "29.97 fps (NTSC) and higher is accepted"; genuine NTSC (30000/1001)
>   reads 29.97 to two decimals and passes. The vendor measures lower than
>   the container (29.80 against a 29.94 average for the same file), which is
>   why the band under 29.97 is refused rather than gambled on. Q14 in
>   `docs/splitstep-vendor-questions.md` was answered 2026-09-28: the vendor's
>   hard gate is now 25 fps, and it still recommends 29.97 or higher. The
>   existing 30 fps floor on the browser sample (`MIN_VIDEO_FPS`) is unchanged.
>   **Revised 2026-09-29:** `MIN_CONTAINER_AVERAGE_FPS` is 29.5 and a new
>   `RECOMMENDED_CONTAINER_AVERAGE_FPS` (29.97) bounds a band that uploads with
>   one warning instead of a refusal — both sub-29.97 jobs publish on
>   derivation 0.6.0, and full-length phone footage averaging 29.74–29.94 was
>   being turned away. Reasoning under Q14 in the vendor-questions doc. The
>   same day the container average became the judge whenever it is known: the
>   browser's 20-frame sample refuses on its own only when the container could
>   not be read (a 29.94 file was refused on a 29.2 sample from its first
>   twenty frames).
>
> `job-request.ts`, the three inputs in §4, `canSubmitVideo` and the webhook are
> untouched.

> **A reviewed exception, added 2026-09-28: video failure recovery, from
> `claude/video-retry-failure-surfacing-055fd8`.** A stuck or failed video job
> now has a real recovery path instead of a dead "failed" row. Each frozen file
> gained one narrow capability, never a change to what it sends, bills or
> computes:
>
> - `resubmit-job.ts` — **refusal only.** `resubmitJob()` now classifies the
>   parent through `classifyFailure()` (the one recovery-class function, also
>   used by the matches list and match page) instead of its own
>   `error_category === "invalid_input"` check, and refuses before
>   `reserveQuota()` for any class but `retry`: `fix_recording` (unchanged
>   behaviour, now reached through the shared classifier) and the new
>   `upload_again` (no video to resend from) each return their own refusal
>   reason; any other class is refused too, as a fail-safe rather than a
>   fallthrough. `isDownloadFailure` and `MAX_TOTAL_ATTEMPTS` moved to
>   `src/lib/data/match-analysis.ts` (client code needs them without pulling in
>   this file's `@azure/storage-blob` dependency) and are re-exported from here
>   unchanged, so no caller's import broke.
> - `submit-match-video.ts` — **code write, no overwrite on a handler failure.**
>   A submit refusal now writes `processing_jobs.error_code` (via the new
>   `refusal-code.ts`) alongside the existing `error_message`, always
>   including `null` so a stale code from an earlier refusal cannot survive
>   onto one that doesn't carry one. It never writes on a 502, because that
>   status means the handler's own vendor-POST failure path already marked the
>   row `failed` with the vendor's text; writing here would stomp it. Still
>   never marks the row `failed` itself — status stays `uploaded`, as before.
> - `derive-and-publish.ts` — **code and flag write.** A failed derivation now
>   records `error_code`: `DERIVATION_REFUSED` when `persistTranscript` refused
>   deterministically (won't reconcile, no results, provider mix), or
>   `DERIVATION_ERROR` for everything else (a thrown exception, an RPC
>   failure), read from `persist-transcript.ts`'s new `failure` field (see
>   below). A successful derivation whose winner fold did not reconcile now
>   merges `{ fold: { reconciled: false, reason } }` into the existing
>   `derivation_quality` (read-modify-write, keeping `grade-results.ts`'s
>   other keys); the merge is logged and swallowed on error so it can never
>   turn a published match back into a failure. Every row value the
>   derivation itself computes is unchanged.
> - `persist-transcript.ts` — **return-shape only.** `PersistOutcome`'s failure
>   arm and `buildTranscriptForJob()`'s return both gained a
>   `failure: "refused" | "error"` field, stated at each return site, so a
>   caller can tell a deterministic refusal from a transient error. No write,
>   no query and no returned value besides that field changed.
> - a new `/api/splitstep/jobs/[jobId]/rederive` **route + handler** — the
>   "Rebuild statistics" action for a `derivation_failed` job classified
>   `rederive`. `route.ts` is wiring (session, service-role client,
>   `deriveAndPublish()`); `handler.ts` holds the ladder — signed in, owns the
>   job (404 either way, never confirming another user's job), rebuildable
>   (`derivation_failed`, `classifyFailure()` says `rederive`, results already
>   stored), claim (`status = 'deriving'` only where still
>   `derivation_failed`, so two clicks can't both derive), then one bounded
>   derive. No vendor call, no quota spent, no attempt counted — it reruns
>   `deriveAndPublish()` on results already on disk, and
>   `persist-transcript.ts` deletes the match's derived points before
>   inserting, so it is safe to repeat.
> - `secure-results.ts` — **extraction, plus the webhook's own block replaced
>   by a call.** The webhook's `completed` branch used to call
>   `storeVendorJson` and `finalize_splitstep_results` inline; that block moved
>   into `secure-results.ts`'s `secureResults()` verbatim — same arguments,
>   log prefix and timeout — so the reconciler's results sweep can run the
>   identical download → store → finalize step without a webhook delivery.
>   `deliveryId` is optional for that reason: without one there is no delivery
>   row for the RPC to update, but the `results_object_key` write on
>   `processing_jobs` happens exactly as it does for a real delivery. The
>   webhook route now calls `secureResults()` instead of inlining the steps;
>   what it sends, stores and finalizes is identical.
> - `reconcile.ts` — **sweep.** A new `recoverUndeliveredResults()` runs in
>   `after()`, after the existing status-poll path (unchanged — still one
>   `GET {BASE_URL}/jobs/{job_id}` per stuck job, capped, rate-limited),
>   scoped to a page's own RLS-visible match ids. It claims (via a
>   compare-and-swap on `last_polled_at`) a `completed` job with no
>   `results_object_key` and no `derivation_version` whose `completed_at` is
>   more than ten minutes old, then re-runs the webhook's post-download path —
>   `secureResults` → `gradeResults` → `deriveAndPublish` — for it. A job with
>   no usable strokes url, or a second failed attempt, is marked
>   `RESULTS_DELIVERY_LOST` (the same code and copy the status poll already
>   used for a lost delivery), which refunds the reservation and sends the
>   failure mail through the existing `applyPolledFailure()` path. Capped
>   separately from the poll (`RESULTS_SWEEP_CAP = 2`) and budgeted short of a
>   serverless function's duration ceiling so a stuck job cannot freeze at
>   `deriving` forever.
> - `refusal-code.ts` — **new, pure.** `refusalCodeFor(status)` maps a
>   `/api/splitstep/jobs` submit-refusal HTTP status (429/403/422/503) to the
>   `error_code` `submit-match-video.ts` now records; any other status returns
>   `null`. Split out so a spec can import it without `submit-match-video.ts`'s
>   browser-only dependencies; that file re-exports it unchanged.
>
> `calculate_match_stats`, `swingvision-*`, `process-match` and existing match
> data were not touched by any of the above. No migration was added — every
> new code is written into the existing `error_code` / `error_category` /
> `error_step` / `derivation_quality` columns — and no existing row was
> rewritten: classification of a failed or stuck row happens at read time, in
> `classifyFailure()`, from columns the row already carries.

> **A reviewed exception, added 2026-09-27: tiebreak point winners, in
> `derivation/winners.ts`.** A tiebreak changes server every two points without
> closing a game, and the vendor's server-relative game string flips with it
> ("7-5" → "5-7"). `resolveWinner` only read the point ladder when the raw game
> string and the server were both unchanged, so the last point before every
> serve rotation fell through to the game and set rules, saw no change, and
> resolved no winner — `reconcile()` refused every match with a tiebreak
> ("N point(s) resolved no winner"; job b74a1e04 was the first). A new rule 2
> fires only when the server changed and the ABSOLUTE game count did not, and
> resolves by a one-point climb in the absolutized integer point score, with
> `via: "tiebreak"`. The 0/15/30/40 ladder never climbs by one as a number, so
> a stale game score across an ordinary game change cannot trigger it. Nothing
> else moved: `reconcile()`, the fold's game keys, the player1 mapping, the
> unresolved-points gate and `calculate_match_stats` are untouched, and no
> schema changed. `DERIVATION_VERSION` is `0.3.1-unreconciled`. Known limit:
> the fold still keys games on the server, so a tiebreak folds as several
> pseudo-games and a tiebreak match cannot reconcile — it publishes through
> `ACCEPT_UNRECONCILED_FOLD` with `ok = false`, never as verified. A 2^n search
> over unresolved winners against `matches.score` was considered and rejected:
> on b74a1e04 no assignment fit, because game boundaries, not winners, were
> what disagreed with the entered score.

> **A reviewed exception, added 2026-09-28: the ad-scoring rule the derivation
> folds under, in `persist-transcript.ts`.** `buildTranscriptForJob` passed
> `matches.format.ad_scoring` into `buildTranscript`, but the vendor scores the
> video under `processing_jobs.ad_scoring` — the `Ad` it was sent, written from
> the request object itself in `jobs/handler.ts` and `resubmit-job.ts`, both of
> which already read the job first. When the two disagree the transcript labels
> every 40-40 under rules the vendor never scored under (job b74a1e04 went up
> `Ad:false` for a no-ad event while its match row says ad). It now reads the
> job's value when it is a boolean, then the match format, then ad — the same
> order as `initialTopIsPlayer1` — via `resolveAdScoring`, and the job select
> fetches `ad_scoring`. Ad scoring reaches only `pressureFor`, so what can
> change is `is_break_point` / `is_set_point` / `is_match_point` on deciding
> points; point winners, `reconcile()`, the fold, the player1 mapping and
> `calculate_match_stats` are untouched, no schema changed and no `matches` row
> is written. It corrupts silently the way the §4 inputs do, one level down.
> `DERIVATION_VERSION` is `0.3.2-unreconciled`.

> **A reviewed exception, added 2026-09-28: a collapsed score tail, in
> `derivation/rallies.ts` and `transcript.ts`.** On job 45ff4bd7 the vendor's
> score stream reset to point 0-0 / game 0-0 / set NaN for the last four rallies
> and never recovered, so the last real rally and every reset one resolved no
> winner and the match was refused. `collapsedTailStart` finds such a run
> (trailing only, and only after a real set score). `buildTranscript` keeps the
> rallies: it folds them into the last real rally's game and set keys, and every
> point from that rally on that the stream could not resolve takes the last
> stroke's guess (`lastStrokeWinner`, the same rule `winner_disputed` already
> used) with `via: "guess"` and the point flag `winner_guessed`. The guess agreed
> with the score stream on 77 of 96 points on that match: it is an estimate,
> and the flag says so. Every other unresolved point still refuses the match,
> the warm-up rally included; `reconcile()`, the player1 mapping,
> `calculate_match_stats` and the schema are untouched. `DERIVATION_VERSION` is
> `0.4.1-unreconciled`.

> **A reviewed exception, added 2026-09-28: phantom strokes, in
> `derivation/played.ts`, `transcript.ts` and `flags.ts`.** A non-serve stroke
> before the deciding serve (the receiver striking a faulted first serve back)
> was written to `shots` at `shot_number` 0, tied with the faulted serve, and
> `pickReturnShot` and the film room took it as the point's return.
> `playedRally` now removes it before any row is built, so it never reaches
> `shots`; the point carries `phantom_strokes_dropped` and the raw payload
> keeps the stroke. Two flag-only changes ride with it: `second_serve_called_out`
> (review-only; inferring a double fault from it was rejected after 2 of 10
> checked on video were right) and no `service_court_repeat` on a no-ad 40-40
> point, where the receiver picks the side. Winners, `result_type` rules,
> `reconcile()`, `calculate_match_stats` and the schema are untouched.
> `DERIVATION_VERSION` is `0.4.2-unreconciled`.

> **A reviewed exception, added 2026-09-28: trajectory line calls, in
> `derivation/trajectory.ts`, `line-calls.ts`, `played.ts`, `flags.ts`,
> `persist-transcript.ts` and the webhook.** Derivation now reads the vendor's
> trajectories file for its own in/out call per stroke. When the ball before a
> derived winner bounced outside the singles lines, the point is flagged
> `winner_to_error_by_bounce` for review. It shipped as an autofix that dropped
> the winner's stroke (6 of 6 on one hand-labelled match) and was demoted to a
> flag in 0.6.0 (2026-09-29) at 14 of 18 across three; `played.ts` carries the
> criteria, measured with `scripts/splitstep-eval.ts`. A near-line ball flags
> `ending_suspect_line` for review. To be read before derivation, the webhook now stores the
> trajectories file (8 s clock) ahead of `deriveAndPublish`; the players file
> still comes last. A job without a trajectories file derives as before.
> `reconcile()`, winners, `calculate_match_stats` and the schema are untouched.
> `DERIVATION_VERSION` is `0.5.0-unreconciled`.

**Never invent vendor behaviour.** If the API docs do not say it, ask. The
payload carries a live credential to an athlete's video; a guess is not free.

**Customer-facing strings never name SplitStep.** Internally `splitstep`; in any
user-visible string the provider is **"Advantage Intelligence"**.

---

## 3. Touch carefully — the seams

These are UI files, so a revamp will rewrite them. Each carries an invariant
that is not obvious from reading the component.

### 3.1 The upload wizard — `components/dashboard/matches/new-match-wizard/`

**Five fields are required by the vendor and validated in
`lib/services/splitstep/job-request.ts`.** Drop one, or make it optional, and
submission returns 422 with a field list:

- both player names
- at least one non-zero set score
- `initialTopPlayerIsPlayer1` — which end you were on at video start
- `fixedCamera` — did the camera stay put
- `adScoring` — ad or no-ad

They are typed `boolean | null | undefined` on purpose. **Do not "simplify" them
to `boolean` with a default.** A null coerced to `false` is a wrong answer that
looks like a real one — see §4.

**The trim window is not cosmetic.** `videoStartSeconds`/`videoEndSeconds` become
`billable_seconds`, which is what the 2-hour monthly cap is charged against, and
the file that is uploaded: the browser cuts the video to that window before any
bytes move, and `submit-match-video.ts` rewrites the job row to `[0, cut length]`
**before** the terminal `uploaded` write, because auto-submit builds the vendor's
`StartTime`/`EndTime` from the row. When the file can't be cut, the original goes
up and the row keeps the window the wizard wrote. Removing the trim step means
every job bills — and stores — the full recording.

**`useUploadMatchWizard.ts` invariants:**

- The `processing_jobs` insert must `.select("id").single()`, and every later
  write must key on that id. Keying on `match_id` touches every job a
  resubmitted match ever had.
- Upload progress is throttled to 0.1% steps. Do not write per chunk.
- Auto-submit fires after the terminal `status: 'uploaded'` write. **A submit
  failure must not mark the job failed** — the bytes are in Azure and `uploaded`
  is the one state a retry needs nothing re-uploaded from.

### 3.2 Analysis status — `lib/data/match-analysis.ts`

Shared by the matches list _and_ the match detail page, so both agree about one
row. It was consolidated here after they disagreed once.

**There are three predicates and they mean different things.** Collapsing them
reintroduces fixed bugs:

| Predicate        | Question                            | Drives                                              |
| ---------------- | ----------------------------------- | --------------------------------------------------- |
| `isInFlight`     | will this ever change?              | grouping, filtering, the match page's short-circuit |
| `isWorking`      | is something happening _right now_? | the animated sheen                                  |
| `isLiveUpdating` | is a DB update actually coming?     | Realtime subscriptions                              |

`uploaded` is in-flight, not working (nothing to animate), but _is_ live-updating
(auto-submit fires in seconds). `processed` is in-flight, not working, and **not**
live-updating — subscribing on it held a WebSocket open forever per user.

**`resolveAnalysisStatus(status, derivation_version)` needs both columns.** The
vendor's `completed` means _their_ half is done. Until derivation runs, the UI
must show `processed` → **"Stats pending"**, not "Analyzed". Treating `completed`
as "show stats" renders a page of empty charts, which reads as "you hit no
serves".

### 3.3 The match detail short-circuit — `app/dashboard/matches/(detail)/[matchId]/page.tsx`

When `isInFlight(status) || isAnalysisFailed(status)`, the page renders hero +
summary + `AnalysisSteps` and **returns early**. Keep that gate. Every
stat section below it would draw zeroes.

**Since 2026-09-28, the gate has exactly one exemption.** A failed status whose
recovery class (`classifyFailure()`, `src/lib/data/match-analysis.ts`) is
`stats_unavailable` — a derivation that deterministically refused the vendor's
data, e.g. points that resolved no winner — skips the short-circuit and
renders the page normally, with the Statistics view showing a
statistics-unavailable note instead of a stat section. Product decision,
2026-09-27: a deterministic derivation failure should not block a player from
seeing their own match — the score, details and any playable video are fine,
and nothing about the vendor data will change on a retry. Every other
in-flight or failed class, including the retryable ones, still returns early
exactly as before.

### 3.4 Match deletion — `app/api/matches/[matchId]/route.ts`

Storage keys live on `processing_jobs`, which **cascades away with the match**.
All cleanup must run _before_ the row delete, and must cover all three:
`video_object_key`, `trimmed_object_key`, `results_object_key`. Missing one
strands multi-GB blobs that nothing can name. This has been the bug twice.

### 3.5 Safe to redesign freely

Layout, typography, spacing, card structure, charts, court visualisations,
copy, navigation, empty states, the progress track's appearance
(`analysis-progress-track.tsx`), and the wizard's step _presentation_ — as long
as §3.1's five fields still get collected.

~~`match-video-panel.tsx` and `use-video-upload.ts` are **dead**.~~ **Deleted**
on `claude/pilot-program-roadmap-724bdb`, once real playback existed to replace
them — a dead near-duplicate beside working code is how the wrong one gets
edited later.

---

## 4. The three inputs that silently corrupt everything

No downstream check can catch these. The page renders, the numbers look
plausible, and every statistic belongs to the wrong player.

1. **"Your end at video start"** is **camera-relative at the first frame** — is
   player 1 at the _top of the frame_ (far side from the camera). Not the deuce
   side, not who served first, not a compass direction. Ends change every odd
   game, so it describes the opening and nothing else.
2. **Set scores are reordered top-player-first** before sending. That ordering
   depends on #1 being right.
3. **Tiebreak sets send the GAME count.** A 7-6 set is `[7, 6]` — never the
   tiebreak points.

If a redesign changes how these are asked, keep the _meaning_ identical and
re-read `job-request.ts`'s header comment first.

**Resolved for cut uploads (September 2026):** our field said "video start", but
the vendor analyses from `StartTime`, and ends may change between frame zero and a
trim point several games in. A cut upload's frame zero IS the start of the
selected window, so the answer must describe the window start — the trim step now
asks it that way. An upload that could not be cut still goes up whole with the
window as `StartTime`; the vendor's reading of that case remains unconfirmed.

---

## 5. Open action items — none are UI

**Blocking a production launch**

- `SPLITSTEP_API_KEY` is set on Vercel **Preview only**. Production submissions
  will 503 until it is added there.

**Ask the vendor** (contact: Christian; endpoint `https://splitstep.ngrok.io/jobs`)

- Echo `MatchID` on webhooks. Their payload carries `job_id` and `video_id` but
  not `MatchID`, which is why deliveries that beat our id write had to be adopted
  after the fact (`adopt-deliveries.ts`). Echoing it makes the race impossible.
- What does `player_detection_score: 0.549` indicate? It was the weakest of five
  quality scores on the first job, and player attribution is exactly what Phase 2
  depends on.
- Confirm the max video size. Docs say 8 GB enforced; an earlier call suggested
  10–12 GB. `MAX_VIDEO_SIZE_BYTES` takes the conservative number.
- Is a lost delivery recoverable? `GET /jobs/{job_id}` returns status but not
  `strokes_url`/`trimmed_video_url`, so it does not get the results back.
- Is dead-time removal or an annotated render available at all? `trimmed_video_url`
  returns our submitted window re-encoded and nothing else. If a rally-only cut or
  an overlay render exists behind a flag we are not setting, that changes what the
  video surface can offer — and whether keeping their copy over ours is worth it.

**Code, non-UI**

- **Promote the five quality scores to columns.** `homography`, `ball_detection`,
  `bounce_detection`, `player_detection`, `stroke_detection` arrive on every
  completion and sit unqueryable in `raw_webhook_payload`.
- **Wire `GET {BASE_URL}/jobs/{job_id}`.** Three separate moments have wanted it:
  recovering a lost delivery, replacing the `vendor_first_downloaded_at` signal
  the Azure move killed, and answering "has it started yet".
- ~~**Revisit the source-video delete now that "trimmed" is understood.**~~
  **Done, September 2026:** the source is kept, cut to the selected window before
  upload, and the vendor's copy is no longer downloaded (§1). The
  `trimmedCopyStatus()` bug that sat here went with the copy.
- ~~**The untrimmed cost warning keys off the handles, not the cost.**~~
  **Done, 2026-09-19:** the wizard now gates on remaining allowance instead —
  `quotaRefusal()` (`new-match-wizard/validation.ts`) refuses Advantage
  Intelligence at step 1 when this month's allowance is entirely gone
  (`providerQuotaRefusal`, asked with `neededSeconds: 0`), and re-asks the
  trimmed window's real cost on Continue at the trim step and again in
  `handleCreateMatch`, using the same `billableSeconds()` figure
  `createProcessingJob` is handed. Continue stays clickable — the refusal is
  raised on click, not by disabling the button — and `handleTrimChange` clears
  it as soon as the window moves. The footer meter (`FooterMeter.tsx`) turns
  the pending segment and readout `--error` and prints "Over by x h" once the
  selection exceeds what is left. All of it is advisory: `reserveQuota()` at
  `/api/splitstep/jobs` is still the only refusal that spends nothing by
  accident, and `/api/splitstep/upload-url` now backs it with a read-only
  `peekQuota()` 429 before the SAS is minted (§2). One known gap: the
  trim-step refusal is set on `error` but that state is currently rendered
  only on the match-details step (`DetailsStepContent.tsx`), so an
  over-allowance click on trim's Continue does not yet show a visible message
  there — tracked as a follow-up, not fixed by this change.
- **Land `plan-role-split`.** Migration `20260806144035` is applied in
  production — `users.plan` exists, is backfilled, and is trigger-protected — but
  no deployed code reads it. Stripe and the subscription page still use
  `users.role`. They agree with each other so payments work; it is drift, not an
  outage. That branch is the missing code half.
- ~~**Phase 4, retire R2.**~~ **Done.** `workers/video-access/`, both R2 edge
  functions and the `R2_*` env block are deleted; Azure had carried a full match
  end to end, which was the condition for removing them. This closes the cheap
  path to moving trimmed videos back to R2 for zero-egress playback — that is now
  a build rather than a revival, and at pilot volume the egress bill does not
  justify one (`video-pipeline-overview.md` §11). Undeploying the two edge
  functions, the Worker and the bucket is an ops step, not a code one.
- **Ten older migrations carry no applied version stamp.** Verify before trusting
  `supabase db push`.

**Gated, not forgotten**

- **Phase 2 derivation** — blocked on vendor questions Q8/Q9/Q13. This is what
  makes "Stats pending" resolve into real numbers. A real 596-stroke / 114-rally
  payload now exists as an input.
- ~~**Playback.**~~ **Shipped** on `claude/pilot-program-roadmap-724bdb` —
  `mintPlaybackSas()` (read-only, 30 minutes) plus `MatchVideoCard` on the match
  page, streamed direct from Azure because proxying breaks range requests. The
  R2 question it raised is now live rather than hypothetical: egress is $0 there
  against Azure's ~$0.087/GB, and video is being served. That branch merged to
  `main` in PR #131; its handoff doc is retired, with the leftovers folded into
  `video-pipeline-overview.md` §10 and `email-system.md` §8.

---

## 6. Corrections to `ux-overhaul-brief.md`

That brief is dated 2026-08-06 and is still the best statement of _what to
build_. Four of its "broken" items are now fixed — do not action them:

- §2.2 #1 "`getMatchAnalysis` is a mock" — **fixed.** `match-analysis-server.ts`
  reads real `processing_jobs` rows.
- §2.2 #3 "CLAUDE.md describes a deleted app" — **fixed** in `60204fd`, along
  with the unreachable breadcrumb code.
- §2.2 #5 "⌘U documented as global / help says modal" — **fixed** in the same
  commit.
- §2.2 #2 the role collision — **half fixed.** The migration is applied; the code
  is on `plan-role-split` (see §5).

Also stale in its constraints table: it describes a Cloudflare Worker download
log as the "processing started" signal. R2 and the Worker are retired; source
video is in Azure Blob and that signal no longer exists.

---

## 7. Verification you can run

```bash
npx tsc --noEmit && npm run build && npm run lint   # expect 43 pre-existing warnings, 0 errors
npx tsx scripts/splitstep-webhook-test.ts --url https://www.advantage-analytics.dev
npx tsx scripts/cleanup-orphan-storage.ts           # dry run, deletes nothing
```

The webhook suite needs `SPLITSTEP_WEBHOOK_SECRET` in `.env.local` to match the
value in Vercel, or every signed delivery returns 401 — that is a local key
mismatch, not a broken deployment.

**Uploading from a port other than 3000 fails until Azure knows about it.** The
browser PUTs blocks straight to Blob Storage, so the storage account's CORS rule
is what decides which origins may upload. The rule on `advantagedashboardca` (Canada
East, the account since 2026-09-03; `advantagedashboard` in West US 2 is the retired
predecessor, kept until its in-flight jobs finish) lists the two deployed hosts plus
`http://localhost:3000` and `http://localhost:3101` — a worktree on any other port gets
`Network error uploading to Azure`, the job is marked failed, and nothing about the app
is wrong. Add the origin rather than replacing the rule; the same rule serves production:

```ts
const props = await svc.getProperties(); // @azure/storage-blob
props.cors[0].allowedOrigins += ",http://localhost:<port>";
await svc.setProperties(props);
```

To check a job end to end:

```sql
select status, derivation_version, external_job_id,
       results_object_key, trimmed_object_key,
       jsonb_array_length(raw_webhook_payload) as payloads
from processing_jobs order by created_at desc limit 3;
```

A healthy completed job: `status = completed`, `derivation_version` null (so the
UI says "Stats pending"), both object keys set.

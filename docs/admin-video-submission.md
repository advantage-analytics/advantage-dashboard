# Admin video submission contract (T7)

T2, T5, T6 and `20260919044829_submit_admin_match_videos.sql` were applied live
on 2026-09-19; the repo files carry their live-recorded versions. Any other
target database needs them before these routes are deployed.
The existing dashboard video endpoints now consult this migration on every
request; a missing migration deliberately fails closed.

## Admission

`POST /api/admin/uploads/video` accepts JSON with:

- Stable UUID `operationId`, `itemId`, `programId`.
- Required numeric `startSeconds`, `endSeconds` and explicit boolean
  `initialTopPlayerIsPlayer1`, `adScoring`, `fixedCamera`. False is an answer;
  omitted/null is refused. The window is relative to the original recording.
- For a **new singles match**: roster `playerId`, `opponentName`, `score` with
  `player1`/`player2` set-game arrays and optional `player1_tiebreaks` and
  `player2_tiebreaks` arrays, `date` (`YYYY-MM-DD`), `courtType`
  (`Hard|Clay|Grass|Carpet`), `bestOf` (`1|3|5`). Trailing unplayed set nulls
  follow the existing vendor validator. New matches use `Final Score`.
- For a **prepared coach result attachment**: `matchId` and T5 `fingerprint`.
  Do not send replacement player, score, date, surface or format fields.
  The service reads the recorded match, and the admission RPC locks and
  revalidates the exact T5 snapshot/reservation before adding the job. An
  existing boolean `format.ad_scoring` must match the video answer.

No actor, role, membership, origin or billing account field is accepted. The
session must be admin even if it is also a program member. The RPC separately
checks that server-supplied actor against `users.is_admin` and binds the stable
operation to that actor and program. `getAdminUploadContext` supplies the target
program's current roster; the active-workspace cookie does not select billing.

Success returns `{ok:true, operationId, itemId, matchId, jobId}`. Retrying the
same normalized request returns those same IDs. Changing its request fails;
creating a different attempt for an already reserved match fails. Attachments
retain all recorded result fields, owner and event linkage. Provider becomes
`splitstep`, method `ai`, and video answers live on the job.

## Transfer and processing

Pass the returned exact `jobId` and `matchId` to the existing
`uploadAndSubmitVideo` helper, retaining the original trim and all three answers.
Do not call `createProcessingJob` again. Its existing narrow browser writes are
allowed: upload heartbeat, remux window, terminal upload and transfer errors.
The SQL guard rejects job reassignment, vendor state/ID forgery, answer changes
and deletion. Remux may reset the start to zero with the cut duration (at most
one second over the selected length for container rounding); original-file
fallback retains the original window.

The existing `/api/splitstep/upload-url` and `/api/splitstep/jobs` discover admin
provenance by match/job, even when console IDs are omitted. Both verify the
operation actor and current admin privilege. Upload URL bookkeeping addresses
only the reserved job, and is required before returning its credential.
Submission still proves job ownership and runs the existing vendor validator,
including camera ordering, scoring booleans and trim-derived billing.

A compare-and-set claim changes `uploaded` to `submitting` before quota/vendor
calls. The service-only quota wrapper then revalidates target program status,
roster and job under locks in the quota transaction. It derives the ledger from
the durable program and chooses its tier from the locked `org_type`, using the
two server-configured caps from `splitstep/config.ts`. It calls the unchanged
live `reserve_processing_quota`; the wrapper refuses a second usage row for
that job. It never bills the admin's personal account.

Quota refusal restores `uploaded`, so the same job can be retried without moving
bytes. After submission begins, uncertain/crashed or failed attempts require
administrator reconciliation; the API never creates a second job to guess
whether the vendor accepted the first. In particular, acceptance followed by a
failed queued-state write keeps the reservation and submitting claim. The
existing automated replacement-job retry cannot bypass the reservation trigger.

The item succeeds/audits once at linkage. Its durable `result.state` then tracks
job outcomes; `completed` without `derivation_version` is `stats_pending`.
Failure text is stored in `error_code`. An admitted job ID is not proof that
analysis completed. Match result and associated entry fields remain protected
while processing, including vendor-completed/statistics-pending state.

## Verification and limits

Fresh read-only catalog evidence at `2026-09-17 01:18:40 UTC` confirmed live head
`20260916183239`, processing-job fields/constraints, and service-only quota RPC
ACLs. The reserve function trusts its caller's account/cap and has no idempotent
replay branch; the new wrapper supplies those missing admin boundaries. No live
mutation, quota spend, Azure upload, vendor request or deployment was performed.

PGlite executes T2/T5/T6/T7 migrations plus the captured live reserve function
against a reduced schema, covering admission/retries, both admin membership
cases, refusals, result/entry preservation, client job mutation boundaries,
remux, claim serialization, target-program charging/tiering and outcome state.
Focused handler/service tests stub all quota, storage and vendor side effects.
Real PostgreSQL concurrent sessions, deployment integration and actual media
processing remain environment acceptance checks.

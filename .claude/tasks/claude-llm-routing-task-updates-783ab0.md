# Tasks — claude/llm-routing-task-updates-783ab0

> Scope: Attach, replace, and align video for existing SwingVision matches using the new-match wizard style.

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

## Pipeline source

These tasks decompose `work/swingvision-add-video/03_plan/output/plan.md` as approved for stage 04. All file lists are
best guesses; new paths are proposed. Read the named plan step and Shared
contracts before implementation. No task authorizes a code deployment; the
migration tasks (T2–T4, T13) do apply their additive migrations to the live
database, which is where this repo's DB specs run (decided 2026-09-18).
Routing follows task-add's standard tiers (re-routed 2026-09-18 when the
queue moved from Codex to Claude Code; the task blocks are otherwise as
drafted). `fable` — migrations, RPC privilege boundaries, the shared access
helper, SAS scoping, finalization/cleanup lifecycle, deletion integration and
final acceptance (T2–T4, T7, T8, T10, T13, T14, T16, T27). `opus` — service,
route-handler, Film and wizard UI work with clear criteria. `sonnet` — T28,
documentation only. The runner dispatches on each task's `model:` line.

The tasks were drafted inline under Codex, without task-add's Fable planner.
No implementation model has run. Stage 04 follows its append-and-commit
contract and stops for review.

## Also consulted

- `.claude/skills/task-add/reference/queue-format.md` — exact queue/log headers,
  task grammar, `model:` values, numbering, and dependency semantics.
- `.claude/skills/task-next/SKILL.md` and `check.sh` — dispatch guidance and
  the gate script.
- `MAP.md` — route/file orientation; UI trace facts are recorded in the approved
  plan and were previously verified in this feature's design stage.

## T1 · Define attachment timing and request contracts

- **status:** todo
- **model:** opus
- **files:** Best guess: src/lib/match-video/{types,limits,alignment}.ts; tests/match-video-alignment.spec.ts (new)
- **done when:**
  - [ ] Shared types define the planned modes, request/result unions, error codes, and 7,999,999,999-byte limit without importing Azure or Supabase.
  - [ ] The timing helper orders points by point_number, computes offset = first source time minus confirmed video time, and validates known point/shot bounds with 0.1-second tolerance.
  - [ ] Missing first/final timing, invalid source times, ambiguous order, and malformed time input are refused; null interior timestamps remain untimed and the final point requires positive duration.
  - [ ] Tests cover both offset signs, explicit zero, fractional input, repeated corrections without accumulated offsets, NaN/infinity, interior nulls, and coverage boundaries.
- **notes:** Plan step 1 and Shared contracts. Millisecond confirmation precision must not round away source precision. Playback padding is not coverage evidence.

## T2 · Create attachment persistence and privilege boundaries

- **status:** todo
- **model:** fable
- **needs:** T1
- **files:** Best guess: supabase/migrations/<new>_match_video_attachments.sql; tests/match-video-attachments-db.spec.ts (new)
- **done when:**
  - [ ] A new migration defines the planned attachment identity, lifecycle, storage/copy, timing, idempotency, version, SAS-expiry, and lease/retry metadata without storing bearer URLs.
  - [ ] Partial indexes enforce one active attachment per non-null match and one pending attempt per match/uploader; uploader/client-request uniqueness supports idempotency.
  - [ ] RLS and grants deny direct browser reads/writes; nullable match and uploader foreign keys use ON DELETE SET NULL and retain storage keys.
  - [ ] Controlled database tests prove constraints, denied anon/authenticated access, retained metadata after FK nulling, and that the uploader FK does not prevent account deletion.
- **notes:** Split from plan step 2: table/security only; reservation RPCs are T3. New migration only, never edit an applied migration. Apply this task's migration to the live project with the Supabase MCP `apply_migration` (see `.claude/skills/create-migration/SKILL.md`) — it is additive and touches no existing table or athlete data — then prove it with specs built on `tests/fixtures/live-db`, which clean up their own rows.

## T3 · Implement reservation renewal and cancellation transactions

- **status:** todo
- **model:** fable
- **needs:** T1, T2
- **files:** Best guess: supabase/migrations/<new>_match_video_attachment_reservations.sql; tests/match-video-attachments-db.spec.ts
- **done when:**
  - [ ] Service-role-only RPCs with an empty pinned search path recheck creator, SwingVision provenance, exact workspace/program membership, and lock parent match before attachment rows.
  - [ ] Reservation stores server-generated keys, expected active identity/version, and client request ID before credentials are issued; identical retries reuse the attempt and changed metadata conflicts.
  - [ ] Renewal records the latest SAS expiry and only succeeds for authorized pending work before finalization; cancellation retires pending work idempotently and cannot retire an active asset.
  - [ ] Retired work cannot renew or return to pending; controlled tests cover authorization, competing reservations, idempotency, state transitions, and direct RPC privilege denial.
- **notes:** Remaining plan step 2. Actor/workspace arguments originate in authenticated server code, not request bodies. Use the lifecycle fields established by T2. Apply this task's migration to the live project with the Supabase MCP `apply_migration` (see `.claude/skills/create-migration/SKILL.md`) — it is additive and touches no existing table or athlete data — then prove it with specs built on `tests/fixtures/live-db`, which clean up their own rows.

## T4 · Implement atomic activation and alignment transactions

- **status:** todo
- **model:** fable
- **needs:** T1, T2, T3
- **files:** Best guess: supabase/migrations/<new>_match_video_attachment_activation.sql; tests/match-video-attachments-db.spec.ts
- **done when:**
  - [ ] Service-only activation and correction RPCs recheck authority, lock in parent-first order, and recompute timing/coverage from source rows inside the transaction.
  - [ ] Activation requires server-verified media metadata and matching expected active identity/version, retires the old row, and activates the new row atomically.
  - [ ] Correction uses saved verified duration, updates time/offset/version atomically, and never rewrites imported match, point, shot, or statistic data.
  - [ ] Finalization lease/CAS and frozen-input transitions prevent duplicate finalization, renewal after finalization, or activation of retired work; retry after a successful commit only succeeds while that same attachment remains active.
  - [ ] Database tests cover stale versions, replacement/correction/cancellation/deletion races, SQL/TypeScript timing parity, idempotency, coverage refusal, and unchanged source rows.
- **notes:** Plan step 3 plus the approved completion lifecycle in steps 2 and 7. Expose the narrowly scoped lease transitions T10 needs; do not hand unrestricted writes to clients. Apply this task's migration to the live project with the Supabase MCP `apply_migration` (see `.claude/skills/create-migration/SKILL.md`) — it is additive and touches no existing table or athlete data — then prove it with specs built on `tests/fixtures/live-db`, which clean up their own rows.

## T5 · Implement bounded shared media inspection

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** Best guess: src/lib/match-video/media-inspection.ts; tests/match-video-probe.spec.ts; tests/fixtures/match-video/ (new)
- **done when:**
  - [ ] Inspection uses installed Mediabunny MP4/QTFF/Matroska/WebM readers only, requires a video track, and computes its media end without trusting audio duration or a supplied client value.
  - [ ] The source enforces 32 MiB total reads, 2 MiB range chunks, 128 range requests, 8 MiB cache, and a 15-second deadline with abort/disposal on every exit.
  - [ ] Local preflight reads through File.slice rather than whole-file buffering; AVI, external-resource formats, audio-only/corrupt files, nonfinite duration, and unsupported timing layouts are refused.
  - [ ] Owned fixtures and virtual large sources exercise supported containers, tail metadata, structural budgets, and bounded reads; parsed clocks agree with HTML-video seeks/duration for accepted fixtures.
- **notes:** Local/shared portion of plan step 4. Browser decode/seek verification is integrated by T17. Structural refusal gets MP4 guidance; transient network failure is retryable.

## T6 · Verify stored video metadata through bounded Azure ranges

- **status:** todo
- **model:** opus
- **needs:** T1, T5
- **files:** Best guess: src/lib/services/match-video/probe.ts; tests/match-video-probe.spec.ts (new/extend)
- **done when:**
  - [ ] The server probe adapts T5 to range reads from a server-selected Azure blob and fixed ETag, with no request-supplied URL or storage-key authority.
  - [ ] The probe verifies actual length and media type/duration, preserving T5 budgets and cleanup; no complete file download, native codec dependency, or transcoding is introduced.
  - [ ] Tests cover ETag changes, forged browser metadata, unreadable stored bytes, resource-limit refusals, and retryable storage/network failures.
- **notes:** Server portion of plan step 4. This module must remain server-only; metadata supplied by the browser is advisory.

## T7 · Implement immutable Azure attachment publication

- **status:** todo
- **model:** fable
- **needs:** T2, T6
- **files:** Best guess: src/lib/services/match-video/storage.ts; tests/match-video-storage.spec.ts (new)
- **done when:**
  - [ ] The adapter uses unique staged/final keys, scoped six-hour upload SAS, read-only playback SAS, bounded metadata access, and idempotent deletion through existing Azure primitives.
  - [ ] Publication performs a server-side copy conditioned on staged ETag; the browser never receives write access to the final key.
  - [ ] Copy identity/destination status can be persisted and resumed across pending, failed, or lost-response attempts; a mismatched destination is refused instead of overwritten.
  - [ ] Tests cover concurrent attempts, ETag changes, pending/success/failure, lost responses, final metadata checks, and final-key isolation without waiting in one request for a multi-GB copy.
- **notes:** Plan step 5. T10 owns database orchestration. Supply the copy-status/abort seam T14 cleanup needs; a source-read SAS stays server-only.

## T8 · Authorize and prepare attachment uploads

- **status:** todo
- **model:** fable
- **needs:** T1, T3, T7
- **files:** Best guess: src/lib/services/match-video/access.ts and uploads.ts; src/app/api/matches/[matchId]/video/uploads/route.ts; tests/match-video-upload-handlers.spec.ts (new)
- **done when:**
  - [ ] A shared access helper authenticates the cookie user, checks RLS visibility, creator/provenance, and matching active workspace before any privileged action.
  - [ ] Preparation validates the planned bounded same-origin request, rejects caller-supplied identity/storage/offset authority, reserves via T3, and persists credential expiry before minting the scoped SAS.
  - [ ] The endpoint returns stable status/error codes and private/no-store responses, reuses identical requests, and conflicts on incompatible pending work.
  - [ ] Injected-handler tests prove denied requests cause no storage side effects and cover creator/noncreator, personal/team/wrong-workspace, forged IDs, malformed/oversized requests, and reservation races.
- **notes:** Preparation/access portion of plan step 6 and HTTP table. Read installed Next.js route-handler guidance before editing. Body size and origin checks apply to all mutation routes.

## T9 · Expose upload renewal and cancellation endpoints

- **status:** todo
- **model:** opus
- **needs:** T3, T8
- **files:** Best guess: src/lib/services/match-video/uploads.ts; src/app/api/matches/[matchId]/video/uploads/[attachmentId]/route.ts and renew/route.ts; tests/match-video-upload-handlers.spec.ts
- **done when:**
  - [ ] Renewal reuses shared access checks and T3 transitions, persists the new expiry before returning credentials, and refuses retired/active/finalizing work.
  - [ ] Cancellation retires only the caller’s pending attempt idempotently, stops renewal, and preserves any active video; it does not delete a staging blob while its write SAS is valid.
  - [ ] Handler tests cover forged attachment IDs, changed workspace/access, cancellation retries, denied renewal after finalization, and the absence of privileged side effects on refusal.
- **notes:** Remaining plan step 6. Cleanup later consumes retired records; cancellation must remain safe even when browser abort or cancellation delivery fails.

## T10 · Finalize uploads with resumable publication and atomic activation

- **status:** todo
- **model:** fable
- **needs:** T4, T6, T7, T8, T9
- **files:** Best guess: src/lib/services/match-video/complete.ts; src/app/api/matches/[matchId]/video/uploads/[attachmentId]/complete/route.ts; tests/match-video-completion.spec.ts (new)
- **done when:**
  - [ ] Completion authenticates again, freezes confirmation/expected-version inputs, acquires the finalization lease, and verifies staged size/ETag before starting or resuming publication.
  - [ ] Pending copy returns 202 with a two-second retry interval; copied final bytes are probed and coverage is validated against fresh source timing before transactional activation.
  - [ ] Concurrent or repeated requests cannot create duplicate copies/commits; lost-success retries follow T4 idempotency and changed/retired attempts conflict.
  - [ ] Every failed stage retains cleanup keys and the previous active video; recoverable leases can be retried while cancellation/deletion prevents late activation.
  - [ ] Tests exercise forged metadata, overwritten staging, lease expiry, response loss, copy polling, cancellation/deletion/access races, too-short media, and injected storage/DB failures.
- **notes:** Plan step 7. Keep an upload attempt pending during publication; do not introduce vendor jobs, billing, or changes to source timing.

## T11 · Expose alignment correction without re-upload

- **status:** todo
- **model:** opus
- **needs:** T4, T8
- **files:** Best guess: src/lib/services/match-video/alignment.ts; src/app/api/matches/[matchId]/video/alignment/route.ts; tests/match-video-access-handlers.spec.ts (new)
- **done when:**
  - [ ] PATCH validates the planned attachment ID, expected version, and confirmed position using shared mutation authorization.
  - [ ] Correction uses verified stored duration and fresh source timing through T4; it updates only attachment time/offset/version and refuses stale or invalid coverage.
  - [ ] Tests cover correction/no-op behavior, repeated corrections, visible noncreator refusal, changed workspace/auth, stale version, missing timing, and no storage upload or source-row writes.
- **notes:** Alignment portion of plan step 8. Only insufficient coverage uses the exact too-short error; malformed alignment and missing timing remain distinct.

## T12 · Expose authorized playback metadata and refresh

- **status:** todo
- **model:** opus
- **needs:** T7, T8
- **files:** Best guess: src/lib/services/match-video/playback.ts; src/app/api/matches/[matchId]/video/route.ts; tests/match-video-access-handlers.spec.ts
- **done when:**
  - [ ] GET requires caller-visible match access and returns only the active final asset’s ID/version, verified duration, offset, read URL, and expiry.
  - [ ] Playback does not require creator mutation permission and never returns upload credentials or a staged object; responses are private/no-store.
  - [ ] Tests distinguish noncreator playback from forbidden writes and cover absent/inaccessible matches, expired auth, missing blobs, and storage errors without inviting duplicate attachment creation.
- **notes:** Playback portion of plan step 8. Refresh metadata must allow later clients to detect replacement/correction; preserve stable errors from Shared contracts.

## T13 · Add cleanup claim and fencing transactions

- **status:** todo
- **model:** fable
- **needs:** T3, T4
- **files:** Best guess: supabase/migrations/<new>_match_video_attachment_cleanup.sql; tests/match-video-attachments-db.spec.ts
- **done when:**
  - [ ] Service-only cleanup claims lease at most 50 eligible rows and fence activation/renewal by retiring abandoned pending work atomically.
  - [ ] Eligibility covers retired/orphaned assets and pending attempts idle for 24 hours, while an active retained match’s final key is never collectible merely because its uploader is null.
  - [ ] Staged-key eligibility requires the latest upload SAS expiry plus five minutes; active attachments may shed only eligible staging data.
  - [ ] Database tests cover competing cleanup/finalization/renewal, stale leases/versions, null-match versus null-uploader behavior, and retries that retain keys until deletion is confirmed.
- **notes:** Database portion of plan step 9. Keep parent-first lock ordering consistent with T3/T4; do not allow a worker claim to turn into late activation. Apply this task's migration to the live project with the Supabase MCP `apply_migration` (see `.claude/skills/create-migration/SKILL.md`) — it is additive and touches no existing table or athlete data — then prove it with specs built on `tests/fixtures/live-db`, which clean up their own rows.

## T14 · Implement retryable attachment cleanup worker

- **status:** todo
- **model:** fable
- **needs:** T7, T10, T13
- **files:** Best guess: src/lib/services/match-video/cleanup.ts; tests/match-video-cleanup.spec.ts (new)
- **done when:**
  - [ ] The worker consumes fenced claims with bounded concurrency and rechecks state/version before deleting storage objects.
  - [ ] In-progress copies are cancelled or awaited before collection so they cannot recreate a deleted final blob; unexpired staging writers and active final keys are preserved.
  - [ ] Deletion failures retain keys and retry metadata; rows are removed only after all tracked objects are gone, while active rows retain their final metadata after staged-key cleanup.
  - [ ] Tests cover duplicate sweeps, copy races, partial deletion, storage outage, abandoned uploads, retained team assets, and successful retry; replacement can request a best-effort run through this same worker.
- **notes:** Worker portion of plan step 9. Use T13 eligibility; absence of a blob is successful cleanup, not an error.

## T15 · Schedule and protect attachment cleanup

- **status:** todo
- **model:** opus
- **needs:** T14
- **files:** Best guess: src/app/api/cron/cleanup-match-videos/route.ts; vercel.json; .env.example; tests/match-video-cleanup.spec.ts
- **done when:**
  - [ ] A Node cleanup endpoint invokes T14 only after validating CRON_SECRET and refuses missing or invalid credentials.
  - [ ] Vercel configuration schedules the endpoint daily at 05:00 UTC; .env.example documents the secret without embedding a value.
  - [ ] Tests prove unauthorized calls cannot invoke cleanup and authorized calls use the bounded worker; existing configuration is preserved.
- **notes:** Scheduling portion of plan step 9. Code/config only here, no external deployment. The 24-hour idle threshold plus daily schedule normally yields 24–48-hour abandoned-attempt collection.

## T16 · Integrate attachment cleanup with match and account deletion

- **status:** todo
- **model:** fable
- **needs:** T13, T14
- **files:** Best guess: src/lib/services/matches/purge-match-storage.ts; src/lib/services/match-video/purge.ts (new); deletion tests and tests/account-deletion-retention.spec.ts
- **done when:**
  - [ ] The shared purge path adds an isolated, authorized attachment cleanup branch that fences pending work, attempts deletion, and retains durable keys for failures.
  - [ ] Match and personal-account deletion eventually collect attachment objects after FK nulling, including late upload/copy activity, without blocking other existing storage cleanup branches.
  - [ ] Account deletion keeps its existing personal-match filter; retained team matches keep playable active video when uploader identity becomes null.
  - [ ] Tests cover match/account deletion, team retention, failed deletion/retry, late copy callbacks, and existing provider-file/job cleanup continuing after an attachment cleanup failure.
- **notes:** Plan step 10. Reuse the verified purgeMatchStorage integration rather than changing account retention policy.

## T17 · Build the wizard-style attachment file step

- **status:** todo
- **model:** opus
- **needs:** T1, T5
- **files:** Best guess: src/components/dashboard/matches/match-video-attachment/AttachmentFileStep.tsx and use-attachment-file.ts; focused browser tests (new)
- **done when:**
  - [ ] The file picker/drop zone and selected-file facts follow the existing new-match wizard presentation and show filename, size, and duration.
  - [ ] Local bounded inspection plus decoded-frame/seek checks reject unsupported/AVI, empty, oversized, or unreadable media before any upload, using MP4 guidance where appropriate.
  - [ ] Remove/reselect and rapid file changes cancel stale probes, revoke object URLs, and clear prior alignment without adopting vendor resolution/FPS restrictions.
  - [ ] Browser checks cover choose/drop/remove/reselect, unsupported codec and size errors, stale probe results, keyboard controls, and no network upload on selection.
- **notes:** Plan step 11. Trace the new-match route and read the design skill before UI work. Implement as an independently testable step, not a second upload workflow.

## T18 · Build the first-point alignment step

- **status:** todo
- **model:** opus
- **needs:** T1, T17
- **files:** Best guess: src/components/dashboard/matches/match-video-attachment/AttachmentAlignmentStep.tsx; focused browser tests (new)
- **done when:**
  - [ ] Local and saved video previews provide labeled playback, scrub/fine-seek controls, Use current time, and an editable hh:mm:ss.sss first-point field.
  - [ ] Zero is accepted only after explicit confirmation; correction preloads saved time and enables saving only for a valid material change.
  - [ ] The step validates coverage, can preview the aligned last point, preserves input on the exact too-short error, and surfaces missing timing/untimed interior points without inventing timestamps.
  - [ ] Browser tests cover both offset directions, typed/selected zero, keyboard seeking, no-op correction, end boundaries, and play-promise rejection separately from media errors.
- **notes:** Plan step 12. Keep this component presentation/interaction focused; orchestration and HTTP writes belong to T20.

## T19 · Implement bounded browser upload transport

- **status:** todo
- **model:** opus
- **needs:** T8, T9, T10
- **files:** Best guess: src/components/dashboard/matches/match-video-attachment/attachment-upload.ts; tests/match-video-upload-transport.spec.ts (new)
- **done when:**
  - [ ] The browser transfer uses 8 MiB blocks and no more than four concurrent requests, scoped preparation/renewal, and bounded transient retries.
  - [ ] Progress reflects actual bytes, credentials remain in memory, and expired write URLs renew only through the authorized pending-attempt endpoint.
  - [ ] Abort stops transfer and attempts cancellation; completion polling reuses the same request/attachment and handles 202 without re-uploading after a lost success response.
  - [ ] Tests cover concurrency/block sizing, retries, renewal, abort, completion polling, and credential/error handling without importing server Azure signing into the client bundle.
- **notes:** Transport split from plan step 13. Do not wire automatic upload on file selection; T20 calls this helper only after confirmation.

## T20 · Compose the attachment wizard and save states

- **status:** todo
- **model:** opus
- **needs:** T11, T12, T17, T18, T19
- **files:** Best guess: src/components/dashboard/matches/match-video-attachment/MatchVideoAttachmentFlow.tsx and use-attachment-flow.ts; flow tests (new)
- **done when:**
  - [ ] The existing WizardShell hosts two steps for Add/Replace and one for Adjust, matching the step bar, pinned existing match, content column, and sticky footer without match-detail re-entry.
  - [ ] Only final confirmation starts upload; progress changes from actual bytes to Saving video, duplicate submissions and incompatible edits are held, and retries preserve file/time.
  - [ ] Back retains selected-file state, changing a file clears its confirmation, and cancel/unmount aborts or invalidates pending work; commit navigation is held until its result is known.
  - [ ] Correction calls only the alignment endpoint; the flow never creates a match draft, invokes analysis hooks, or spends analysis quota.
  - [ ] Browser tests cover add/replace/align, failure/lost-response/double-submit, cancel/back/reload, focus/keyboard, and 390px plus desktop layouts without altering other WizardShell consumers.
- **notes:** Orchestration split from plan step 13. Successful return target comes from T21/T22’s verified Film selection contract; keep it injectable while this component is standalone.

## T21 · Route authorized attachment wizard visits

- **status:** todo
- **model:** opus
- **needs:** T8, T12, T20
- **files:** Best guess: src/app/dashboard/matches/new/page.tsx; src/lib/data/match-video-attachment-server.ts (new); route/permission tests
- **done when:**
  - [ ] videoFor with add/replace/align mode is resolved before match-creation branches; invalid IDs/modes and conflicting draft/source/player/match parameters are refused.
  - [ ] The server target loader checks creator, source, exact active workspace, timing, and current attachment state before rendering; Add requires absence and Replace/Align require presence.
  - [ ] The page uses the attachment flow and appropriate title while preserving existing ?match=, draft, source, player, and team-upload behavior.
  - [ ] Route tests cover personal/team creators, visible noncreators, wrong workspace, stale modes, and parameter/source conflicts; the existing Film selection mechanism is identified for the return target.
- **notes:** Wizard-route split from plan step 14. Reuse the shared authorization helper; no guessed new Film query parameter or new page route.

## T22 · Add Film entry actions and return-to-Film behavior

- **status:** todo
- **model:** opus
- **needs:** T12, T20, T21
- **files:** Best guess: src/app/dashboard/matches/(detail)/[matchId]/page.tsx; src/components/dashboard/matches/match-detail/film/film-tab.tsx and film-empty-state.tsx; browser tests
- **done when:**
  - [ ] A minimal server-derived capability exposes Add video for an absent attachment and Replace video/Adjust alignment for an existing one, only to authorized creators.
  - [ ] Unavailable storage or playback errors remain retryable errors and do not masquerade as absence or invite a duplicate attachment.
  - [ ] Actions use T21’s attachment route, and successful save returns to the same match with Film selected using the verified report mechanism.
  - [ ] Browser tests cover each entry/return path, read-only viewers, stale attachment state, and unchanged analysis/in-flight match-detail behavior.
- **notes:** Film-entry split from plan step 14. Follow the previously traced page-to-FilmTab import chain; use the design skill before UI edits.

## T23 · Load active attachment playback alongside existing video sources

- **status:** todo
- **model:** opus
- **needs:** T12, T21, T22
- **files:** Best guess: src/lib/data/match-video-server.ts; shared MatchVideo types; tests/match-video-choice.spec.ts
- **done when:**
  - [ ] The loader resolves active SwingVision attachment metadata through authorized playback access and preserves existing provider-job video selection for other matches.
  - [ ] MatchVideo carries attachment identity/version, verified duration, and the signed subtraction offset without treating a negative offset as invalid.
  - [ ] Tests prove visibility checks occur before privileged lookup/signing, staged/retired assets are not returned, and existing source/legacy-offset playback behavior remains unchanged.
- **notes:** Loader split from plan step 15. Do not write imported source rows or rename their provenance when a video is attached.

## T24 · Apply attachment alignment throughout the shared Film timeline

- **status:** todo
- **model:** opus
- **needs:** T1, T22, T23
- **files:** Best guess: src/components/dashboard/matches/match-detail/film/film-timeline.ts and its embedded/fullscreen consumers; tests/film-timeline.spec.ts and related Film tests
- **done when:**
  - [ ] All point/shot seeks and displayed video-clock times apply the stored offset once through the shared conversion in embedded and fullscreen playback.
  - [ ] Padded windows clamp to verified video duration, untimed rows have no seek target, and source times/durations stay unchanged.
  - [ ] Tests cover active rows, saved/filtered stops, loops, next/previous, dead-time skipping, both offset signs, repeated correction, and video bounds.
  - [ ] Legacy/zero-offset Advantage Intelligence playback tests remain green; any consumer fixes stay limited to the alignment contract rather than redesigning adjacent Film surfaces.
- **notes:** Timeline split from plan step 15. Inspect actual consumers before editing; if an unexpectedly broad separate surface is needed, report it rather than silently rewriting the queue.

## T25 · Implement attachment playback credential refresh state

- **status:** todo
- **model:** opus
- **needs:** T12, T23, T24
- **files:** Best guess: src/components/dashboard/matches/match-detail/film/use-attachment-playback.ts; focused hook/service tests (new)
- **done when:**
  - [ ] The hook refreshes before SAS expiry and allows one expiry-related recovery attempt without creating a retry loop.
  - [ ] Same-asset refresh preserves playhead and play/pause intent; changed attachment/version invalidates stops and selects a valid aligned point instead of reusing an unrelated raw time.
  - [ ] Deleted/inaccessible assets produce actionable terminal states; cleanup cancels pending refresh on unmount, and rejected play promises do not trigger credential refresh.
  - [ ] Tests cover paused/playing expiry, replacement/correction, denied refresh, deletion, stale responses, and unmount cleanup.
- **notes:** State split from plan step 16. Keep the hook attachment-specific so non-attachment sources retain their existing behavior.

## T26 · Wire credential refresh into embedded and fullscreen players

- **status:** todo
- **model:** opus
- **needs:** T25
- **files:** Best guess: src/components/dashboard/matches/match-detail/film/film-player.tsx and film-fullscreen.tsx; focused browser tests
- **done when:**
  - [ ] Both player surfaces consume T25 refresh state and load renewed URLs while retaining same-asset playhead/pause intent.
  - [ ] Replacement or correction refresh rebuilds playback stops and uses a valid aligned point; missing access/deleted video exposes the hook’s terminal state.
  - [ ] Browser tests verify paused/playing expiry in both surfaces, inter-tab changes, denied refresh, and clean handoff/unmount without regressing non-attachment playback.
- **notes:** Player-integration split from plan step 16. No unrelated fullscreen layout changes; the shared clock remains authoritative.

## T27 · Verify end-to-end attachment acceptance and regression safety

- **status:** todo
- **model:** fable
- **needs:** T10, T11, T15, T16, T20, T22, T23, T24, T26
- **files:** Best guess: tests/match-video-attachment-flow.spec.ts; tests/fixtures/match-video/; controlled storage smoke harness and existing targeted regression tests (new/extend)
- **done when:**
  - [ ] Browser acceptance covers differently trimmed videos, first-point alignment, add/replace/correct/reload, unsupported/oversized/too-short/missing-timing errors, and preservation of the old video after failures.
  - [ ] Controlled database tests verify actual authorization/privileges, one-active constraints, stale versions, concurrent operations, and account/team retention rather than substituting mocks for those guarantees.
  - [ ] A controlled Azure smoke test with isolated small fixtures proves direct upload, conditional publication, authorized playback, replacement, and tracked-object cleanup; virtual sources cover near-limit behavior.
  - [ ] Relevant upload/Film/account-deletion regressions and repository typecheck, lint, and format checks pass; assertions show no changed imported timing/statistics, vendor jobs, or analysis quota charges.
  - [ ] Verification evidence names the actual environment and any remaining deployment gates; no new migration, push, merge, Vercel deploy, or change to existing athlete data occurs in this task.
- **notes:** Verification split from plan step 17 and closing Test strategy. The database is the live project, where T2–T4 and T13 already applied their additive migrations; specs use `tests/fixtures/live-db` throwaway users and rows. Unavailable DB/Azure fixtures are a real blocker, not grounds to claim success from mocks.

## T28 · Document attachment operations and rollout order

- **status:** todo
- **model:** sonnet
- **needs:** T15, T16, T27
- **files:** Best guess: docs/match-video-attachments.md (new); docs/README.md
- **done when:**
  - [ ] Operations notes document creator-only management, playable MP4/MOV/M4V/MKV/WebM validation, AVI/unsupported MP4 guidance, the under-8-GB limit, and first-point alignment behavior.
  - [ ] The notes state migration-before-code rollout order, CRON_SECRET/daily cleanup schedule, Azure CORS origins to verify, cleanup logs/retries, and retention of active team assets after uploader deletion.
  - [ ] The docs index links the new current-state document, and verification/deployment status matches T27 evidence without claiming unperformed production rollout.
- **notes:** Documentation split from plan step 17. Scope is operational prose and one index link; no deployment or additional product behavior.

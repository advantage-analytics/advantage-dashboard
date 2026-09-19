# Run log — claude/llm-routing-task-updates-783ab0

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Define attachment timing and request contracts — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/match-video/` holds the feature's pure contracts with no
Azure/Supabase/Next imports: `types.ts` (add/replace/align modes, pending/active/retired
lifecycle, 15 error codes with their status/message table, `MatchVideoResult` union, and
request/result shapes for all six planned endpoints), `limits.ts`
(`MATCH_VIDEO_MAX_BYTES = 7_999_999_999`, `COVERAGE_TOLERANCE_SECONDS = 0.1`), and
`alignment.ts` (`summarizeSourceTiming` orders by point_number; `planAlignment` computes
offset = anchor source time − confirmed video time and validates coverage). New
`tests/match-video-alignment.spec.ts`, 34 cases. Required coverage end is a max over every
known point start, positive point end and shot time — a first implementation derived it
from the final point alone and accepted a file that cut off mid-rally; the failing case is
kept as a test.

**follow-ups:**

1. T3's SQL timing helper must reproduce `requiredSourceEndSeconds` as that same max over
   all known bounds, not just the final point's end; the parity fixtures should include the
   out-of-range-shot case.
2. `formatConfirmedVideoTime` is exported for T18's hh:mm:ss.sss field. If a sub-hour
   display is wanted, change it there rather than adding a second formatter.
3. T5/T6's probe should map a bounded-read overrun to `media_probe_budget` and a network
   timeout to `storage_unavailable`; the split is encoded in `types.ts` but unused so far.
4. Two judgment calls worth a second look: a numeric confirmed time is rounded to
   milliseconds while a string with a fourth fractional digit is refused rather than
   silently rounded; and a zero point duration counts as "unknown end" except on the final
   point, where it still refuses.

## T2 · Create attachment persistence and privilege boundaries — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919045208_create_match_video_attachments.sql`
creates `public.match_video_attachments` — 36 columns covering identity, the
pending/active/retired lifecycle and version, staged/final blob keys, copy id/status,
verified media facts, `confirmed_video_time_seconds` at millisecond precision, offset,
`client_request_id`, expected-active id/version, SAS expiry, and the finalize/cleanup lease
and retry metadata. 15 check constraints, 8 indexes and a BEFORE UPDATE trigger that
refuses retired→anything, active→pending and any blob-key change. Both `match_id` and
`uploaded_by` are nullable with ON DELETE SET NULL. RLS is enabled with no policy, all
privileges revoked from public/anon/authenticated and granted to service_role only —
the same server-only shape as `pending_claims` and `program_requests`. A check constraint
refuses a `scheme://` prefix or any `?`/`#` in either key, so a SAS URL cannot be stored
as a key. Applied to the live project with the Supabase MCP and verified there against
`pg_class`, `pg_policies`, `role_table_grants`, `pg_constraint`, `pg_indexes` and
`pg_trigger`; the only new advisor entry is the INFO-level `rls_enabled_no_policy` that
every server-only table here carries. New `tests/match-video-attachments-db.spec.ts`,
8 live-DB tests on `tests/fixtures/live-db`, all passing, rows self-cleaned.

**follow-ups:**

1. `DbMatchVideoAttachment` in `src/lib/data/types.ts` is still missing — create-migration's
   step 6 asks for it, but this task forbade application code. T3's server readers are the
   natural place.
2. `match_video_attachments_active_verified_check` constrains T4: activation must set all
   six verified/alignment fields plus `activated_at` in one statement, and `retired_at`
   exactly when state is retired. Write the RPCs to those constraints, not around them.
3. The trigger enforces one-way transitions but deliberately does not stamp
   `activated_at`/`retired_at` — the transaction owns those timestamps.
4. Unrelated: `20260913230000_notification_prefs_team.sql` fails `create-migration`'s
   `check.sh` policy-or-marker rule. Left alone; worth its own task.

## T3 · Implement reservation renewal and cancellation transactions — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919050413_match_video_attachment_reservations.sql`
adds four functions, all `security definer` with `search_path = ''`, EXECUTE revoked from
public/anon/authenticated and granted to `service_role` only.
`match_video_authorize_match` is the shared guard: it refuses an authenticated or anon JWT
outright, locks the parent `matches` row `for no key update` before any attachment row, then
rechecks creator, `source_provider = 'swing-vision'` and the exact workspace (personal means
`program_id is null` and the workspace id is the actor; team means `program_id` matches and a
current `program_members` row exists). `match_video_reserve_upload` mints the staged/final
keys from the new row id and writes them with `expected_active_id`/`version`,
`client_request_id` and the SAS expiry before any credential is issued; an identical retry
returns the same row with `reused = true`, changed metadata under the same request id
conflicts, and other pending work conflicts. `match_video_renew_upload` keeps the greater of
the stored and supplied expiry, never rolls it back, and refuses a finalizing or retired
attempt. `match_video_cancel_upload` retires pending work idempotently, seeds
`cleanup_next_attempt_at` from the last SAS expiry, and refuses an active asset. Errors carry
the T1 `MatchVideoErrorCode` as the message and a cause slug as the detail. Applied to live
and verified there: `prosecdef` true, `proconfig` pins the empty search path, EXECUTE denied
to anon/authenticated/public, `for no key update` present in the guard's definition.
`tests/match-video-attachments-db.spec.ts` grows from 8 to 16 live cases, all passing,
including 5-way concurrent reservation races (exactly one pending survives) and RPC
privilege denial for anon and two authenticated sessions across all four functions.

**follow-ups:**

1. Precedence worth knowing for T8: a retried reservation whose expected-active differs is
   answered `stale_attachment`, not `pending_attempt_conflict` — reality is checked before the
   request-id lookup.
2. T4's activation must lock the match the same way (`for no key update` first) and owns
   setting and clearing `finalize_lease_token`/`until`; reserve, renew and cancel all honour
   that lease already.
3. T13's cleanup worker gets `cleanup_next_attempt_at` seeded by cancel; it only needs T2's
   partial index to find the rows.
4. An RPC wrapper in `src/lib/match-video/` is deliberately absent — that is T8's job.

## T4 · Implement atomic activation and alignment transactions — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919052002_match_video_attachment_activation.sql`
adds six functions, all `security definer` with `search_path = ''`, EXECUTE revoked from
public/anon/authenticated and granted to `service_role` only. Two are read-only SQL twins of
T1's TypeScript: `match_video_source_timing` mirrors `summarizeSourceTiming` and
`match_video_plan_alignment` mirrors `planAlignment`, both shared by the writers.
`match_video_begin_finalization` takes the lease by CAS (free, expired, or the same token),
freezes the confirmed time and rechecks the reservation's expected-active belief against
reality; `match_video_release_finalization` drops it holder-only for the failure path;
`match_video_activate_attachment` retires the old active row and activates the new one in one
transaction, returning `reused = true` on an idempotent replay;
`match_video_correct_alignment` does a version CAS and recomputes from source rows against the
saved verified duration, returning `changed = false` on a no-op. All call T3's
`match_video_authorize_match` first, so the parent `matches` row is locked before any
attachment row. The migration carries a self-checking `do` block asserting the privileges, the
secdef/search_path pinning, the lock order, and that no function body writes `points`,
`shots`, `matches` or `match_stats`. Applied to live and verified there. The spec grows from
16 to 30 live cases, all passing.

Timing parity is proven, not asserted: one fixture match is shaped so an interior point ends
at 150.125s — past the final point's 131.0s end — with a shot at 140.6s after the final point
and another at 5.5s before the anchor, plus untimed and zero-duration rows. The test reads
those rows through PostgREST the way the app does, runs the TypeScript helper, calls the SQL
twins on the same match, and demands equality on every field, including the tolerance edges
(147.7 accepted, 147.6 refused) and ten fault fixtures whose refusal slug must match exactly.
The project runs `extra_float_digits = 0`, so float8 values come back rendered to 15
significant digits; the test normalises the TypeScript value through that one rendering step
rather than hiding the difference under a tolerance, and the reviewer confirmed the setting
live before accepting it.

**follow-ups:**

1. `extra_float_digits = 0` truncates `real` columns on every read path — `points.video_time`
   1234.567 reads back as 1234.57 through PostgREST. Pre-existing platform config, not this
   feature's doing, but it caps Film seek precision past about 1000 seconds and deserves its
   own look.
2. Neither `types.ts` nor the SQL defines an HTTP mapping for SQLSTATE `22000`; the route
   wrappers in T8–T12 should map it to the `MatchVideoErrorCode` carried in the message.
3. Copy bookkeeping (`copy_id`, `copy_status`, `source_etag`) still has no RPC. T7's completion
   service can write it with the admin client, or T7/T10 may want a narrow
   `match_video_record_publication` RPC — worth deciding once rather than twice.

## T5 · Implement bounded shared media inspection — blocked

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: needs-work —
the second `done when:` line names five budgets and requires each to be enforced; the 8 MiB
cache budget (`MEDIA_PROBE_CACHE_BYTES`) is declared and passed to Mediabunny's `maxCacheSize`
but no test drives it, and the constant is never referenced from the spec. The other four
budgets (32 MiB total, 2 MiB chunk, 128 requests, 15s deadline) and abort/disposal are each
enforced and tested.

**changed:** Nothing committed. Stashed at `726273e360d40b5044ee130588e3d54dbbd27d1f`
(`git stash apply 726273e3`) — note `refs/stash` is shared across worktrees and other branches
have entries, so apply by SHA, not by index. The stash holds a substantially complete
implementation: `src/lib/match-video/media-inspection.ts` (isomorphic, injectable byte-source
seam for T6, no Azure/Supabase/Next imports, T1's error codes only),
`tests/match-video-probe.spec.ts` (24 passing cases) and `tests/fixtures/match-video/` — five
self-generated clips of 9–22 KB plus the `generate.mjs` that produced them via
Mediabunny/WebCodecs. The browser clock-agreement test is real: it serves the fixtures over a
range-capable server and seeks a live `<video>` element, comparing against the parser rather
than hardcoding numbers on both sides.

This run was also interrupted by the user partway through, so the implementing subagent never
wrote a final report; the verdict above comes from reviewing the artifacts directly.

**follow-ups:**

1. To unblock: apply the stash and add one test that drives the 8 MiB cache budget, then
   re-run. That is the only criterion gap the review found.

## T5 · Implement bounded shared media inspection — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
(re-review after the earlier `needs-work`; the reviewer re-judged all four criteria, not just
the one that had been blocking, since the module was touched)

**changed:** Unblocked from the stash `726273e3` rather than rewritten. New
`src/lib/match-video/media-inspection.ts` — isomorphic (no Azure, Supabase or Next imports),
T1's error codes only, with the byte source an injectable seam so T6 can adapt it to Azure
range reads. It uses only Mediabunny's MP4/QTFF/Matroska/WebM readers, requires a video track,
and takes the media end from that track's own clock rather than audio duration or any
client-supplied value. `MeteredSource` enforces the 32 MiB total, 2 MiB chunking and 128
request cap; a 15-second deadline runs on an AbortController, and a `finally` clears the timer,
aborts, and disposes both input and source on every exit. Local preflight slices the File
rather than buffering it. AVI is refused at both the extension and content gates; external
resource formats, audio-only, corrupt, truncated, nonfinite-duration and unsupported timing
layouts each refuse with their own code.

`tests/match-video-probe.spec.ts` holds 25 cases and `tests/fixtures/match-video/` five
self-generated clips of 9–22 KB plus the `generate.mjs` that produced them. The browser
clock-agreement test serves the fixtures over a range-capable server and seeks a live `<video>`
element, comparing against the parser rather than hardcoding numbers on both sides.

The gap that blocked the first attempt — the 8 MiB cache budget being wired but untested — is
closed by running the same production path twice over the same 3 GiB virtual file, once at the
production budget and once with caching disabled, and asserting the re-read amplification
differs (0 bytes refetched versus about 1.65 MiB) while both runs return the same duration.
A `cacheBytes` test seam was added for this; it defaults to the constant and no production
caller sets it. Worth recording honestly: the _magnitude_ 8 MiB is not observable from outside
Mediabunny — its eviction loop refuses to evict when that would bring the cache back under the
limit, and `CustomSource`'s own default is also 8 MiB — so only caching-on versus caching-off
can be proven. The reviewer checked that claim against `node_modules/mediabunny` directly
before accepting the test as the honest best available.

**follow-ups:**

1. The first attempt was interrupted mid-run, so no implementer report exists for the bulk of
   this module; the verdict came from reviewing the artifacts. Worth a closer read than usual
   when T6 builds on it.
2. `MEDIA_PROBE_CACHE_BYTES` can never be proven at its exact magnitude by a black-box test.
   If that matters later, it would need a Mediabunny-internals assertion, which is not worth it.

## T6 · Verify stored video metadata through bounded Azure ranges — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/probe.ts` adapts T5's inspection to Azure range
reads without forking it: the adapter implements only T5's `MediaByteSource`, so `MeteredSource`
still owns the 32 MiB total, 2 MiB chunk, 128 request, 8 MiB cache and 15s deadline budgets and
the disposal. Reads go through the existing `videoContainerClient()` from
`video-url/azure-sas.ts` — the SDK path, not a minted SAS URL, so there is no bearer credential
in play. Ranged downloads only; no whole-blob fetch, no codec or transcode dependency.

Caller authority is refused at compile time, not by convention: `StoredVideoBlob` is branded
with a module-private `unique symbol`, so the only way to get one is `stagedBlobOf(row)` or
`publishedBlobOf(row)`, whose argument is the `match_video_attachments` row shape that only
server code writes. Both factories re-check the key is a plain object name, duplicating T2's
check constraint. The spec pins this with `@ts-expect-error` on a forged literal and on an extra
`blobUrl` field; `tsconfig.json` includes `tests/**`, so if either ever became assignable the
now-unused directive would fail the build.

ETag handling is the subtle part. One ETag is pinned from the first `getProperties`; a recorded
`source_etag` that differs refuses before a byte is read, every range carries `ifMatch`, and
properties are re-read after the parse. The mid-parse case needed an out-of-band `replaced`
flag checked _before_ the inspection result, because Mediabunny can swallow a failed prefetch
and still return a successful parse — without that flag a replaced blob could have returned a
duration spliced from two files. The test proves exactly that: the bytes still decode, and the
result is refused anyway.

Browser metadata stays advisory. A forged declared size of 12, content type
`video/x-matroska`, duration 99999 and a `text/plain` storage header produce a verdict
identical to declaring nothing; the lies surface only as `declaredMismatches`, which no branch
reads. Measured length drives the size gates.

`tests/match-video-probe.spec.ts` grows by 14 cases to 27, and
`tests/client-bundle-boundary.spec.ts` gains the new module in its `SERVER_ONLY` list so the
server-only property is machine-enforced. 41 tests pass across the two files.

**follow-ups:**

1. `classifyStorageFailure` maps a 404 to a retryable `storage_unavailable`. That is right while
   bytes may still be landing, but T10's completion endpoint needs its own bound on how long it
   retries a blob that genuinely never arrived.
2. `azureBlobReader` uses `videoContainerClient()`, the vendor-pipeline container. If
   attachments get their own container, that helper and the key prefixes belong in T7's storage
   adapter and the probe should take its reader from there.
3. The `content_type_not_supported` branch is currently unreachable — every format in
   `INSPECTED_FORMATS` maps into `MATCH_VIDEO_MIME_TYPES`. Worth keeping as a guard, but if the
   two lists drift a test should pin the mapping.

## T7 · Implement immutable Azure attachment publication — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/storage.ts` publishes a staged upload to its final
key through a server-side copy, never a re-upload. Keys come from the persisted row via T6's
`stagedBlobOf`/`publishedBlobOf` — T3's SQL mints them and the adapter does not invent a second
layout. `mintAttachmentUploadCredential` signs `cw` on the staged key only for six hours;
`mintAttachmentPlaybackCredential` signs `r` on the final key for thirty minutes. The
`AttachmentBlobOps` seam deliberately has no download or read method, so byte access is
impossible by type rather than by convention. Deletion is `deleteIfExists`, idempotent, with a
409 `PendingCopyOperation` surfacing as a retryable failure so a copy is aborted before its
destination is collected.

`beginPublication` issues one Start Copy conditioned on the staged ETag with
`ifNoneMatch: "*"`, stamping ownership metadata on the destination, and returns immediately —
a 6 GiB copy is never awaited inside a request. `inspectPublication` polls; `copyId` is exposed
for T10 and `abortPublication` is the seam T14 needs. On a 409 or 412 the adapter reads the
destination once and decides: absent means the source ETag moved, present and owned means resume
with its copy id (which covers both a concurrent attempt and a lost response), present and not
owned is refused outright. That refusal is the immutability property in the task title — the
reviewer confirmed every path that could write or delete a final key leaves a stranger's object
byte-for-byte unchanged, with zero delete calls.

The browser-cannot-write-final proof is real signing, not prose: the test signs with a throwaway
account key, recomputes the signature for the staged blob (it matches, so the recomputation is
faithful) and for the final blob (it differs), so a client that swaps the path presents a
signature Azure rejects. The source-read SAS the copy needs is minted inside the function and
never returned; a test JSON-stringifies the result and asserts no `sig=` and no storage host.
`tests/match-video-storage.spec.ts` holds 19 cases; `storage.ts` joins `SERVER_ONLY` so
`@azure/storage-blob` cannot reach a client bundle. Nothing here writes to Supabase — T10 owns
that.

Container decision, made deliberately: the same `AZURE_STORAGE_CONTAINER` with a `match-video/`
prefix, not a new container. The existing primitives are bound to that container, T3 already
fixed the prefix in SQL with DB tests behind it, the browser upload needs the CORS rule that
account already carries, and `cleanup-orphan-storage.ts` documents a second "which container
holds videos" definition as exactly the drift it exists to clean up.

**follow-ups:**

1. Real hazard, worth its own task before any deployment carries attachments:
   `scripts/cleanup-orphan-storage.ts` attributes a blob to a match by its _third_ path segment.
   Under `match-video/<matchId>/<attachmentId>/…` that segment is the attachment id, never a
   valid match id — so `--apply` would delete every attachment blob as an orphan. It must skip or
   re-attribute the `match-video/` prefix first.
2. `startCopy` casts `poller.getOperationState()` because the SDK keeps `startCopyFromURL`
   private behind the public `beginCopyFromURL`. Worth a note if `@azure/storage-blob` is bumped.
3. The 1-hour source-SAS TTL assumes a same-account copy finishes well inside it; T10 could
   surface `bytesCopied`/`bytesTotal` if a copy ever approaches that.

## T8 · Authorize and prepare attachment uploads — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/access.ts` is the shared helper T9–T12 will all
call: `authorizeMatchVisibility` for reads and `authorizeMatchVideoMutation` for writes, in a
fixed order — sign-in, then UUID shape (refused before any read), then an RLS-scoped read through
the _caller's own_ client so the database decides visibility, then creator, then `swing-vision`
provenance, then the exact active workspace. A personal match requires the personal workspace
whose id is the actor; a team match requires the team workspace for that exact program. The
detail slugs match T3's SQL so the HTTP and database layers agree.

Supporting modules: `http.ts` (same-origin check, a 4 KiB bounded stream reader instead of
`request.json()`, and `private, no-store` stamped on every response) and `rpc-errors.ts`
(SQLSTATE plus the `MatchVideoErrorCode` the RPCs raise as the message → HTTP status). That
closes T4's open question: status comes from the code in the message, so `22000` is 422 for
timing and alignment failures and 413 for size ones, while `23505` is a 409 backstop, `40001`
and `40P01` are retryable, and anything unrecognised is a logged 500 rather than a guess.
`uploads.ts` and the single POST route do preparation: origin, auth, bounded body, strict parse,
access, reserve via T3, then mint.

No caller-supplied authority is enforced by the type system, not by validation alone.
`MatchVideoMutationAccess` is branded with a `unique symbol` that `access.ts` never exports, so a
request body cannot produce one, and the reserve call reads actor, workspace and match id only
off that branded value. The parser additionally refuses unknown keys _by name_; the spec walks
21 forged fields — `attachmentId`, `stagedBlobKey`, `uploadUrl`, `container`, `offsetSeconds`,
`workspaceId`, `userId` among them — and one test inspects the actual RPC call to confirm the
arguments equal the session and switcher fakes.

Ordering is right for the failure case: the expiry is persisted before the SAS is minted, and
`mintAttachmentUploadCredential` gained a `notAfter` option so the credential cannot outlive the
recorded window. A signer failure therefore leaves a usable reservation rather than a minted but
unrecorded credential, and a same-request retry gets its credential — tested.

`tests/match-video-upload-handlers.spec.ts` holds 60 injected-handler cases. Every denial asserts
from an event log that neither `reserve` nor the credential minter was ever called and the store
is empty, rather than only checking a status code. T3's precedence is honoured and pinned: a
stale expected-active on a retried request id answers `stale_attachment`, not
`pending_attempt_conflict`.

Out-of-`files:` edits, each judged required by the reviewer: `types.ts` gained an
`isMatchVideoErrorCode` guard that `rpc-errors.ts` consumes; `storage.ts` gained the `notAfter`
option criterion 2 needs; `MAP.md` gained the route line this repo's `npm run map` convention
requires; `client-bundle-boundary.spec.ts` gained the three new server-only modules.

**follow-ups:**

1. T9–T12 should reuse `matchVideoAccessDeps()`, `checkSameOrigin`, `readBoundedJson`,
   `errorResponse` and `matchVideoRpcError` rather than re-deriving any of it. The
   `internal_error` fallback in `rpcReserveUpload` is the template.
2. Content-type validation accepts any plausible MIME token because browsers report `""` for
   `.mkv`. The wizard (T17/T18) must substitute a type from the extension before calling, or the
   server answers 400 `content_type_format`.
3. `checkSameOrigin` refuses any request without an `Origin` header. A non-browser client — a
   Playwright `request` smoke test, say — must set it explicitly. Worth knowing at T27.

## T9 · Expose upload renewal and cancellation endpoints — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** Two new routes — POST `…/uploads/[attachmentId]/renew` and DELETE
`…/uploads/[attachmentId]` — both wiring only, with the work in `uploads.ts` alongside T8's
preparation handler. T8's helpers were reused rather than re-derived: `access.ts` and
`rpc-errors.ts` are untouched, and the reviewer confirmed the only `http.ts` addition
(`readNoMetadataBody`) delegates the bounded read to the existing `readBoundedJson` instead of
re-implementing it.

Renewal runs origin → sign-in → id shape → empty body → access → renew → mint as an asserted
event sequence, and cuts the credential against `upload_sas_expires_at` _as the RPC returned it_
— never the value this process proposed. A test with a backwards-skewed clock shows the stored
later expiry winning and the issued credential bounded by it, which is what makes T3's
never-roll-back rule hold end to end. Retired, active and finalizing work are refused by the
database, with no second opinion in the handler that could drift from the transaction's.

The safety crux is cancellation, and it is structural rather than conventional:
`CancelUploadDeps` has no signer and no storage field at all, so the handler _cannot_ delete a
staging blob whose write SAS is still live — which would otherwise let a still-uploading browser
write to a deleted key and recreate an untracked blob. Cancellation only retires the record and
seeds `cleanup_next_attempt_at` from the last SAS expiry; T14 collects the bytes afterwards. One
test asserts the dep object's complete key set, another that the route file's source imports
neither the storage module nor `@azure/storage-blob`. Three consecutive DELETEs return identical
bodies with an unchanged `retiredAt`; an active attachment is refused and stays active.

A forged attachment id is refused by the database's own predicates, not a handler guess. The
tests assert the full access ladder ran and the id reached the RPC seam, with T3's own detail
slugs coming back: an attachment belonging to another match is refused by `match_id`
(`no_such_attachment`), one uploaded by someone else by `uploaded_by` (`not_uploader`), and the
caller's own pending row is confirmed untouched by the guess. The spec grows from 60 to 87 cases;
90 pass across the three files checked.

**follow-ups:**

1. Renewal's RPC returns no `final_blob_key`, so the handler passes `""` into the signer's row
   shape. Safe and documented at the call site, but a narrower
   `mintUploadCredentialForStagedKey({ id, staged_blob_key })` in `storage.ts` would remove the
   sentinel — worth folding in if T10 wants a similar narrow seam.
2. `readNoMetadataBody` refuses `body: ""` as `malformed_json` rather than as an empty body.
   Clients should send no body or `{}`; if the wizard ends up sending an empty string, soften it.
3. T3's lease check is time-based only. **T10 must clear the finalization lease on failure**,
   or a crashed completion blocks cancellation for the lease's full duration.

## T10 · Finalize uploads with resumable publication and atomic activation — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/complete.ts` and its POST route. Every poll re-runs
T8's full access ladder, then takes a fresh finalization lease through T4's
`match_video_begin_finalization`, which freezes the confirmed time and rechecks the expected-active
belief. Only then is storage touched: on first entry T6's bounded probe of the staged blob; on
resume a single HEAD pinned to the recorded ETag, so overwritten staging is `stale_attachment`
before the copy is even polled. A pending copy answers 202 with `retryAfterSeconds: 2` and a
matching `Retry-After`. On success the published length is checked against staged, the _final_
blob is probed, and those measured values — never the staged or client-declared ones — are what
activation receives, with coverage recomputed from source rows inside T4's transaction.

The property an athlete would notice is that the previous active video survives every failure,
and it is proven per-path rather than once: each failure test snapshots the active row with
`structuredClone` and asserts deep equality afterwards, across an 11-entry boundary table
(begin, probe staged, begin publication, persist, probe published, activate — each as a returned
error and as a thrown exception) plus the cancellation, deletion, retired-attempt, too-short and
undecodable scenarios. The attempt stays `pending` throughout; no new state was invented, no
source row is written, and no vendor job, billing or quota was introduced.

T9's carried constraint is honoured. The lease is per _request_, not per attempt — the client
never holds a token — and `finalize()` releases it in a `try/finally` on every exit except a
successful commit, where activation cleared it in-transaction. A failed release is logged and does
not change the answer. `FINALIZATION_LEASE_SECONDS = 90`, chosen to outlast two 15-second probe
deadlines plus round trips while capping how long a crashed request can block cancellation, since
T3's lease check is time-based only.

The never-landed bound closes T6's open question: a 404 on the staged blob stays a retryable 503
while `upload_sas_expires_at` is in the future, because a credential could still write that key,
and becomes a terminal 413 once it has passed, because T8 persists the expiry _before_ minting so
nothing can ever write it afterwards. That reuses a guarantee the system already makes instead of
adding a column or a timer. `tests/match-video-completion.spec.ts` holds 72 cases; 162 pass across
the four specs checked.

**follow-ups:**

1. `parseExpectedActive` is now duplicated verbatim in `uploads.ts` and `complete.ts` — ten lines,
   private in both. The reviewer flagged it as acceptable-but-noted rather than blocking. Worth
   hoisting into `http.ts` in a cleanup pass.
2. The never-landed 503 window can be up to six hours. A tighter bound (an attempt counter or a
   `first_completion_at` column) would end the polling sooner; the wizard's own bounded transient
   retries are what keep this tolerable today.
3. T14 must abort a pending copy before deleting a retired row's blobs — cancellation during
   publication is now reachable and tested, so that path is live rather than theoretical.
4. A second concurrent poll gets 409 `pending_attempt_conflict/finalizing`. The wizard (T20)
   should serialise its polls; mapping that detail to a 202 instead would be the alternative.

## T11 · Expose alignment correction without re-upload — done

**gate:** mechanical GATE FAIL then GATE PASS on re-run · completion VERDICT: pass

The first gate run failed in `tests/pending-invites.spec.ts`, a live-DB spec this task never
touches, inside its `beforeAll` program insert. Run in isolation it passed 9/9, and the full
gate passed on re-run — the known shared-IP live-DB flake, not a T11 regression. Recorded here
because a bare "GATE PASS" would have hidden a re-run.

**changed:** New `src/lib/services/match-video/alignment.ts` and its PATCH route. The body is
exactly three fields — attachment id, expected version, confirmed time — with unknown keys
refused by name; a malformed clock is `invalid_alignment` (422) rather than a generic
`invalid_request`, because the time goes through T1's own parser. Order is same-origin,
sign-in, bounded body, parse, `authorizeMatchVideoMutation`, RPC, with the branded access value
the only source of actor and workspace. T4's version CAS then recomputes from source rows
against the _saved_ verified duration and writes only time, offset and version.

No re-upload is structural, proven three independent ways: `UpdateAlignmentDeps` has no storage
seam at all (a test asserts its exact key list), the route file's source is read from disk and
asserted to mention no storage, probe, Azure SDK or SAS module, and the service module's own
import specifiers are scanned for the same. The success response is also asserted to carry no
`sig=`, `uploadUrl` or `playbackUrl`.

Source rows are read-only, proven four ways: the `points` and `shots` fixtures are deeply
`Object.freeze`d so a write throws in strict mode, a JSON snapshot is compared before and after,
every recorded write is asserted to name `match_video_attachments:`, and — the interesting one —
a test reads T4's migration and asserts its assertion block still guards
`match_video_correct_alignment` under the imported-data rule. Weakening the SQL-side check
therefore fails a test in the HTTP layer.

Repeated corrections do not accumulate: a 5→4→8→4 sequence lands offset 6→2→6, returning to
exactly the original value, which is what recompute-from-anchor looks like and what accumulation
would not produce. A no-op leaves the version alone. Error codes stay distinct — only
`insufficient_coverage` carries "This video is not long enough.", and the missing-timing test
explicitly asserts its own message does _not_ contain that phrase.

Also resolved T10's flagged duplication rather than extending it: `parseExpectedActive`, with the
`isPlainObject` and `invalid` helpers it depends on, moved into `http.ts` and both local copies
were deleted — about 60 lines net removed. No import cycle (`http.ts` → `access.ts` only), no
behaviour change, both existing specs still green. `tests/match-video-access-handlers.spec.ts`
holds 35 cases; 197 pass across the five specs checked.

**follow-ups:**

1. `parseAttachmentId` is still duplicated verbatim in `uploads.ts` and `complete.ts` — the same
   finding, one function later. Worth the same hoist next time either file is touched.
2. T12's `GET /api/matches/[matchId]/video` is the other half of plan step 8 and belongs in this
   same spec file, which is named for both and currently covers only alignment.
3. The route answers only PATCH; Next synthesises `OPTIONS` with an `Allow` header. If the wizard
   ever preflights explicitly, confirm that synthesised response suits a `private, no-store`
   endpoint.

## T12 · Expose authorized playback metadata and refresh — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/playback.ts` and its GET route complete plan
step 8. The gate is `authorizeMatchVisibility`, not the mutation helper — a teammate who can see
a match may watch its video without being able to change it. One test proves both sides with a
single identity: 200 with playable metadata from the playback handler, 403 `not_creator` from
the alignment handler. The active row is read with the service role because T2 gives the table
no RLS policy and no client grant, with `state = 'active'` in the `where` clause rather than
checked afterwards. The body carries id, version, offset, confirmed time, the duration verified
at publication, content type, filename, and the read URL with its expiry.

No upload credential or staged object can leak, proven against the _raw serialized body_ —
assertions for `uploadUrl`, the staged key's literal value, the substring `staged`, and the
write permission sets `sp=cw`/`sp=rcw`/`sp=w`, run on the populated, empty, non-creator and 409
answers alike. Structurally the leak is unreachable: `PlaybackAttachmentRow` has no
`staged_blob_key` field at all, the credential type has no `uploadUrl`, and a source test
asserts the module never names the upload minter or `beginPublication`.

A match with no active attachment answers `200 {"attachment": null}` rather than 404 — a 404
would be a claim about the match, which the caller can plainly see exists. The body deliberately
carries no `mode`, `canUpload`, `attachmentId` or reservation hint, so it reads as information
rather than an invitation; a client that goes on to reserve still faces T3's partial unique
index. A vanished final object is _not_ reported as "no video", which is the answer that would
get a duplicate uploaded over a still-active match: it is 409 `stale_attachment` /
`final_object_missing`, while an unreachable store is a retryable 503.

Replacement and correction are distinguishable from the returned fields: a different `id` means
the video was replaced and the player must reload its source; the same id with a higher
`version` means only the alignment moved, so the source stays and the timeline shifts by the new
offset. A test walks that exact sequence.

Deliberate and documented: no same-origin check on this GET. Browsers send no `Origin` on a
same-origin GET, so `checkSameOrigin` — written for mutations, as its own doc comment says —
would refuse every legitimate call. The credential is protected instead by the route setting no
CORS header at all, so a cross-site page can cause the request but never read the response, plus
`private, no-store`. Nothing on this path changes state. The reviewer judged the reasoning sound.

`tests/match-video-access-handlers.spec.ts` grows from 35 to 53 cases; 215 pass across the five
specs checked.

**follow-ups:**

1. Playback does one blob HEAD per refresh to tell a vanished object from a live one. Cheap for a
   30-minute SAS, but if T25's refresh hook polls harder it is worth caching that check for the
   life of the credential — or dropping it once T13/T14 can be trusted never to delete an active
   final key.
2. `MAP.md`'s API line is hand-maintained: `scripts/generate-map.mjs` only walks `page.tsx`, so
   every new API route depends on someone remembering to edit one prose cell. A generator pass
   over `route.ts` files would make `npm run map` actually cover them.
3. `finalBlobOf` fills `staged_blob_key` with the final key to satisfy T6's row shape, which reads
   only `final_blob_key`. Harmless but awkward; a `publishedBlobOf` overload taking just the final
   key would remove the wart.

## T13 · Add cleanup claim and fencing transactions — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919080217_match_video_attachment_cleanup.sql` adds
three service-role RPCs plus two private helpers, all with a pinned empty `search_path`.
`match_video_claim_cleanup(worker_token, lease_seconds, limit)` leases at most 50 collectible
rows — the limit is enforced, not merely documented — and returns each row's keys, `copy_id`,
`copy_status`, `version` and per-key `collect_staged`/`collect_final` flags, which is exactly
what T14 needs to abort an in-flight copy before deleting. `match_video_confirm_cleanup` settles
a confirmed deletion under a lease and version CAS; `match_video_fail_cleanup` counts the
failure, backs off (ten minutes doubling to a 24-hour cap), releases the lease and _keeps the
keys_, so nothing is forgotten before its bytes are gone.

The rule that protects real athlete video holds: when an uploader's account is deleted,
`uploaded_by` goes null but the team keeps the match and its playable video. The eligibility
predicate never reads `uploaded_by` at all, the migration's own `DO` block asserts that it
never will, and the test deletes an actual auth user rather than simulating a null — after
which the active row is returned with `collect_final = false`, sheds only its staging data, and
a later sweep parks it at `'infinity'`. An orphan row with a null `match_id` is treated
differently and is fully collectible, which is the distinction that matters.

Fencing is atomic rather than advisory: a claim retires abandoned pending work in the same
transaction as the lease, so renew, `begin_finalization`, activate and a reserve replay all
refuse afterwards, and T2's trigger refuses a direct flip back. Two `Promise.all` races — claim
versus begin, claim versus renew — show exactly one winner with the loser seeing it, so a worker
claim can never become a late activation. Every staged branch requires the latest upload SAS
expiry plus five minutes, distinguished in tests by a credential two minutes expired (not
eligible) versus six (eligible), so a writer holding a valid credential never loses its target.

Applied to live and verified there: `prosecdef` true, `proconfig` pinning the empty search path,
EXECUTE denied to anon and authenticated and granted to `service_role` only, with the private
helpers unreachable. The spec grows from 30 to 42 live cases, all passing, and the live project
was left with zero fixture rows.

**follow-ups:**

1. A partial index on `(cleanup_next_attempt_at) where cleaned_up_at is null` would help the
   sweep once the table grows; T2's `cleanup_due_idx` only covers `state = 'retired'`.
2. The claim holds up to 50 match locks until commit. If that ever contends with live uploads,
   T14 can sweep in smaller batches — `p_limit = 10` in a loop — without any SQL change.

## T14 · Implement retryable attachment cleanup worker — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/cleanup.ts` consumes T13's claims — it never
re-derives eligibility, which stays in SQL. One claim per run with a fresh worker token, drained
through a four-lane pool; `CLEANUP_CONCURRENCY = 4` because a 50-row batch is then about thirteen
rounds of a handful of cheap calls, finishing well inside the fifteen-minute lease, and an outage
trickles 50 rows into backoff rather than bursting. The bound is enforced by a shared-queue pool,
not merely declared: a test asserts `maxConcurrent` stays at or below 4 while exceeding 1 under
real async interleaving. Two entry points, `runMatchVideoCleanup` for T15's cron and
`requestBestEffortCleanup` for T16's replacement path, both over the same worker.

The copy race is the dangerous failure here — a copy still running can recreate a final blob just
deleted, leaving an untracked object nobody will ever collect. The worker aborts before deleting,
and if a delete still reports a pending copy (reachable after a lost response left a new copy id
unpersisted) it HEADs the destination, aborts the id actually in flight, and deletes once more; a
copy surviving both is failed with a ten-minute retry rather than worked around. The proof is
real: the fake container holds copy bytes in an in-flight map and only writes them in an explicit
`settleCopies()` the test calls _after_ the worker returns, so a recreated blob would be visible.
Three cases — the ordinary race, the same race with the backend's 409 disabled (so the guarantee
demonstrably comes from the worker's ordering, not Azure's refusal), and the stale-copy-id
discovery — all settle to nothing at the key.

An active row's final key is protected three ways: T13 returns `collect_final: false`, the worker
independently refuses a final delete for any non-retired state, and it always sends
`collected_final: false` so the SQL's `active_final_collected` raise can never fire. A "lying
claim" test rewrites the flag to true on an active row and the object survives untouched. A row
closes only when every tracked object is gone; partial deletion keeps the keys and the retry
metadata. A 404 from delete is success, since the object being absent is the desired end state.

`tests/match-video-cleanup.spec.ts` holds 22 cases; 45 pass across the three specs checked.

**follow-ups:**

1. T15 should call `runMatchVideoCleanup(productionCleanupDeps(createAdminClient()), { reason:
"cron" })` and treat a rejected promise as its own 500; `claimError` on the summary is the
   "ran but the database refused" signal.
2. T16 can fire `void requestBestEffortCleanup(deps, { reason: \`replace:${matchId}\` })` after
   activation or cancel. Expect the just-retired row to stay held until its upload SAS plus five
   minutes passes, so that immediate run mostly collects _other_ due rows — by design, not a bug.
3. `rpcFailure` maps SQLSTATE `P0002` (row deleted between claim and settle) to a retryable
   failure. Harmless, but T15 may want to count it separately in logs.
4. `storage.ts`'s `isRestStatus` is duplicated inline in `pendingCopyAt`; exporting it from T7
   would remove the second `RestError` import.

## T15 · Schedule and protect attachment cleanup — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/app/api/cron/cleanup-match-videos/route.ts` (wiring only, Node runtime,
`maxDuration = 60`) and `src/lib/services/match-video/cleanup-schedule.ts`, which holds
`authorizeCronRequest` and `handleCleanupCron`. The split follows the house pattern every
`/api/matches/[matchId]/video/*` route already uses, and is forced besides: Next reserves route-file
exports for handler names, so an injectable, testable handler cannot live in `route.ts`. The
reviewer judged it sound rather than creep.

No CRON_SECRET house pattern existed — grep found the variable only in `.env.example`, a comment in
the splitstep webhook prescribing `Authorization: Bearer <secret>`, and two doc lines saying it had
no route to protect. This establishes the pattern those comments describe and borrows the
digest-then-`timingSafeEqual` idiom from that webhook's HMAC check, so the repo has one comparison
style. Both sides are SHA-256 digested before comparison, because raw `timingSafeEqual` throws on a
length mismatch and that throw is itself a length oracle. An unset, blank or whitespace secret
refuses _before the request is read_, and the misconfiguration is logged by variable name only.
Every refusal returns one identical body with `private, no-store`; no log line or response carries
the configured or presented value.

The gate runs before anything else, and that is what the tests actually check: 11 table-driven
refusal cases — no header, wrong secret, prefix, secret-plus-suffix, empty bearer, raw secret
without scheme, `Basic`, secret in its own header, correct bearer with the secret unset, and two
blank-secret variants — each assert four things: 401, zero worker invocations, an empty database
event log, and an empty storage event log with both blobs still present. So the proof is that
nothing was reached, not that a status code was returned.

Schedule is `0 5 * * *` on `/api/cron/cleanup-match-videos`; a test parses `vercel.json` and asserts
both the preserved `$schema` and that the scheduled path resolves to a real route file. `.env.example`
keeps exactly one valueless `CRON_SECRET=`, its comment block rewritten from "no scheduled routes
exist today" to document the consumer, the cadence, the 24–48 hour collection window, how to
generate a value, and that unset fails closed. An authorized sweep is proven bounded: 60 eligible
rows yield one claim, 50 collected, 10 left for tomorrow. `MAP.md`'s API row named
`cron/reclaim-videos`, a route that no longer exists; replaced with this one. The spec grows from 22
to 47 cases.

**follow-ups:**

1. **`CRON_SECRET` must be set in Vercel for production and preview before this does anything.**
   Until then every call is refused and logged, and storage grows without bound. That is a
   deployment step, deliberately not taken here.
2. `docs/video-pipeline-overview.md` lines 379 and 635 still say `CRON_SECRET` has no route to
   protect and is unused — now false. T28 already owns cron-secret and schedule documentation.
3. The plan's other cron need is still open: reprocessing when `DERIVATION_VERSION` bumps, noted in
   the splitstep webhook. It can reuse `authorizeCronRequest` unchanged.

## T16 · Integrate attachment cleanup with match and account deletion — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/services/match-video/purge.ts` adds a fourth lane to
`purgeMatchStorage`, each lane in its own try/catch inside one `Promise.all`. The lane is
authorized before it is privileged: it re-reads `matches` through the _caller's_ client and keeps
only ids that client can already see, so it narrows and never widens, before the service-role
client is touched. It deletes no blob itself — it snapshots the rows and schedules T14's
`requestBestEffortCleanup` through `after()`, so nothing runs inside the deletion transaction.

"Eventually collect" is the mechanism, and it composes from pieces already built: the delete
commits, the FK nulls `match_id`, and T13 treats an orphan row as collectible in _any_ state.
Late activity cannot slip past, because every T3/T4 RPC looks a row up by `id AND match_id`
behind the shared guard — so renew, finalize and activate all answer `match_not_found` the moment
the delete lands. A browser holding a valid SAS may keep writing its staged blob; T13 holds that
row until the SAS plus five minutes, then sweeps it. A copy in flight is left alone while its
finalization lease is live, then aborted before the final delete, and one settling afterwards
recreates nothing.

Isolation is the load-bearing word and is proven by injection: three parametrised tests fail the
attachment lane three different ways — `listAttachments` throws, `schedule` throws, the caller's
read errors — and each asserts `processing_jobs` and `match_files` were still read and that
`storage.remove` still ran against both buckets. Recorded honestly: the Azure video lane has no
injectable seam, so its half of that proof is by construction rather than by test.

Retention policy is untouched — `actions.ts` is not in the diff at all. A unit test pins the
`created_by` plus `program_id is null` filter and the `purgeMatchStorage` call, and the live-DB
retention spec now seeds active attachment rows and proves a ghost uploader's row on a team match
survives `deleteUser` with only `uploaded_by` nulled, keys and state intact. That spec ran for
real against the live database — 10 passed, not skipped — and the reviewer confirmed it is not
silently skipping.

T14's worker is reused unmodified (`cleanup.ts` has zero diff). T14's fakes were lifted into
`tests/fixtures/match-video-cleanup-fakes.ts` so both specs share one model of T13's semantics;
T14's 44 cases pass unchanged. 67 tests pass across the four specs checked.

**follow-ups:**

1. `after()` falls back to running the sweep inline when called outside a request scope, as in a
   script. A script that wants the post-delete run must invoke the worker itself.
2. The Azure video lane in `purgeMatchStorage` has no injectable seam, so the isolation proof
   covers two of the three sibling lanes by test. A `deleteVideoBlob` seam would close that.
3. The retire-on-claim fence leaves an orphan under a live SAS in `pending` — though unreachable —
   for up to the SAS plus five minutes. Nothing needs it today; a service-role `retire_by_match`
   RPC would close the window if a UI ever wants to show "deleted" immediately.

## T17 · Build the wizard-style attachment file step — done

**gate:** mechanical GATE FAIL then GATE PASS on re-run · completion VERDICT: pass

The first gate run failed T13's own `at most 50 rows per claim` case, which T17 touches in no way.
Its final assertion requires one of two _concurrent_ claims to come back with a full 50, which only
holds when that spec's 55 rows are the only eligible ones in the table — under the full parallel
suite another spec's rows can take the capacity. It passed 42/42 in isolation and the full gate
passed on re-run. Flaky assertion inherited from T13, not a T17 regression; see follow-up 1.

**changed:** New `src/components/dashboard/matches/match-video-attachment/` holds
`use-attachment-file.ts` (selection state machine, local verification, content-type substitution)
and `AttachmentFileStep.tsx`, plus a browser spec and its harness. `trace-route` resolved the real
wizard file step through `page.tsx` → `UploadMatchFlow` → `UploadWizardSteps` →
`new-match-wizard/FileStepContent.tsx` — the `processing` branch of `STEP_ORDER_BY_KIND` — and the
new step reuses that file's actual primitives rather than imitating them: `noteStripCls` and
`noteIconCls` from its `styles.ts`, `formatFileSize` and `formatTimecode` from its `utils.ts`, and
its 280px dashed drop-zone geometry, 40px-lead file row, Replace/Remove pair and mono-facts
subline.

Verification is two-stage: T5's bounded `inspectLocalVideoFile` (extension gate, size gate, then a
`File.slice` parse) and then a real decode check — `loadedmetadata`, dimensions, a verification
seek, and `readyState >= HAVE_CURRENT_DATA`. AVI, audio-only, empty, oversized and undecodable
files each refuse with a T1 error code; no codes were invented. Vendor resolution and FPS gates are
absent by construction: nothing imports `src/lib/video/probe.ts`, nothing reads either value, and a
test asserts the copy never states such a requirement.

Stale probes are handled with a generation counter and a per-selection `AbortController`, and
`onSelectionChange(null)` fires _synchronously before any async work_, so a confirmed alignment is
void the instant a new file is in play. Object URLs are revoked on every exit path and again in the
poster's effect cleanup. Two tests prove it from both sides — an abandoned _success_ and an
abandoned _refusal_, neither of which reaches the screen even after a 500ms grace window.

No upload happens on selection, and the proof is real: the spec attaches its request listener only
after the harness sets `data-hydrated`, so fixture bytes fetched during boot cannot mask a later
call, and the only recorded entries are `blob:` URLs from the `<video>` elements.

T8's follow-up is closed here. `contentTypeForFilename()` derives the type from the validated
extension through a table typed against both `MATCH_VIDEO_EXTENSIONS` and `MATCH_VIDEO_MIME_TYPES`,
so adding a container without a type is a compile error. A test asserts Chromium really does report
`""` for the `.mkv` fixture and that the selection still carries `video/x-matroska` — without this
the reservation would have come back 400 `content_type_format`. The widget-states checklist was run
and the gate marked; loading, empty and error states are all present with no bare `return null`.
14 new browser cases, 15 passing with the bundle-boundary spec.

**follow-ups:**

1. T13's `at most 50 rows per claim` assertion is contention-sensitive and will keep failing
   intermittently in full-suite runs. Scoping the claim to the spec's own marker, or asserting the
   two claims partition the rows without demanding a full 50, would settle it.
2. Two decode findings for T19/T20: Chromium does decode the `vp9.mkv` fixture, so `.mkv` is
   genuinely accepted rather than a paper entry; and the decode gate is codec-dependent, not
   extension-dependent — a Matroska carrying HEVC is what it actually catches. Safari's stricter
   decoder list may refuse files Chrome accepts, so a manual pass before launch is worth it.
3. `inspectLocalVideoFile` takes no `AbortSignal` (T5's API), so an abandoned container parse runs
   to its own 15-second deadline in the background and is discarded by generation. Correct, but a
   `signal` parameter on `inspectMedia` would stop an abandoned parse reading immediately — a real
   saving when someone reselects twice over a large file.
4. T19's transport should take `AttachmentSelection` whole: it already carries the exact filename,
   size and content type the reservation body wants, so re-deriving any of them would reopen the
   `content_type_format` bug from the other side.
5. `docs/ui-revamp-guardrails.md` §7 says to expect 43 pre-existing lint warnings; the tree is at 36. Minor doc drift.

## T18 · Build the first-point alignment step — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `AttachmentAlignmentStep.tsx` and `use-attachment-alignment.ts`, following T17's
idiom — presentation plus hook, wizard primitives from `new-match-wizard/styles.ts`, `advButton()`
for the actions, no bare `return null`, object URL created and revoked in one effect closure. The
player carries named Play/Pause, one-second skips and fine steps, plus a hand-built `role="slider"`
scrub rail with arrows at 1/30s, Shift at 1s, PageUp/Down at 10s and Home/End, its `aria-valuetext`
in the same clock as the field. The field is parsed only by T1's `parseConfirmedVideoTime` and
written only by `formatConfirmedVideoTime`; no second clock parser or formatter exists in the new
code. Local and saved sources both drive it.

Zero confirmation cannot be bypassed because there is only one writer: `setConfirmedTime` clears
the acknowledgement, and both typing and "Use current time" route through it. Confirmation is
scoped to the value, so editing away and back asks again — tested from both directions.

A rejected `play()` promise is kept distinct from a broken file, which matters because browsers
reject play for autoplay policy and interrupted loads: the rejection sets a quiet `role="status"`
notice ("Press play again"), while `mediaError` is set _only_ by the element's `onError` and
renders a `role="alert"`, clearing any stale play notice. The spec drives each separately and
asserts the other surface is absent.

The too-short error never rewrites the field — the hook only changes what renders beside it — so a
carefully scrubbed time survives. A test types `00:00:16.123`, takes the refusal, and asserts the
field still reads exactly that. Nothing is ever invented: missing source timing renders its own
amber notice that deliberately does not borrow the "not long enough" copy, and untimed interior
points and shots are counted and named without blocking. Repeated corrections do not drift —
6s → 9s → 6s yields an identical first and third offset, because `planAlignment` recomputes from
the anchor rather than adjusting a running value.

The widget-states checklist was run and the gate marked. 19 new browser cases; 34 pass with the
sibling file-step and bundle-boundary specs.

**follow-ups:**

1. `SourceTimingSummary` carries the final point's end but not its start, so "Preview the last
   point" approximates with a fixed six-second lead-in. Exposing `finalPointSourceSeconds` would
   let the preview start on the actual serve contact.
2. `FINE_STEP_SECONDS` is a fixed 1/30 because the saved-video path has no container parse behind
   it. T20 could pass the parsed frame rate for the local path so the control can honestly say
   "one frame" there.
3. The source-change reset — a new file swapped in while this step stays mounted — is implemented
   but not browser-tested, since the harness mounts a single source. T20's flow tests are the right
   home for it, because that is where a file change actually happens.
4. The preview seek clamps to the element's duration, which on the two-second fixture makes the
   assertion weaker than ideal. A longer fixture clip would let the spec assert the exact landing
   position rather than the published target.

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

# SwingVision video attachment — implementation plan

Implement the approved two-step add/replace wizard and one-step alignment editor.
Reuse the existing upload wizard's presentation, store immutable uploaded footage
in Azure, and apply a saved offset to playback without rewriting imported data.
This stage produces the plan only; no migration, application code, or deployment
is changed here.

## Decisions and verified integration points

- `mediabunny` is already pinned at `1.56.2`. Its Node entry point loads and exposes
  `Input`, `CustomSource`, MP4/QuickTime and Matroska/WebM readers. Use it for
  bounded local and server metadata inspection; no new media dependency,
  transcoding process, or full-file server buffer.
- **Format limitation for review:** the installed library has no AVI reader.
  Accept MP4, MOV, M4V, MKV, and WebM only when both metadata inspection and browser
  playback succeed. An AVI selected or dropped into the flow gets the approved
  MP4 guidance before upload. Do not claim support from an extension alone.
  This is the concrete implementation of the approved unsupported-file fallback.
- `purgeMatchStorage` is shared by match deletion and account deletion. Account
  deletion releases team matches first and purges only personal matches. Use this
  shared integration; keep retained team footage even if its uploader becomes null.
- The documented old `/api/cron/reclaim-videos` route is absent in this checkout.
  `vercel.json` has no cron configuration, and the connected database has no
  `cron.job` relation. Add an attachment-specific Vercel cleanup endpoint and daily
  schedule; do not depend on an unverified existing sweeper.
- Existing Azure helpers mint create/write-only upload SAS URLs (six-hour default)
  and read-only playback SAS URLs (30 minutes). Reuse those primitives with new
  attachment keys. Track the latest upload expiry in the database before issuing
  a credential; retired staging keys cannot be deleted until that expiry passes.

## Shared contracts

### Timing, ownership, and limits

- Attachment mutations require the authenticated match creator, `swing-vision`
  provenance, caller-visible match access, and the matching active workspace.
  A personal match requires personal scope; a team match requires that exact
  program and current membership. Playback requires match visibility only.
- First/last points are determined by `point_number` order. Missing anchor/final
  timing, nonfinite/negative source timestamps, or ambiguous point order refuse
  alignment. Null interior timestamps remain untimed; no data repair is included.
- Store `offsetSeconds = firstSourceTime - confirmedVideoTime`. Validate all
  known point starts/ends and shot times against `[0, verifiedVideoDuration]`,
  with 0.1-second tolerance. Require a positive final-point duration. Missing
  interior duration is not invented; known timestamps still participate.
- Store the confirmed position to millisecond precision, preserve source numeric
  precision in offset arithmetic, and never compound prior offsets. Use the
  existing Film conversion for every video-clock consumer. Playback padding is
  clamped to the file boundaries and never used as coverage evidence.
- Limit files to `7,999,999,999` bytes, nonempty and browser-playable. No analysis
  resolution, frame-rate, minimum-duration, billing, or vendor submission rules.

### Persistence and lifecycle

Create `match_video_attachments` with UUID identity, nullable `match_id` and
`uploaded_by` foreign keys using `ON DELETE SET NULL`, state
`pending|active|retired`, version, filename, declared size, verified size/type/
duration, selected first-point time, computed offset, staged/final blob keys,
source ETag, copy ID, client request UUID, expected active identity/version,
latest upload-SAS expiry, finalization lease, attempt/update timestamps, and
cleanup lease/retry metadata. Keys are generated server-side from the attachment
ID and never reused. Do not store bearer URLs.

Use partial uniqueness for one active row per non-null match and one pending row
per non-null match/uploader, plus uniqueness for the uploader/client request UUID.
RLS is enabled with no direct browser table access or
writes. Typed server readers enforce caller authorization before using the admin
client. Mutation RPCs are service-role-only, with PUBLIC/anon/authenticated execute
revoked, an empty pinned search path, explicit authenticated actor/workspace
arguments supplied only by the server, and authorization rechecked in SQL.

Reserve/activate/correct/cancel operations lock the parent match before the
attachment rows. Activation retires the previous active row and activates the new
one in one transaction; alignment increments the current version. The expected
active identity/version is required, including explicit null for a first add.
Never reactivate a retired row. Match/account deletion must not erase cleanup
keys, and a null uploader alone must never make an active team asset collectible.

Pending uploads remain pending while storage publication is in progress; copy
metadata records that substate. Completion retries poll the existing copy rather
than start another. A repeated successful completion for the same attachment and
confirmed time returns success only while it is still the active attachment;
after another replacement it returns a conflict.

### HTTP and client boundaries

All routes below are under `/api/matches/[matchId]/video`, use Node runtime,
cookie-authenticated server checks, private/no-store responses, bounded request
bodies, and same-origin validation for mutations. Reject client-supplied storage
keys/URLs, user IDs, workspace IDs, offsets, and authoritative durations.

| Method/path | Request | Response/behavior |
| --- | --- | --- |
| `POST /uploads` | filename, byte size, content type, client request UUID, expected active `{id,version}` or null | Reserve/reuse the same pending attempt; return attachment ID, staged upload URL, expiry. Different pending work returns a conflict until cancelled. |
| `POST /uploads/[attachmentId]/renew` | No metadata changes | Renew only an authorized pending attempt before finalization; persist its new expiry before returning the SAS. |
| `POST /uploads/[attachmentId]/complete` | Confirmed first-point seconds and expected active identity/version | Verify and publish, returning `202` plus a two-second retry interval while copy is pending, or `200` with committed attachment/version. Reuse the same request when polling/retrying. |
| `DELETE /uploads/[attachmentId]` | No body | Retire this caller's pending attempt idempotently; refuse active assets. Stop renewal and schedule eventual cleanup. |
| `PATCH /alignment` | Attachment ID, expected version, confirmed first-point seconds | Revalidate source timing and verified duration, update atomically, return new version. |
| `GET /` | No body | Caller-visible active attachment playback metadata, including ID/version, duration, offset, URL/expiry; no upload credentials. Used for playback refresh. |

Use stable error codes alongside user-facing messages: `401` unauthenticated;
`404` inaccessible/absent match; `403` visible but forbidden mutation/workspace;
`409` stale attachment, pending attempt, or mode conflict; `413` size violation;
`422` unsupported media, invalid alignment, missing source timing, or insufficient
coverage; `503` storage/configuration failure. A media-probe budget refusal is
distinct from a transient storage/network failure. Only coverage errors use
**This video is not long enough.**

`/dashboard/matches/new?videoFor=<id>&mode=add|replace|align` selects the attachment
flow before creation logic. Reject conflicting `draft/source/player/match`
parameters and invalid modes/IDs. Add requires no active attachment; replace/
align require one. Existing `?match=` creation/analysis behavior stays separate.
Use the match report's existing Film selection mechanism when returning; verify
that mechanism in the entry-integration step rather than invent a URL parameter.

## Ordered implementation steps

Each step is one bounded work unit for a fresh implementation context. Run in
order unless its listed dependencies permit independent work. Paths under a new
directory below are proposed files, not claims that they already exist. Every UI
step must follow the design skill and route trace; every Next.js edit must first
read the relevant installed Next.js guide.

### 1. Pure alignment and attachment contracts

- **Files:** new `src/lib/match-video/{types,limits,alignment}.ts`;
  `tests/match-video-alignment.spec.ts`.
- **Change:** Define request/result unions, modes, error codes, byte cap, strict
  timestamp parsing, source timing summary, and coverage calculation. Input is
  ordered source points plus shot times; output includes anchor, required bounds,
  untimed count, offset, and validation result. Do not import Azure or Supabase.
- **Verification:** Both trim directions, explicit zero, fractional seconds,
  repeated corrections, malformed inputs, NaN/infinity, out-of-range shots,
  missing first/final timing, interior nulls, and coverage at the tolerance edge.
- **Depends on:** none.

### 2. Attachment table and reservation lifecycle

- **Files:** new timestamped migration; new
  `tests/match-video-attachments-db.spec.ts`.
- **Change:** Add the table, constraints/indexes/FKs/RLS/grants described above;
  service-only reserve, renewal, and cancellation RPCs. Reserve records expected
  active version, client request ID, and server-generated keys before credentials
  are issued. Same-request retries are idempotent; different metadata under the
  same request ID is a conflict. Retired rows cannot renew or return to pending.
- **Verification:** Migration on a disposable/test database; direct table/RPC
  access denied to anon/authenticated; creator/workspace/provenance checks;
  reserve races; FK nulling retains keys; account deletion does not pin users.
- **Depends on:** 1.

### 3. Atomic activation and alignment transactions

- **Files:** separate new timestamped migration; extend the database spec.
- **Change:** Add activation and alignment RPCs with parent-row locking, expected
  version checks, and source-timing recomputation inside the transaction. Require
  server-verified metadata for activation. Preserve exactly one active asset and
  retire the previous one atomically. Define a shared SQL timing helper for the
  two operations; verify it against the pure TypeScript contract using fixtures.
- **Verification:** Concurrent replace/align/cancel, match deleted during commit,
  stale versions, repeated completion, invalid coverage, and SQL/TypeScript timing
  parity. Original match, point, shot, and stats data remain byte-for-byte equal.
- **Depends on:** 1–2.

### 4. Bounded media inspection

- **Files:** new `src/lib/match-video/media-inspection.ts`,
  `src/lib/services/match-video/probe.ts`, and
  `tests/match-video-probe.spec.ts` with small media fixtures.
- **Change:** Use explicit Mediabunny MP4/QTFF/Matroska/WebM readers, excluding
  HLS and external-resource formats. Require a video track and derive the primary
  video's end timestamp via `computeDuration` rather than trusting a client value
  or audio duration. Use `CustomSource` callbacks with 32 MiB total read budget,
  2 MiB maximum range chunk, 128 range requests, 8 MiB cache, and a 15-second
  deadline; abort and dispose on all paths. Azure reads are fixed to the known
  blob and ETag. Local preflight uses the same bounded reader over `File.slice`.
  A separate browser decode/seek check confirms actual playability. No whole-file
  `arrayBuffer`, download, decode, or Node native codec dependency.
- **Verification:** Node import (already checked), real MP4/MOV/WebM/MKV samples,
  tail metadata, corrupt/indexless files, AVI refusal, audio-only files, nonfinite
  duration, ETag changes, and all resource limits. Compare the parsed media clock
  to HTML-video seek/duration on accepted fixtures; reject unsupported timing
  layouts instead of silently applying another offset. Large virtual files must
  prove bounded reads/memory without downloading gigabytes. Exceeding a structural
  inspection limit gets MP4 export guidance; a network timeout remains retryable.
- **Depends on:** 1.

### 5. Azure upload and immutable publication adapter

- **Files:** new `src/lib/services/match-video/storage.ts`;
  `tests/match-video-storage.spec.ts`.
- **Change:** Wrap existing Azure helpers for unique staged/final keys, six-hour
  scoped upload SAS, read-only playback, metadata reads, and idempotent deletion.
  Publish with an asynchronous Azure server-side copy conditioned on the staged
  ETag; persist copy identity before polling and inspect destination status on
  retries. Use a short server-only source-read SAS. No browser write credential
  may name the final object. Verify/probe the copied final bytes before activation.
  Existing destination/copy mismatch is a conflict, never an overwrite.
- **Verification:** Copy pending/success/failure, lost responses, concurrent calls,
  source modified during copy, final-key isolation, and final length/type checks.
  Ensure no request waits for an entire multi-GB copy; pending work is retryable.
- **Depends on:** 2, 4.

### 6. Preparation, renewal, and cancellation endpoints

- **Files:** new `src/lib/services/match-video/access.ts` and `uploads.ts`; thin
  upload preparation/renewal/cancellation routes listed in the HTTP table;
  `tests/match-video-upload-handlers.spec.ts`.
- **Change:** Centralize cookie-user, RLS visibility, creator, provider, and active
  workspace checks. Validate requests and call reservation lifecycle RPCs; persist
  expiry before minting upload credentials. Inject storage/database dependencies
  into handlers so denied requests provably perform no privileged side effect.
- **Verification:** Creator/noncreator/team/foreign-workspace matrices, forged
  IDs, same-request retries, simultaneous attempts, rejected renewals after
  finalization, malformed/oversized requests, and cancellation idempotency.
- **Depends on:** 1–2, 5.

### 7. Completion endpoint

- **Files:** new `src/lib/services/match-video/complete.ts`; completion route;
  `tests/match-video-completion.spec.ts`.
- **Change:** Freeze finalization inputs and prevent further upload renewals;
  inspect actual staged size/ETag, start or resume immutable publication, verify
  final media, load source timing, and activate transactionally. Return `202`
  during copy and use a per-attempt lease/CAS to prevent duplicate finalization.
  Release failed leases for retry; retired attempts cannot commit. Retain all
  keys on exceptions and leave the previous attachment active.
- **Verification:** Client metadata forgery, overwritten staging bytes, lease
  expiry, lost success response, repeated polling, cancellation race, changed
  match permissions, too-short footage, and failure at every storage/DB boundary.
- **Depends on:** 3–6.

### 8. Alignment update and playback metadata endpoints

- **Files:** new `src/lib/services/match-video/{alignment,playback}.ts`; alignment
  and root video routes; `tests/match-video-access-handlers.spec.ts`.
- **Change:** Implement correction using saved verified duration and fresh source
  timing; read active playback metadata using match visibility. No permission to
  write follows from permission to watch. Return signed URLs only for active final
  keys, with ID/version/offset/duration so clients detect replacement on refresh.
- **Verification:** Correction with no upload, no-op correction, noncreator read
  versus write, expired auth, inaccessible match, stale version, and missing blob.
- **Depends on:** 3, 5–6.

### 9. Durable cleanup worker and schedule

- **Files:** new cleanup-claim RPC migration;
  `src/lib/services/match-video/cleanup.ts`;
  `src/app/api/cron/cleanup-match-videos/route.ts`; `vercel.json`, `.env.example`;
  `tests/match-video-cleanup.spec.ts`.
- **Change:** Add a `CRON_SECRET`-protected daily Vercel schedule at 05:00 UTC.
  Claim up to 50 eligible rows with a database lease and recheck state/version
  before storage deletion. Collect retired/orphaned assets and pending attempts
  idle for 24 hours; retire pending work atomically before collection. Active
  attached final keys are never eligible. Active rows may shed only their staged
  key after its last write SAS expires plus five minutes. Preserve rows/keys on
  failure, use bounded concurrency, and retry with recorded failure counts.
  Retire/cancel leases fence all later activation/renewal. Cleanup must also
  cancel or await any in-progress copy so it cannot recreate a deleted final blob.
- **Verification:** No live writer/active final asset deletion; abandoned uploads,
  expired credentials, duplicate sweeps, competing finalization, partial deletion,
  storage outages, copy races, null uploader with retained match, and protected
  cron access. Daily cadence means abandoned work is normally collected 24–48
  hours after its last activity; replacement cleanup also gets a best-effort
  immediate attempt through this same worker.
- **Depends on:** 2–3, 5, 7.

### 10. Match/account deletion integration

- **Files:** `src/lib/services/matches/purge-match-storage.ts`; new
  `src/lib/services/match-video/purge.ts`; deletion integration tests plus
  `tests/account-deletion-retention.spec.ts`.
- **Change:** Add an isolated attachment cleanup branch to the shared purge path.
  Authenticate/authorize the supplied match IDs before privileged attachment
  access, including when called from the user-client match-delete route. Fence
  pending work, attempt deletion, and retain metadata for retries. Foreign-key
  nulling handles match deletion races and final orphan discovery. Do not broaden
  account deletion's personal-match filter or delete retained team assets.
- **Verification:** Match delete, personal-account delete, team retention and
  nullable uploader, deletion failure and retry, and a late upload/copy callback
  after the match is gone. Existing provider-file/job cleanup still runs if the
  attachment branch fails.
- **Depends on:** 9.

### 11. Wizard file step

- **Files:** new
  `src/components/dashboard/matches/match-video-attachment/AttachmentFileStep.tsx`
  and `use-attachment-file.ts`; focused browser/component tests.
- **Change:** Match the existing file-step drop-zone and selected-file treatment
  using presentation primitives only. Run local bounded inspection plus decoded
  frame/seek checks, show file facts, and refuse unsupported/oversized files before
  upload. Manage object URL lifetime and selection-generation cancellation.
- **Verification:** Choose/drop/remove/reselect, invalid codec/AVI, empty/oversized
  file, stale probe result after file change, readable errors, and no upload
  request on selection. No vendor resolution/FPS gates.
- **Depends on:** 1, 4.

### 12. Wizard alignment step

- **Files:** new `AttachmentAlignmentStep.tsx` in the same UI directory; its tests.
- **Change:** Video preview with accessible playback, scrubbing, fine seeking,
  explicit Use current time, strict millisecond time input, first-point context,
  coverage validation, and preview-last-point action. Accept a local or saved
  video source. Editing a confirmed time revalidates; zero requires explicit input.
  Correction preloads saved time and enables save only for a material change.
- **Verification:** Both offset directions, typed/selected zero, keyboard seeking,
  valid/invalid final coverage, no-op correction, boundary padding, missing timing,
  untimed interior notice, and browser play rejections distinct from media errors.
- **Depends on:** 1, 11.

### 13. Wizard orchestration and upload transport

- **Files:** new `MatchVideoAttachmentFlow.tsx`, `use-attachment-flow.ts`, and
  browser-only chunk transfer helper in the attachment subtree; flow tests.
- **Change:** Compose the existing `WizardShell` with the two new steps; align
  mode uses one step. Mirror new-match spacing, step bar, pinned match identity,
  and sticky footer. Upload only on final confirmation, with 8 MiB blocks and
  four concurrent requests, real throttled progress, bounded transient retries,
  SAS renewal, cancellation, and resumable completion polling. Keep credentials
  in memory. Lock edits while saving; preserve the file/time on retry. Abort
  transport and invalidate generations on unmount; durable cleanup covers failed
  cancellation delivery. No match creation, draft, trim, or analysis hook calls.
- **Verification:** Add/replace/align state transitions, file change reset,
  back/cancel, URL renewal, upload and commit failures, response loss, double
  submit, and refresh requiring file re-selection. Verify keyboard/focus and
  390px/desktop layouts without changing other wizard consumers.
- **Depends on:** 6–8, 11–12.

### 14. Wizard routing and Film entry actions

- **Files:** `src/app/dashboard/matches/new/page.tsx`; new
  `src/lib/data/match-video-attachment-server.ts`; match-detail page and
  `film/film-tab.tsx` / `film-empty-state.tsx`; route/permission tests.
- **Change:** Add the distinct `videoFor` branch, server target loading, dynamic
  title and invalid-target handling. Pass a minimal server-derived management
  capability to Film and wire Add/Replace/Adjust actions. Avoid making the
  no-video state a mandatory signal for manageability: unavailable storage should
  show a retryable error, not invite an accidental duplicate attachment. Use the
  existing report view-selection contract for successful return to Film.
- **Verification:** Personal/team creator access, read-only viewers, wrong
  workspace, conflicts with creation parameters, stale mode, and source mismatch.
  Regression-check existing `?match=`, draft, source, player, and team uploads.
- **Depends on:** 8, 13.

### 15. Playback loader and shared timeline integration

- **Files:** `src/lib/data/match-video-server.ts`; Film timeline/tab/types;
  `tests/film-timeline.spec.ts`, `tests/match-video-choice.spec.ts`.
- **Change:** Resolve active SwingVision attachment first; keep existing provider
  job playback selection unchanged. Extend `MatchVideo` for attachment metadata
  and verified duration. Apply signed offset once through the common conversion;
  clamp padded windows to duration, keep untimed rows non-seekable, and expose
  aligned timestamps wherever a video-clock time is displayed. Audit embedded
  and fullscreen consumers during this step; split any unrelated large surface
  into its own queue task rather than expand this work unit.
- **Verification:** Anchored points and shots, repeated correction, loops,
  next/previous, active row, filtered/saved stops, playback bounds, and zero/legacy
  offsets for Advantage Intelligence. Assert no writes to source timing rows.
- **Depends on:** 1, 8, 14.

### 16. Playback credential refresh

- **Files:** new attachment playback-refresh hook; targeted `film-player.tsx`
  and `film-fullscreen.tsx` integration; browser tests.
- **Change:** Refresh attachment SAS before expiry and once on an expiry-related
  load failure, preserving pause/playhead and avoiding refresh loops. When the
  returned attachment/version differs, rebuild stops and reset to a valid aligned
  point instead of preserving a raw time from different footage. Missing access
  or deleted attachment has an actionable terminal state. Do not treat a rejected
  `play()` promise as evidence of expired credentials.
- **Verification:** Paused/playing expiry in both players, correction in another
  tab, replacement, deletion, denied refresh, and unmount cleanup. Existing
  non-attachment playback keeps its current behavior.
- **Depends on:** 8, 15.

### 17. End-to-end acceptance and rollout preparation

- **Files:** new `tests/match-video-attachment-flow.spec.ts`, small owned media
  fixtures, and attachment operations notes under `docs/`.
- **Change:** Exercise the complete flow using recordings with known different
  lead-ins and a too-short recording. Document the new migration order, cron
  secret/schedule, Azure CORS origins, cleanup logs, size/format behavior, and
  creator-only management. Prepare the normal review/PR pipeline without pushing,
  applying production migrations, or merging at this stage.
- **Verification:** Pass the acceptance matrix below; a controlled Azure smoke
  test must prove direct upload, source-conditional publication, authenticated
  playback, replacement, and object cleanup. Small fixtures suffice for deployed
  storage; test near-limit sizing with virtual sources. Record actual test
  environment and remaining deployment gates, not only local success.
- **Depends on:** 1–16.

## Also consulted

Beyond the approved brief/design and empty references directory, read only to
verify the plan's unresolved integration facts:

- `package.json` — pinned Mediabunny and repository test commands.
- `src/lib/video/probe.ts` — existing browser metadata/FPS probe; it does not by
  itself establish every attachment's decoded playback or server duration.
- `node_modules/mediabunny/dist/mediabunny.d.ts` and a read-only Node import —
  bounded source API, duration semantics, and actual installed readers.
- `src/app/api/matches/[matchId]/route.ts` — authenticated deletion/purge order.
- `src/lib/services/matches/purge-match-storage.ts` — shared storage cleanup.
- `src/components/dashboard/settings/actions.ts`, account deletion section —
  retained team matches and personal-match purge order.
- `src/lib/services/splitstep/video-url/azure-sas.ts`, signing/deletion exports —
  existing SAS scope/TTL and storage client seam.
- `vercel.json` — absence of an existing cron schedule; the old reclaim route
  named by the guardrails is also absent from this checkout.
- `tests/account-deletion-retention.spec.ts`, test-name search — existing
  retention regression coverage to extend.
- Read-only Supabase MCP inspection of `release_my_account_from_programs` and
  attempted `cron.job` lookup — live retention behavior and no pg_cron table.

## Test strategy

Use Playwright's existing test runner for pure helpers, injected service handlers,
and browser flows; use controlled database fixtures for actual privileges,
constraints, transactions, and deletion races. Do not substitute mocks for the
database's one-active or creator-only guarantees. Isolate storage fixture prefixes
and clean them with the same lifecycle code; do not mutate existing athlete data.

Acceptance must demonstrate:

1. Both earlier and later first-point anchors align all timed playback consistently,
   including embedded/fullscreen, saved/filtered points, and repeated corrections.
2. Two-step Add/Replace and one-step Adjust look and behave like the existing
   upload wizard, on desktop and narrow screens, using keyboard as well as pointer.
3. Unsupported/oversized/too-short/incomplete-timing inputs fail with the specified
   message and preserve prior footage; replacement/correction succeeds on reload.
4. Playback-only viewers cannot prepare, mutate, cancel, or publish attachments;
   creator access is checked again after workspace/membership changes.
5. Lost responses, copy/upload failures, abandoned attempts, races, match deletion,
   and account deletion leave no untracked blobs and never collect active retained
   team footage. Cron deployment and its secret are part of release readiness.
6. SwingVision statistics/source timestamps and existing match creation/vendor
   analysis behavior remain unchanged; no attachment spends analysis quota.

Run targeted tests as each step lands, then typecheck, lint, format checks, and the
relevant upload/Film/account-deletion regression suites once integrated. No new
page route is introduced; regenerate `MAP.md` only if the implementation adds one.
Deploy schema before dependent code; verify the scheduled cleanup endpoint and
Azure CORS in the deployment environment before enabling attachment entry actions.

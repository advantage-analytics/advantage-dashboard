# Match video attachments — operations

**Status:** current as of 2026-09-19, at the end of T1–T27 on
`claude/llm-routing-task-updates-783ab0`. The provider is **"Advantage
Intelligence"** in every user-visible string; SwingVision is the import source
this feature attaches video to, and `splitstep` is internal naming only —
neither belongs in this doc's copy strings.

This is a separate feature from the Advantage Intelligence video pipeline
described in `docs/video-pipeline-overview.md`: that pipeline sends video to a
third-party vendor for analysis; this one lets the creator of a SwingVision
import attach a video they already have, purely for playback alongside the
imported points and shots. They share the same Azure storage account and nothing
else — no vendor call, no webhook, no derivation. Written for whoever runs or
supports this feature next, not as a design record; see the run log
(`.claude/tasks/claude-llm-routing-task-updates-783ab0.log.md`) for how each
piece was built and verified.

---

## 1. What it does

A SwingVision `.xlsx` import carries points and shots timed against a phone's
recording clock, but no video — the spreadsheet has no video track. This feature
lets the match's creator attach one: pick a file, confirm one point in it
against a moment the app already knows (the first point's start), and the app
stores a single offset that lets every shot in Film seek to the right frame.
Three modes, opened at `/dashboard/matches/new?videoFor=<matchId>&mode=<mode>`:

- **add** — no active attachment yet; file step, then alignment step
- **replace** — swap the active video for a different file; same two steps
- **align** — keep the file, correct only the offset; one step, no re-upload

### Creator-only management

Only the match's creator, in its exact active workspace (the personal workspace
whose id matches the actor, or the team workspace for the match's own
`program_id`), can add, replace, cancel, or align an attachment. Every
mutating endpoint enforces this through one shared ladder
(`authorizeMatchVideoMutation` in `src/lib/services/match-video/access.ts`):
signed in → valid id → an RLS-scoped read through the caller's own client, so
the database decides visibility → creator → `source_provider = 'swing-vision'`
→ exact workspace. A teammate who is not the creator gets no upload affordance
at all on Film — not a disabled one — because the entry-point resolver
(`src/lib/data/match-film-entry-server.ts`) only ever returns actions for the
creator.

Playback is looser on purpose: anyone who can already see the match (the
read-side `authorizeMatchVisibility` gate) can watch its attached video, since
watching changes nothing.

### Playable format validation

Accepted containers: **MP4, MOV, M4V, MKV, WebM** (`MATCH_VIDEO_EXTENSIONS` /
`MATCH_VIDEO_MIME_TYPES` in `src/lib/match-video/limits.ts`). An extension in
that list is only a precondition — the file still has to decode and report a
finite duration through two independent checks before it is accepted:

1. A bounded server-side parse (Mediabunny's MP4/QTFF/Matroska/WebM readers
   only, via `src/lib/match-video/media-inspection.ts`), run once locally in
   the browser before upload and again against the staged and final blobs on
   the server so nothing bypasses validation by hitting the API directly.
2. A real browser decode check in the wizard (`loadedmetadata`, a verification
   seek, `readyState >= HAVE_CURRENT_DATA`) — a container can parse on every
   platform and still fail to decode (a Matroska carrying an unsupported codec
   is the case this exists for).

**AVI** is refused outright, at the extension gate, before any bytes move: the
pinned Mediabunny build ships no AVI reader, so the server could not verify
one even if the browser could play it. **An MP4 that fails the decode check**
(an unsupported codec inside an otherwise-valid container) gets the same
message as AVI. Both point at the same fix — the wizard's copy is: _"This
video cannot be played. Export it as an MP4 with H.264 video and try again."_
There is no vendor eligibility check here (no resolution or frame-rate floor)
— attachments never reach the analysis vendor, so nothing couples them to its
rules.

### Size limit

**Under 8 GB** (`MATCH_VIDEO_MAX_BYTES = 7_999_999_999` bytes,
`src/lib/match-video/limits.ts`), checked before an upload credential is
minted and again against the measured blob after transfer — a client-declared
size is never trusted. An empty file is refused as `empty_file`, distinct from
`file_too_large`, since a zero-byte upload usually means the transfer never
started rather than that the file is too small.

### First-point alignment behavior

The alignment step asks the uploader to scrub the video to the moment the
**first point** starts and confirm it, then computes one offset — anchor
source time minus confirmed video time — and validates that the file's
measured duration covers every known point/shot timestamp within a 0.1-second
tolerance (`COVERAGE_TOLERANCE_SECONDS`). That single offset, not a per-point
mapping, is what every later seek in Film uses. Confirmation cannot be
bypassed: there is exactly one writer for the confirmed time, and any edit to
the field clears the acknowledgement, so a changed-then-reverted value asks
again.

Re-running alignment (mode `align`) never re-uploads a file — the module has
no storage import at all, proven structurally as well as by test — and never
accumulates drift: each correction recomputes the offset from the anchor
against the file's saved verified duration, so a sequence of corrections that
returns to an original value returns to the original offset exactly, not a
close approximation. A negative offset (video starts rolling before the first
point) is a legitimate result and is passed through to Film unclamped — do not
add a `Math.max(0, …)` guard to "fix" a negative-looking number there.

---

## 2. Rollout order

**Migrations before code, in this exact order, because each one's guarantees
depend on the last:**

1. `20260919045208_create_match_video_attachments.sql` — the table, its
   lifecycle trigger, and service-role-only RLS.
2. `20260919050413_match_video_attachment_reservations.sql` — reserve/renew/
   cancel RPCs.
3. `20260919052002_match_video_attachment_activation.sql` — begin/release
   finalization and activate/correct-alignment RPCs.
4. `20260919080217_match_video_attachment_cleanup.sql` — claim/confirm/fail
   cleanup RPCs.

All four are already applied to the live database (verified live during T2,
T3, T4 and T13 — privileges, `security definer`/empty `search_path` pinning,
constraints, indexes and triggers were each checked against `pg_class`,
`pg_policies`, `pg_constraint`, `pg_indexes` and `pg_trigger` after applying).
The application code (routes, wizard, Film wiring) that depends on them is
also already on this branch. What has **not** happened is the deployment
steps below — none of them are schema or code changes, and none of them have
been performed as part of this work.

---

## 3. CRON_SECRET and the daily cleanup schedule

`GET /api/cron/cleanup-match-videos` runs daily at **05:00 UTC**
(`vercel.json`'s `crons` entry) and deletes the storage objects behind
attachment rows the database has already finished with: abandoned upload
attempts (idle past their SAS expiry plus five minutes), orphaned rows (a
deleted match nulls `match_id` via `ON DELETE SET NULL`), and video that was
replaced. It claims up to 50 collectible rows per run under a lease, so a
30–50 row abandoned attempt is normally collected 24–48 hours after its last
activity, paired with the daily schedule.

The route is gated by `CRON_SECRET`, checked as
`Authorization: Bearer <secret>` against the header Vercel Cron sends. Both
sides are SHA-256 digested before a `timingSafeEqual` comparison (raw
`timingSafeEqual` throws on a length mismatch, which is itself a length
oracle). An unset, blank, or whitespace secret **fails closed** — every call
is refused before the request body is even read, including Vercel's own —
and the refusal is logged by variable name only, never by value.

**`CRON_SECRET` is not currently set in Vercel, for either Production or
Preview.** Until it is, every scheduled call is refused and logged, and
attachment storage grows without bound — nothing is collected. Generate a
value with `openssl rand -hex 32` and set it per environment in Vercel; see
`.env.example` for the full comment block. This is an open deployment step,
not a code gap.

---

## 4. Azure CORS origins to verify

The upload transport writes directly from the browser to Azure Blob Storage
(the same account and container the Advantage Intelligence pipeline already
uses — `AZURE_STORAGE_CONTAINER`, keys under a `match-video/` prefix rather
than a new container), so the account's **blob service** CORS rule has to
allow this feature's origins before any browser upload works. This is the
same rule `docs/video-pipeline-overview.md` §4 already documents for the
splitstep upload path, and it is shared infrastructure — there is no separate
CORS rule for attachments:

- **Allowed methods:** `PUT, GET, HEAD, OPTIONS`
- **Allowed headers:** `x-ms-blob-type, x-ms-blob-content-type, x-ms-version, content-type`
- **Allowed origins:** every origin this feature is reachable from — the
  production app origin and every Preview deployment origin exercised before
  launch.

A missing or incomplete rule looks exactly like a network outage: the browser
blocks the cross-origin request and reports an indistinguishable error with no
CORS wording anywhere in it, so a failed upload with no clear cause is the
first thing to check here. `docs/video-pipeline-overview.md` §4 and its
troubleshooting section (near the end) cover the same failure mode for the
sibling pipeline; the fix is identical since it is the same account.

This has not been verified from a real browser against this feature's own
upload path — `tests/match-video-azure-smoke.spec.ts` proves the wire format
from Node, not a browser preflight (see the deployment gates below).

---

## 5. Cleanup: logs and retries

The cleanup worker (`src/lib/services/match-video/cleanup.ts`) is called two
ways: `runMatchVideoCleanup` from the daily cron, and
`requestBestEffortCleanup` fired best-effort after a replace, cancel, match
deletion, or account deletion — so a row that just became eligible does not
always wait for the next 05:00 UTC pass. Both run over the same claim from
§2's migration 4, draining it through a four-lane concurrent pool
(`CLEANUP_CONCURRENCY = 4`).

**Ordering around an in-flight copy is the part worth understanding before
debugging a stuck row.** The worker always aborts a pending Azure copy before
deleting a final blob, because a copy that finishes after a delete would
silently recreate an object nobody is tracking anymore. If a delete still
reports a pending copy — reachable when a lost response left a new copy id
unpersisted — the worker re-reads the destination, aborts the copy id
actually in flight, and deletes once more; a copy that survives both attempts
is failed with a retry rather than forced.

**Retry backoff:** a failed collection is counted, and the next attempt is
backed off starting at **ten minutes, doubling up to a 24-hour cap** — the
row's keys and state are kept (`match_video_fail_cleanup` never discards them)
so nothing is forgotten before its bytes are actually gone. A row only closes
(`cleaned_up_at` set) once every tracked object it owns is confirmed gone; a
partial deletion (one key collected, one still failing) keeps retrying only
the outstanding key. A 404 from a delete call counts as success, since an
already-absent object is the desired end state, not a failure.

An active attachment's final blob cannot be deleted by this path under any
claim state — the claim marks it `collect_final: false`, and the worker
separately refuses a final-key delete for any attachment not in the `retired`
state, so a malformed or stale claim cannot delete a video someone is
currently watching.

---

## 6. Retention of active team assets after uploader deletion

When a user who uploaded a video deletes their account, **the attachment
survives** — only `uploaded_by` is nulled (`ON DELETE SET NULL`). The
eligibility rule the cleanup RPCs use to decide what is collectible never
reads `uploaded_by` at all (asserted by a `DO` block inside the cleanup
migration itself, not just by convention), so a deleted uploader's video on a
team's match keeps playing for the rest of the team exactly as before. This
mirrors the existing account-deletion retention model for matches themselves
(`docs/superpowers/specs/2026-09-01-account-deletion-team-retention-design.md`):
a team keeps what it can already see; only the identity linking it to a
specific person is cleared.

An **orphaned** attachment — one whose _match_ was deleted, leaving
`match_id` null — is a different case and is fully collectible: the match
deletion path schedules a best-effort cleanup pass after the transaction
commits, and the row is eligible in any state once its match is gone.

---

## 7. Open deployment gates

None of these are code changes; all are steps someone with access to Vercel,
Azure, and this repo's live database needs to take before or shortly after
this ships to production. Do not read the tests passing locally as evidence
any of these are done — they are not.

1. **Azure CORS**, per §4 above — not verified from a real browser. The smoke
   test proves the wire format from Node, which does not send a preflight.
2. **`CRON_SECRET`**, per §3 above — not set in Vercel for any environment.
   `vercel.json`'s schedule is already committed and correct; only the
   secret is missing. Until it is set, the cleanup route refuses every call
   (fail-closed, by design) and storage grows unbounded.
3. **Vercel's own `AZURE_STORAGE_*` values** must name `advantagedashboardca`
   and carry that account's key. Local `.env.local` now does (see below), but
   the two are set separately — a deploy still reading the westus2 account
   would fail every upload with `AuthenticationFailed`.

### Closed since this document was first written

- **Azure account and smoke test.** `.env.local` now names
  `advantagedashboardca` (Canada East) with that account's key, and
  `tests/match-video-azure-smoke.spec.ts` runs to completion: **9/9 pass
  against the live account**, covering direct upload in the browser's block
  sequence, bounded range-read verification, ETag-conditioned publication, a
  changed staged object refused, a stranger's object left untouched,
  credential-scoped playback, replacement, and tracked-object collection. That
  closes this feature's Azure-integration criterion.

  Two things that cost time and are worth knowing. A disabled _subscription_
  makes every account under it answer `AccountIsDisabled`, however healthy the
  account itself is — and `az account list --refresh` reports `Enabled` while
  ARM still enforces read-only, so the CLI's state field is not evidence. The
  authoritative signal is whether a write succeeds: `az storage account keys
list` is a write and fails with `ReadOnlyDisabledSubscription` until the
  subscription is genuinely back. Separately, the account name and the account
  key are flipped independently; changing only the name yields
  `AuthenticationFailed`, not `AccountIsDisabled`.

- **The orphan sweeper.** `scripts/cleanup-orphan-storage.ts` attributed a blob
  to a match by the _third_ path segment, which under this feature's
  `match-video/<matchId>/<attachmentId>/…` layout is the attachment id — so
  `--apply` would have deleted every attachment blob as an orphan. Fixed on its
  own branch: each store now declares the layouts it writes and anything
  unexplained is reported, never deleted. `match-video/` is deliberately not a
  declared layout, because those blobs belong to the cleanup worker in §5, which
  has the leases and copy-abort ordering that sweeper cannot replicate.

Everything else is verified, not just claimed: the live database
(`pouxujkhtbvkdwbzfvka`) carries all four migrations with their RPCs, checked
privileges, and trigger; 42 attachment cases plus 10 retention cases pass
against it; the full repository test suite passes (1954 passed, 73 skipped —
pre-existing env-gated specs, with the 9 Azure smoke cases now running rather
than skipping — 0 failed); and near-limit behavior (multi-gigabyte files, the byte
cap) is verified through virtual sources rather than real multi-gigabyte
transfers.

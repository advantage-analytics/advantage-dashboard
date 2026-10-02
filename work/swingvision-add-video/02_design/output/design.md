# SwingVision video attachment and alignment

## Approaches considered

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Dedicated attachment state, existing wizard presentation, saved playback offset | Adds attachment persistence and cleanup, but makes replacement and correction independent of match analysis | Recommended |
| Route attachments through the existing video-analysis job flow | Reuses orchestration, but introduces vendor submission, analysis status, quota, and duplicate-point risks | Reject |
| Rewrite imported point and shot timestamps after every alignment | Makes database timestamps match a particular recording, but loses the source clock and complicates correction and rollback | Reject |

## Chosen design

### Architecture and verified current state

Use a dedicated attachment flow that reuses the new-match wizard's presentation.
Store the uploaded file and one alignment offset separately from imported data.
All playback timestamps reflect the attached recording; source timestamps and
event durations remain unchanged. Attaching a file does not run analysis or use
the monthly video-analysis allowance.

Live schema and policy checks succeeded on 2026-09-17 against the configured
project `pouxujkhtbvkdwbzfvka`, resolving the earlier OAuth blocker:

- `points` has `point_number`, nullable `video_time real`, and nullable
  `duration real`; `shots` has nullable `video_time real` and a `point_id`.
- No existing public video/attachment table was found. Playback currently reads
  Azure object keys from `processing_jobs`.
- Match read access includes the creator, players, and program members. Match
  update/delete policies are creator-only. Visibility therefore does not grant
  attachment mutation rights.
- Points and processing jobs cascade when a match is deleted; shots cascade with
  their point. Attachment cleanup must retain object keys until storage deletion
  succeeds instead of relying on a cascading metadata row.
- Some SwingVision imports lack timing: the read-only aggregate found 111 of
  2,391 points without a timestamp and 16 without a positive duration. Of 21
  matches with points, two lacked a first-point timestamp and two lacked a known
  final-point end. These are observed fixtures, not permanent product counts.

### Route and component boundaries

Verified match route: `matches/(detail)/[matchId]/page.tsx` loads `FilmTab`, and
the sibling layout supplies `MatchDataProvider`. Keep entry actions in Film:
**Add video** when absent; **Replace video** and **Adjust alignment** when an
attachment exists. Read-only viewers receive playback without mutation actions.

Verified wizard route: `/dashboard/matches/new` renders `UploadMatchFlow`, whose
`UploadWizardPage` composes `WizardShell` and the file/trim/match step bodies.
`WizardShell` is presentation-only and is directly reusable. The existing
`?match=` path explicitly excludes imports because it starts video analysis.
Preserve that path.

Add a distinct entry at
`/dashboard/matches/new?videoFor=<matchId>&mode=add|replace|align`, handled before
the current creation branches. Conflicting creation parameters are rejected.
The server resolves the match and permission before rendering a new
`MatchVideoAttachmentFlow`; it does not enter `useUploadMatchWizard` or create a
match draft. This keeps the full-page wizard outside the match-detail layout's
fixed-height report frame. No new page route is needed.

The new flow owns only file selection, preview, alignment, upload, and commit
state. Reuse `WizardShell`, its step indicator, `advButton`, and wizard notice
styling. Reuse/extract presentation-only file-picker pieces where suitable;
vendor eligibility, minimum resolution/frame rate, trim questions, provider
selection, player identity, and score entry are not attachment requirements.

### Wizard interaction

Match the existing white full-page wizard: the full-width step bar, centered
832px column (720px content plus gutters), title and description, and sticky
64px footer. Preserve responsive accessibility on narrow viewports. The pinned
context names the existing match and cannot change the target.

**Add/replace: two steps.**

1. **Choose your video.** Use the existing drop-zone/file-picker style, showing
   filename, size, and duration after inspection. Continue requires a supported,
   playable file within the size limit. No bytes upload before confirmation.
2. **Where does the first point start?** Show the video preview with play/pause,
   scrub, and fine seeking. Ask the user to find the first point's opening serve
   contact. **Use current time** sets an editable `hh:mm:ss.sss` field labeled
   **First point starts at**. Zero is valid but must be explicitly chosen. Explain
   that all recorded timestamps will align from this position. Offer a jump to
   the aligned last point for a quick check. Footer: Back, Cancel, and **Add
   video** or **Replace video**. Replacement copy says the current video remains
   available until the new one is ready.

Upload runs as a pending state of step 2, with actual byte progress followed by
**Saving video…**; no invented ETA. Prevent duplicate submission and incompatible
file/alignment edits while pending. An explicit cancel aborts an upload and marks
the staged attachment abandoned; after atomic commit starts, hold navigation
until its result is known. Completion returns to this match's Film view with
fresh playback metadata. A retry after a lost response must discover an already
completed commit rather than create a second attachment.

**Adjust alignment:** one step with the same preview/timestamp presentation and
the saved video/time preloaded. **Save alignment** is disabled until the time
changes and is valid. No re-upload. Cancel preserves the previous alignment.

Changing the chosen file clears its confirmed alignment. Back within the flow
retains the selected file; leaving/reloading requires selecting a local file
again. No persistent wizard draft is needed for v1. Use labeled keyboard controls,
focus management, `role="alert"` for errors, and restrained progress announcements.

### Alignment and coverage

Determine the first imported point by match point order (`point_number`), not by
the earliest available timestamp or the active Film filter. Its source time is
`S`; the user selects video time `V`. Save `offsetSeconds = S - V`.

For every timed event at source time `T`:

`videoTime = T - offsetSeconds`

Negative offsets are valid. A source first point at 00:30 mapped to video 00:10
makes a point at 01:30 play at 01:10; mapped to video 00:50, it plays at 01:50.
Correction always recomputes from source timestamps, never from a previous
correction. Durations, match statistics, and point order do not change.

Carry the offset through the existing `MatchVideo.startTimeSeconds` subtraction
contract, broadening its documented meaning and video-source discriminator for
attached footage. Keep `film-timeline.ts` the single conversion boundary. Any
point/shot seek or visible video-clock timestamp must use that conversion, in
both embedded and fullscreen playback, including filters, saved points,
next/previous, loops, and skip-dead-time. Do not overwrite provider data merely
to make a displayed timestamp change.

Before upload and again on the server before activation or alignment changes:

- Require finite `V >= 0`, positive finite video duration, a known first-point
  timestamp, and a known final-point timestamp plus positive duration.
- Check all known point starts/ends and shot timestamps against the proposed
  video clock. The last required time includes the final point's full duration.
  Do not use the player's assumed ten-second fallback as evidence of coverage.
- Actual event times must fit inside the recording, allowing at most 0.1 seconds
  for media/timestamp precision. Cosmetic 1.5-second playback padding does not
  determine validity and is clamped to the recording edges after validation.
- Missing first/final timing or invalid source timing produces **This match is
  missing the timing data needed to align a video.** Do not choose a later point
  silently. Untimed middle points remain visible without a seek target; no times
  are invented. Surface that some points have no recorded timestamps.
- Insufficient coverage produces the requested **This video is not long
  enough.** Keep the preview and entered time so the user can correct alignment
  or choose another file. Extra lead-in/out is valid. Duration checking cannot
  detect the wrong match or internal edits; explain that the recording must
  contain the same continuous match footage.

### Formats and limits

The user confirmed v1 accepts playable files and asks for MP4 when unsupported.
Offer MP4, MOV, M4V, AVI, MKV, and WebM as candidate containers, matching the
existing video-upload list. Container extension/MIME alone is not acceptance:
the selected file must have a decodable video track and a finite seekable duration
in the current browser. Preserve audio. Do not introduce automatic transcoding,
compression, or trimming in this feature.

Use a dedicated attachment size constant of **7,999,999,999 bytes**, matching the
existing near-8 GB upload ceiling without coupling to vendor validation. Display
**Under 8 GB**. Reject oversized and empty files before upload and verify actual
stored bytes server-side. No 1080p, 30 fps, or minimum one-minute restriction.

Unsupported or unreadable media says **This video cannot be played. Export it as
an MP4 with H.264 video and try again.** The design promises files playable in the
viewer’s browser, not universal codec compatibility; MP4/H.264 is the recommended
portable format. Network/playback URL failures use a separate retry message.

### Persistence, authorization, and data flow

Add an independent `match_video_attachments` table in a new migration. Minimum
metadata: attachment ID, nullable match FK, uploader, lifecycle state, staged and
final Azure object keys, original filename, verified byte size/media type/duration,
confirmed first-point time, offset, version, and timestamps. Lifecycle states are
pending, active, and retired; a partial unique index permits one active attachment
per match. Retain rows and keys on match deletion (`ON DELETE SET NULL`) so a
cleanup worker can remove orphaned files. No change to imported points/shots or
analysis-job rows is required.

Only server-mediated operations may write attachment metadata. Each operation
authenticates the caller, checks caller-visible match access, requires
`matches.created_by` to equal the caller, checks SwingVision provenance and the
active workspace (personal match in personal scope; exact program in team scope),
then performs the authorized storage action. Program membership or playback
access alone is insufficient to add/replace/align. Recheck permission at commit,
not only when rendering the wizard. Apply the same gate to signed upload URLs.

Expose match-scoped upload preparation, completion, cancellation, alignment, and
playback-refresh handlers under `/api/matches/[matchId]/video`. The planning stage
can split method files; preserve these contracts:

- Preparation returns a server-created attachment ID and short-lived upload
  authorization for a unique staged key, after checking name/type/declared size.
  Limit each caller to one pending attachment for a match; renew a valid attempt
  rather than silently create more. Transfer directly to Azure in bounded chunks.
- Completion accepts that ID, first-point video time, and expected active
  attachment/version. It verifies ownership, blob existence and actual size,
  probes stored media duration/type with bounded reads, recomputes timing from
  database source data, and validates coverage. Browser metadata is advisory.
- Publish verified bytes under a server-only final key, using a source ETag
  condition; never serve an object that an outstanding upload SAS can overwrite.
  Wait for publication to succeed before activation. Persist both keys so a
  failure anywhere remains cleanable.
- A transaction locks the parent match, rechecks authority/source/workspace and
  timing, and atomically activates the new attachment and retires the old one.
  Use expected version checks to reject stale replacements/corrections. A repeated
  completion for the same already-active ID is idempotent.
- Alignment-only updates validate against the saved verified duration and current
  source timeline, then update time/offset/version atomically. The file stays put.
- Read access follows caller-visible match access. `getMatchVideo` selects the
  active attachment for SwingVision and otherwise preserves current analysis
  video behavior. Return a short-lived read-only SAS; never expose upload rights
  or store expiring playback URLs as the durable reference. Refresh access after
  authorization expires without losing the current playhead.

Keep storage credentials server-side and use the existing Azure signing/chunked
transfer patterns without invoking vendor submission. Server-side media probing
must be bounded and fail closed for uninspectable metadata; the precise parser
integration and endpoint payload types belong in stage 03.

### Retention and failure handling

Keep the active recording while its match exists, consistent with the current
source-video retention behavior documented in the guardrails. No user-accessible
version archive is introduced. After a successful replacement, retire the old
file and delete it asynchronously with retries. A cleanup pass reclaims pending
attempts abandoned for 24 hours, retired attachments, and attachments whose match
was deleted. Delete staged files only after their upload authorization has expired
so an old writer cannot recreate a supposedly cleaned object. Remove tracking
rows only after all their storage deletions succeed.

Match deletion must include the new attachments in cleanup, with durable orphan
tracking surviving deletion; no stranded object keys. Account deletion must also
preserve cleanup ownership metadata safely (nullable uploader if needed). The
planning stage must trace these cleanup integration points before implementation.

Upload/probe/commit failure leaves the previous video and alignment untouched.
Show recoverable errors inline with retry or file re-selection as appropriate.
An expired upload URL can be renewed only for an authorized pending attempt.
Concurrent replacement/correction returns **The video changed. Reload and try
again.**; match deletion during upload prevents activation. Cleanup failures are
logged for retry and do not roll back a successful replacement. Auth or workspace
changes stop mutation with a clear return-to-match action.

### Testing and acceptance

- Unit-test positive/negative/zero offsets, nonzero first-source timestamps,
  repeated corrections, precise input parsing, known point ends and shot bounds,
  coverage at the duration boundary, missing timing, and padding clamping.
- Exercise live/local database authorization with creator, other player, program
  member, unrelated user, and wrong active workspace. Test direct writes, forged
  IDs/keys, stale versions, one-active uniqueness, deletion races, and idempotent
  completion. Apply migrations in a controlled test environment before rollout.
- Storage tests cover oversized/empty/invalid media, mismatched metadata, failed
  upload/publication, expired SAS, cancellation, immutable final bytes, and cleanup
  retries without deleting an active asset.
- Browser-test add, replace, correct, cancel, retry, and reload using videos with
  different lead-in durations. Verify the same point in embedded and fullscreen
  playback, filtered/saved points, next/previous, loops, and dead-time skipping.
  Verify too-short and unsupported-file messages and the previous video's survival
  after failure. Test keyboard and narrow viewport behavior against the existing
  upload wizard. Verify unsupported codecs fail before the large upload.
- Regression checks: match creation, the existing analysis upload path, and
  Advantage Intelligence playback; statistics and source rows remain unchanged,
  no vendor job or analysis quota charge is created for an attachment. Run the
  repository's applicable type, lint, formatting, and targeted Playwright checks.

## Open questions

The brief's product choices are resolved for v1: replacement and correction are
included; too-short footage gets the requested error; playable common containers
are accepted with MP4 guidance; the initial cap is under 8 GB; active footage is
retained until replacement or match deletion. Automatic conversion is excluded
by the user's explicit answer.

Stage 03 must verify the bounded server media-probe implementation and exact
cleanup integration before creating implementation tasks. These are feasibility
checks, not permission to omit verification/cleanup or silently change formats.
If a proposed container cannot be inspected safely, surface that limitation for
review rather than accepting browser-supplied duration as authoritative.

## Also consulted

In addition to the declared brief, `MAP.md`, UI guardrails, and design-skill entry
point:

- User clarifications in this conversation: use the existing full-page upload
  wizard style; accept playable files and request MP4 when unsupported.
- `.claude/skills/trace-route/SKILL.md` — route-tracing procedure.
- `.skills/advantage-analytics-design/reference/primitives.md`, Wizard & Task
  Primitives — fields, step bar, footer, and when quota indicators apply.
- `.skills/advantage-analytics-design/reference/chrome.md`, Dialog section —
  consulted in the earlier investigation; modal direction superseded by the user.
- `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` and sibling `layout.tsx`
  — Film import and match-data provider.
- `src/components/dashboard/matches/match-detail/film/film-tab.tsx` and
  `film-timeline.ts` — shared playback clock, consumers, and padding.
- `src/lib/data/match-video-server.ts` — current playback lookup and signing.
- `src/lib/services/splitstep/config.ts`, video validation constants — existing
  candidate containers and byte limit; vendor restrictions are not inherited.
- `src/app/dashboard/matches/new/page.tsx` and `src/lib/data/add-video-server.ts`
  — existing entry routing and explicit import exclusion.
- `src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx`,
  `WizardShell.tsx`, and `UploadWizardSteps.tsx` — verified shell composition and
  step presentation seams.
- `.env.local`, only `NEXT_PUBLIC_SUPABASE_URL` — target identity verification.
- Supabase MCP `get_project_url` and read-only `execute_sql` on 2026-09-17 — live
  columns, policies, RLS flags, constraints, attachment-table discovery, and
  aggregate timing completeness. No database mutations were performed.

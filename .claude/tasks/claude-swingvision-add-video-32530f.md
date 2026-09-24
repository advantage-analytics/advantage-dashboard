# Tasks — claude/swingvision-add-video-32530f

> Scope: SwingVision Add video — trim, uploading screen, per-workspace cap + Usage card + removal, 1-year expiry.

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

## T1 · Cut the attachment to its kept window before it uploads

- **status:** done
- **model:** opus
- **files:** (guess) `src/lib/match-video/trim-window.ts` (new), `src/lib/match-video/limits.ts`, `src/components/dashboard/matches/match-video-attachment/use-attachment-flow.ts`, `src/lib/video/trim.ts` (reused, unchanged), `tests/match-video-trim-window.spec.ts` (new), `tests/match-video-attachment-flow.spec.ts`, `tests/fixtures/match-video-attachment-flow-harness.tsx`
- **done when:**
  - [ ] `limits.ts` exports `ATTACHMENT_TRIM_PAD_SECONDS = 10`. A pure `defaultAttachmentTrimWindow({ markedSeconds, timing, videoDurationSeconds })` returns start = `max(0, marked − 10)` and end = `min(duration, marked + (timing.requiredSourceEndSeconds − timing.anchorSourceSeconds) + 10)`. `tests/match-video-trim-window.spec.ts` covers the normal case, start clamped to 0, and end clamped to the duration.
  - [ ] A pure helper runs the existing `planAlignment` with `confirmedVideoTime = marked − start` and `videoDurationSeconds = end − start`. The spec shows it returning `insufficient_coverage` when the start is after the marked first point or the end is before the last point's end. The default window passes.
  - [ ] In `add` and `replace` mode, submit calls an injected `prepare` dep (in production, `prepareVideoForUpload`) with the window before `transfer`. `transfer` receives the cut file and `confirmedVideoTimeSeconds = marked − start`. The save state gains a trimming phase that reports progress and the kept size in bytes. The flow spec asserts all of this with a fake `prepare`.
  - [ ] When `prepare` resolves `{ trimmed: false }`, `transfer` receives the original file and the untrimmed marked time. The flow spec asserts it.
  - [ ] `discardPreparedVideo` runs after success, failure and cancel. `align` mode never calls `prepare`. The existing tests in `match-video-attachment-flow.spec.ts` still pass.
- **notes:** The server computes the offset as `anchorSource − confirmed` and repeats the coverage check against the uploaded file's verified duration. Sending the marked time on the trimmed clip is therefore enough to keep `offset_seconds` correct, and the server needs no change. `trim.worker.ts` cuts with `shiftTolerance: 0`, so output t=0 is exactly the requested start. The coverage check is `planAlignment` in `src/lib/match-video/alignment.ts`; `limits.ts` holds only the tolerance. "Last point + 10 s" is measured from `requiredSourceEndSeconds`, which covers the final point's duration and any late shots. The wizard's Advantage Intelligence camera questions must not appear here.

## T2 · Draw the one-step "Mark the first point" trim screen

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/components/dashboard/matches/match-video-attachment/AttachmentAlignmentStep.tsx`, `use-attachment-alignment.ts`, `MatchVideoAttachmentFlow.tsx` (TITLES / DESCRIPTIONS / continueLabel / status), possibly a rail pulled out of `src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx`, `tests/match-video-alignment-step.spec.ts`, `tests/match-video-attachment-flow.spec.ts`
- **done when:**
  - [ ] In `add` and `replace` mode, step 2 renders:
    - the eyebrow "Step 2 of 2"
    - the h1 "Mark the first point"
    - the body "Scrub to the serve of the first point. The cut is set around the match for you: from just before that serve to just after SwingVision's last point. Adjust either end if you need to."
    - a footer with "Back", the note "Only the kept part is uploaded" and the primary "Trim and upload"

    The flow spec asserts this markup.

  - [ ] Marking the first point shows the badge "First point marked" and sets both cuts to T1's `defaultAttachmentTrimWindow`. The rail carries the labels "▲ first point" and "last point ▲". The alignment-step spec asserts the Start and End readouts after marking at a known time.
  - [ ] "Set the start here" and "Set the end here" move each cut to the playhead. With both cuts at their defaults, the captions read "10 s before the first point you marked" and "10 s after SwingVision's last point". The spec asserts both.
  - [ ] The centre readout reads "Keeps <kept> of <duration>" (for example "Keeps 1:36:30 of 1:52:10"), computed from the window and the file's duration. The spec asserts it.
  - [ ] A window that no longer covers the match shows the existing `insufficient_coverage` message and disables "Trim and upload". `align` mode keeps today's one-step correction, and the existing test "adjust is one step and never offers a file" passes.
- **notes:** If the rail is extracted from `TrimStepContent.tsx`, `tests/trim-step-navigation.spec.ts` must still pass. That screen is a guarded seam (`docs/ui-revamp-guardrails.md` §3.1): its window and its two camera answers feed the vendor. The canvas doesn't say what the captions read after a cut is moved.

## T3 · Show the "Uploading your video" and "Video saved" screens for attachments

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-video-attachment/AttachmentUploadStatus.tsx` (new, or a body shared with `new-match-wizard/UploadMatchSuccess.tsx`), `MatchVideoAttachmentFlow.tsx`, `AttachmentWizardRoute.tsx`, `src/components/dashboard/shared/vertical-steps.tsx` (reused), `tests/match-video-attachment-flow.spec.ts`
- **done when:**
  - [ ] After "Trim and upload", a status screen replaces the wizard. The flow spec asserts it at a fake mid-transfer progress. The screen has:
    - the h1 "Uploading your video"
    - the subtitle "<player> vs <opponent> · <date> · <score>"
    - three `VerticalStep`s:
      - "Video trimmed", valued "<size> kept"
      - "Uploading video", valued "<n>%", with a bar and "<sent> of <total> · about <eta> left"
      - "Ready on the Film tab"
    - "Cancel"
    - the single note "Keep this tab open until the upload finishes."
    - the link "Back to the match"
  - [ ] `useLeaveGuard` is armed while trimming, uploading or publishing, and released on saved, failed or cancelled. The spec asserts it through a `LeaveGuardProvider` harness.
  - [ ] On success the h1 reads "Video saved" and all three steps show as done, with the second labelled "Video uploaded". The primary "Watch the film" goes to `returnTarget.href`, and a quiet "Back to matches" goes to `/dashboard/matches`. `AttachmentWizardRoute` no longer calls `router.replace` automatically on save. The spec asserts it.
  - [ ] Cancel and failure behave as today. The existing cancel and "refused completion … Try again" tests pass, adapted to the new screen.
  - [ ] If a body is extracted from `UploadMatchSuccess.tsx`, `tests/upload-success-actions.spec.ts` and `tests/upload-leave-guard.spec.ts` pass unchanged.
- **notes:** The user decided (2026-09-24) to drop the canvas line "You can keep using the dashboard." Leaving an attachment upload cancels it: the transfer belongs to the flow ("unmounting mid-upload cancels the attempt"). The leave guard is what warns before leaving. Following "Back to the match" mid-upload also cancels the upload.

## T4 · Enforce the match-video cap on the server and expose workspace usage

- **status:** done
- **model:** fable
- **files:** (guess) `supabase/migrations/<ts>_match_video_attachment_cap.sql` (new), `src/lib/match-video/limits.ts`, `src/lib/match-video/types.ts`, `src/lib/services/match-video/rpc-errors.ts`, `src/lib/services/match-video/uploads.ts`, `src/lib/services/match-video/complete.ts`, `src/lib/data/match-video-usage-server.ts` (new), `tests/match-video-upload-handlers.spec.ts`, `tests/match-video-attachments-db.spec.ts`
- **done when:**
  - [ ] `limits.ts` exports a single constant, `MATCH_VIDEO_ACTIVE_LIMIT = { personal: 1, team: 25 }`. The SQL receives the limit as a parameter and hard-codes neither number.
  - [ ] `match_video_reserve_upload` refuses an add (`p_expected_active_id is null`) with `attachment_limit_reached` once the workspace's active count reaches the limit.
    - A team counts active rows whose match has `program_id` = that team.
    - A personal workspace counts active rows on matches with `program_id is null` created by the actor.
    - A replace is never refused for count.
    - `match_video_activate_attachment` rechecks the count for adds under the match lock, so two pending adds cannot both go active.

    Covered in `tests/match-video-attachments-db.spec.ts`.

  - [ ] `attachment_limit_reached` is added to `MatchVideoErrorCode` / `ERROR_SPECS` (409) and mapped in `rpc-errors.ts`. `handlePrepareUpload` and `handleCompleteUpload` pass the limit for the workspace kind. `tests/match-video-upload-handlers.spec.ts` asserts the 409 body and that no upload credential is minted.
  - [ ] A service-role-only function, `match_video_workspace_usage(actor, kind, id)`, returns one row per active attachment in the workspace. Each row has the attachment id, the match id, `uploaded_by`, `verified_size_bytes`, `activated_at`, and the match's players and date. It refuses a caller who isn't a member of that workspace, and follows the reservations migration's revoke/grant pattern.
  - [ ] `getMatchVideoUsage(workspace)` returns `{ used, cap, rows }` from that function.
- **notes:** The live DB is the source of truth. Before writing the migration, check the `match_video_attachments` columns and functions against it via the Supabase MCP. `supabase/migrations/2026091904…–2026091916…` look current, but that is unconfirmed. `state` is `pending|active|retired`, one-way and enforced by trigger.

## T5 · Let the uploader, or a team owner/coach, remove an active match video

- **status:** done
- **model:** fable
- **files:** (guess) `supabase/migrations/<ts>_match_video_remove_attachment.sql` (new), `src/lib/services/match-video/access.ts`, `src/lib/services/match-video/remove.ts` (new), `src/app/api/matches/[matchId]/video/route.ts` (add DELETE), `MAP.md` (API row), `tests/match-video-access-handlers.spec.ts`, `tests/match-video-attachments-db.spec.ts`
- **done when:**
  - [ ] The migration adds:
    - the column `retired_reason text`, checked `retired_reason is null or retired_reason in ('removed','expired')`
    - a service-role-only function, `match_video_remove_attachment(actor, match_id, attachment_id)`. It retires an ACTIVE row with `retired_reason = 'removed'`, `retired_at = now()` and `cleanup_next_attempt_at = now()`, and running it again does no harm.
  - [ ] The function allows the row's `uploaded_by`, and a `program_members` owner or coach of the match's program. Everyone else is refused, including staff and players removing rows that aren't theirs. This path does not use `match_video_authorize_match`, which is creator-only.
  - [ ] `DELETE /api/matches/[matchId]/video` (same-origin, `{ attachmentId }`) runs four steps in order: the visibility check, the new removal check, the RPC, then `requestBestEffortCleanup`. The handler spec covers these cases:
    - a player removing their own video: 200
    - a player removing someone else's: 403
    - a coach or owner removing any video in the team: 200
    - a coach of another program: 404
    - a stranger: 404
  - [ ] Retiring leaves `matches`, `match_stats`, `points` and `shots` untouched. The db spec asserts the match's point count is unchanged after removal.
- **notes:** Nothing can retire an active row today: `match_video_cancel_upload` refuses `active` with `mode_conflict`. The cleanup claim already collects retired rows' blobs. Staff remove only their own videos (decided 2026-09-24).

## T6 · Show the match-video count and the at-cap states in the Film empty state

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** (guess) `src/lib/match-video/film-entry.ts`, `src/lib/data/match-film-entry-server.ts`, `src/components/dashboard/matches/match-detail/film/film-empty-state.tsx`, `tests/film-empty-state-cap.spec.ts` (new, `createLoader()` from `tests/fixtures/vm-modules.ts` + `renderToStaticMarkup`), `tests/match-film-entry.spec.ts`
- **done when:**
  - [ ] `MatchFilmEntry` gains `quota: { used, cap, holder: { matchId, playerName, opponentName, date } | null } | null`. `resolveMatchFilmEntry` fills it from T4's usage for a viewer who has the `add` action. `NO_FILM_ENTRY.quota` is null.
  - [ ] Under the cap, the micro line reads "MP4 up to 8 GB · 0 of 1 match video used": "match video" when the cap is 1, "match videos" otherwise. The heading, body and "Add video" are unchanged.
  - [ ] At the personal cap:
    - The body reads "The statistics came from a SwingVision export. Your one match video is on Marcus Reid vs Daniel Cho (Aug 30). Remove it there to add the film here; the statistics on both matches stay."
    - The button "Open Reid vs Cho" links to `matchFilmHref(holder.matchId)`.
    - The micro line reads "1 of 1 match video used".
  - [ ] At the team cap:
    - The body reads "The statistics came from a SwingVision export. Your team has used all 25 match videos. Remove one, usually from a match nobody watches any more, to add the film here."
    - The button "Manage match videos" links to `/dashboard/settings/usage`.
    - The micro line reads "25 of 25 match videos used".
  - [ ] `tests/film-empty-state-cap.spec.ts` renders the three states above. It also renders a null quota, which keeps today's "we index the points, you keep the file". It asserts those strings and hrefs.
- **notes:** The anatomy is unchanged: icon, rule, h2. Only the body, the button and the micro line change. The micro line is where "More with Pro" will go later. The empty state reads `MAX_VIDEO_SIZE_BYTES` from `splitstep/config`, and the attachment limit is `MATCH_VIDEO_MAX_BYTES`. Both are about 8 GB.

## T7 · Add the "Match videos" card to Settings › Usage & quota

- **status:** todo
- **model:** opus
- **needs:** T4, T5, T8
- **files:** (guess) `src/lib/dashboard/nav.ts`, `src/app/dashboard/settings/usage/page.tsx`, `src/components/dashboard/settings/match-videos-usage-card.tsx` (new), `src/components/dashboard/settings/usage-actions.ts`, `src/components/ui/state-pill.tsx` (reused), `tests/settings-match-videos-card.spec.ts` (new, `createLoader()`)
- **done when:**
  - [ ] The `usage` entry in `SETTINGS_SECTIONS` has the subtitle "Advantage Intelligence analysis time and match video storage — yours and the program's."
  - [ ] The card is built from `SettingsCard`, like `ProgramUsageCard`, and follows the ACTIVE workspace.
    - Personal: titled "Your match videos", with the meter "1 / 1".
    - Team: `SettingsCardTitle` with `WorkspaceMark`, titled "<team> · <squad> · match videos", with the meter "<used> / <cap>".
  - [ ] There is one expandable row (`aria-expanded`) per uploader, sorted by video count, most first. Each row reads "<name> · N videos · <GB>".
    - Expanded, each match reads "<P1 surname> vs <P2 surname> · <date> · Watched <date>". If nobody has watched it yet, it reads "Added <activated date>".
    - A grey `StatePill` "N expires <date>" shows when that person has videos in the 30-day window, using T8's `matchVideoExpiry`.
  - [ ] "Remove" shows on the viewer's own rows, and on every row when the viewer is a team owner or coach. It calls T5's DELETE and the row disappears. The spec asserts how many Remove buttons a player, a coach and an owner see.
  - [ ] The footnote reads "Film added to SwingVision matches, for playback only: it isn't analysed and uses no hours. A video nobody watches for a year is removed; the match and its statistics stay."

## T8 · Record when a match video was last watched

- **status:** todo
- **model:** fable
- **needs:** T4
- **files:** (guess) `supabase/migrations/<ts>_match_video_last_viewed.sql` (new), `src/lib/match-video/expiry.ts` (new), `src/lib/services/match-video/views.ts` (new), `src/app/api/matches/[matchId]/video/viewed/route.ts` (new), `src/components/dashboard/matches/match-detail/film/film-player.tsx`, `film-fullscreen.tsx`, `tests/match-video-expiry.spec.ts` (new), `tests/match-video-access-handlers.spec.ts`
- **done when:**
  - [ ] The migration changes `match_video_attachments` and adds one function:
    - It adds `last_viewed_at timestamptz` and `expiry_warned_at timestamptz`, with no backfill. The clock is `coalesce(last_viewed_at, activated_at)`.
    - A service-role-only function, `match_video_record_view(match_id)`, sets `last_viewed_at = now()` and `expiry_warned_at = null` on the active row.
    - `match_video_workspace_usage` also returns `last_viewed_at`.
  - [ ] `expiry.ts` exports `MATCH_VIDEO_EXPIRY_DAYS = 365`, `MATCH_VIDEO_EXPIRY_WARN_DAYS = 30` and a pure function, `matchVideoExpiry({ activatedAt, lastViewedAt }, now)`, that returns `{ expiresAt, warning, monthsUnwatched }`. The spec covers the fallback to `activatedAt`, day 334 against day 335, and 11 months.
  - [ ] `POST /api/matches/[matchId]/video/viewed` (same-origin) runs `authorizeMatchVisibility`, then the RPC. The handler spec covers 401, 404 and "no active video", where nothing is written.
  - [ ] The Film player and the fullscreen room send the POST once per loaded source, on the first `play` event. Rendering the page and minting playback URLs don't send it, and `handleGetPlayback` still writes nothing.
- **notes:** Decided 2026-09-24: a play event sends a POST to count a view. `GET /video` is not stamped: it is documented as write-free, runs on every credential refresh, and is rendered on the server without anyone pressing play. "Keep this video" (T10) uses the same endpoint and the same rule: anyone who can see the match.

## T9 · Warn at 11 months and expire at 1 year in the cleanup cron, with the email

- **status:** todo
- **model:** fable
- **needs:** T5, T8
- **files:** (guess) `supabase/migrations/<ts>_match_video_expiry_sweep.sql` (new), `src/lib/services/match-video/cleanup-schedule.ts`, `src/app/api/cron/cleanup-match-videos/route.ts`, `src/lib/services/email/templates/match-video-expiry.ts` (new), `src/lib/services/email/index.ts`, `docs/email-system.md`, `tests/match-video-cleanup.spec.ts`, `tests/match-video-expiry-email.spec.ts` (new), `tests/match-video-attachments-db.spec.ts`
- **done when:**
  - [ ] Two new service-role-only functions, covered in the db spec:
    - `match_video_claim_expiry_warnings(limit)` stamps and returns active rows whose clock is at least 335 days old and whose `expiry_warned_at` is null.
    - `match_video_expire_unwatched(limit)` retires active rows 365 or more days old, setting `retired_reason = 'expired'`, `retired_at = now()` and `cleanup_next_attempt_at = now()`.
  - [ ] `handleCleanupCron` takes injected `expire` and `warn` deps. It runs expire, then warn, then the existing sweep, and reports `expired` and `warned` counts. `tests/match-video-cleanup.spec.ts` asserts the order and the counts, and that a refused (401) request calls none of them.
  - [ ] `matchVideoExpiryEmail(input)` renders through `renderEmail`/`renderText`. It has a tag of `type: match_video_expiry` and formats dates in UTC. `tests/match-video-expiry-email.spec.ts` asserts every part:
    - the heading "A match video will be removed on <date>"
    - the body "Nobody has watched the video on <b>P1 vs P2</b> (<date>) in 11 months. We remove match videos after a year without a view. The statistics stay."
    - a "Keep this video" button linking to `siteUrl()` + `matchFilmHref(matchId)`
    - the line "Watching any point of it keeps it too. Nothing to do if you don't need the film."
    - the footer "Sent to <name> because you added this video.", followed by the team label for a team video only
  - [ ] Each warned row is emailed to its `uploaded_by` only after `claimSend("match_video_expiry:<attachmentId>:<clock date>")` returns true. A row with a null uploader is skipped. The spec uses a fake sender.
  - [ ] The template is exported from `index.ts` with a row in its doc-comment table, and `docs/email-system.md` lists it.
- **notes:** An expired row stays, retired as `'expired'`. The existing sweep deletes the blob, and the stats are never touched.

## T10 · Show the expiry notice, "Keep this video" and the expired state on the Film tab

- **status:** todo
- **model:** opus
- **needs:** T6, T8
- **files:** (guess) `src/lib/data/match-video-server.ts`, `src/lib/data/match-film-entry-server.ts`, `src/lib/match-video/film-entry.ts`, `src/components/dashboard/matches/match-detail/film/film-tab.tsx`, `film-expiry-notice.tsx` (new), `film-expired-state.tsx` (new), `tests/film-expiry-states.spec.ts` (new, `createLoader()`), `tests/match-film-entry.spec.ts`
- **done when:**
  - [ ] `MatchVideo.attachment` carries `expiresAt` and `monthsUnwatched`, from `matchVideoExpiry`. `MatchFilmEntry` carries `expiredAt: string | null`: the latest row with `retired_reason = 'expired'`, when no video is active.
  - [ ] Inside the 30-day window, an amber notice sits above the point list. It reads "Not watched in <n> months, so this video will be removed on <date>. The statistics stay." with the button "Keep this video". Pressing it POSTs to T8's endpoint and hides the notice. The spec asserts the text, the fetch and that the notice is hidden.
  - [ ] `filmEntryView` returns `"expired"` when the attachment is absent and `expiredAt` is set. `tests/match-film-entry.spec.ts` asserts that a storage problem still takes precedence over expired.
  - [ ] The expired state reuses the `FilmEmptyState` anatomy:
    - the heading "This video was removed"
    - the body "Nobody watched it for a year, so it was removed on <date>. The statistics and the point list are unchanged. Add the film again to get the clips back."
    - "Add video", shown only with the `add` action
    - T6's micro line, for example "MP4 up to 8 GB · 18 of 25 match videos used"
  - [ ] `tests/film-expiry-states.spec.ts` renders the notice and the expired state and asserts the strings above.

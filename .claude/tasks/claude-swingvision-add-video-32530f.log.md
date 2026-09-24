# Run log — claude/swingvision-add-video-32530f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Cut the attachment to its kept window before it uploads — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** New pure `src/lib/match-video/trim-window.ts` (`defaultAttachmentTrimWindow`, `markedTimeInTrimmedClip`, `planTrimmedAlignment`) and `ATTACHMENT_TRIM_PAD_SECONDS = 10` in `limits.ts`. `use-attachment-flow.ts` takes injected `prepare`/`discardPrepared`/`trimWindow` deps and `points`/`shots`, cuts before reserving in add/replace (align untouched), sends `marked − start`, and exposes `phase` + `keptBytes`; a failed or refused cut uploads the original. `SavingStrip` shows "keeping X of Y" while cutting. New `tests/match-video-trim-window.spec.ts`; flow spec +6 tests with a fake `prepare` (`?prepare=skip|cut|hold`).

**follow-ups:**

1. The start pads from the marked point while the end pads from the last required instant; consider padding the start from `earliestSourceSeconds` (a shot logged before the first point) — decide in T2.
2. "Try again" re-cuts the file under the same `clientRequestId`; if the remux size ever differs, the server may refuse the retry. Keeping the cut in OPFS across retries would avoid it.
3. T3's uploading screen should treat `keptBytes` as an estimate until the cut lands.

## T2 · Draw the one-step "Mark the first point" trim screen — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** Add/replace step 2 is now the canvas "Mark the first point" screen: badge, 40px rail with washed ends, blue kept-window bracket and playhead, "▲ first point" / "last point ▲", Start/End readouts with "Set the start here" / "Set the end here", captions, "Keeps … of …", footer note "Only the kept part is uploaded" and primary "Trim and upload". `use-attachment-alignment.ts` holds the adjustable window tied to the mark and runs `planTrimmedAlignment`; a bad window shows `insufficient_coverage` plus a cut-specific sentence and disables submit. `use-attachment-flow.ts` cuts the window the user sees (and keeps it across Back). Align mode unchanged. Rail rebuilt in the attachment step, not extracted — the wizard trim step (guarded seam) is untouched.

**follow-ups:**

1. `WizardShell` renders the h1 at 30px and an 832px column (canvas: 24px, 720px) — a per-flow variant if the proportions matter.
2. The rail has no filmstrip thumbnails; the wizard's `useVideoFilmstrip` could supply them.
3. Eyes-on in the running app at 1440px and on a phone — the footer note is hidden on phones.

## T3 · Show the "Uploading your video" and "Video saved" screens for attachments — blocked

**gate:** mechanical GATE FAIL (2 specs) · completion not run

**reason:** The work itself looked complete (new `AttachmentUploadStatus.tsx`, leave guard armed while saving, "Video saved" screen, `AttachmentWizardRoute` no longer navigates on save; attachment-flow 35/35, upload-success-actions and upload-leave-guard unchanged and passing). Two full-suite specs fail as consequences of the change:

1. `tests/design-drift.spec.ts` — off-scale `text-[Npx]` 5 vs seed 4: `AttachmentUploadStatus.tsx:325 text-[24px]` is new. Snap to the SKILL.md type scale (or reuse whatever `UploadMatchSuccess.tsx:90` renders through), don't raise the seed.
2. `tests/match-film-entry.spec.ts:350` "a successful save returns to the same match with Video selected" asserts the OLD route source (`router.replace(href)`, `router.refresh()` in `AttachmentWizardRoute`). T3's criteria deliberately remove that auto-return, so the spec must be updated to the new contract (Saved screen's "Watch the film" → `returnTarget.href`, no `?tab=`).

**stash:** 6295ddfcde2b630ad3b2377210fa9faebffd8ba2 — recover with `git stash apply 6295ddfc`, fix the two specs above, then reset T3 to `todo` (or finish by hand).

**follow-ups:**

1. The shared leave dialog says the upload continues if you leave — false for attachments; needs attachment wording.
2. Subtitle shows the server-formatted score without "Won"/"Lost".
3. "Video trimmed" shows even when the cut failed and the original uploaded — add a `trimmed` flag to the save state.

## T3 · Show the "Uploading your video" and "Video saved" screens for attachments — done

**gate:** mechanical GATE PASS · completion VERDICT: pass (re-run after the block above, at the user's go)

**changed:** Applied stash 6295ddfc and fixed the two blockers: the status h1 uses the DS `text-title-lg` step instead of `text-[24px]` (design-drift back to seed), and `tests/match-film-entry.spec.ts` now asserts the new contract — `AttachmentWizardRoute` neither replaces nor refreshes, and `AttachmentUploadStatus` links "Watch the film" to `returnTarget.href`. The stash's work: new `AttachmentUploadStatus.tsx` ("Uploading your video" → "Video saved", three `VerticalStep`s, Cancel, "Keep this tab open until the upload finishes.", "Back to the match"; saved: "Watch the film" / "Back to matches"), leave guard armed while saving, `etaSeconds` + saved `sizeBytes` on the flow state, harness through a real `LeaveGuardProvider`, shared link/navigation mocks extended.

**follow-ups:** see the blocked entry above (leave-dialog wording for attachments, "Won/Lost" in the subtitle, `trimmed` flag for "Video trimmed").

## T4 · Enforce the match-video cap on the server and expose workspace usage — done

**gate:** mechanical GATE PASS · completion VERDICT: pass · ran on **opus** (routed fable; user override 2026-09-24 while fable was rate-limited)

**changed:** New migration `20260924120000_match_video_attachment_cap.sql` — **written, NOT applied to live** (awaiting the user's approval). Recreates `match_video_reserve_upload` / `match_video_activate_attachment` from the live bodies (no drift found) with `p_active_limit integer default null`; adds refuse `attachment_limit_reached` at the limit (team = `program_id`, personal = `program_id is null` + `created_by`), replaces never counted; activate rechecks under a workspace advisory lock taken after the match lock. New service-role-only `match_video_workspace_usage(actor, kind, id)`. `MATCH_VIDEO_ACTIVE_LIMIT = { personal: 1, team: 25 }`; `attachment_limit_reached` 409 in `ERROR_SPECS` + `rpc-errors.ts`; prepare/complete pass the limit from the authorized workspace. New `getMatchVideoUsage(workspace)`. Specs: upload-handlers 91 pass, completion 73 pass, attachments-db new block written but skipped (live/prod).

**follow-ups:**

1. **Deploy order:** apply the migration BEFORE this code deploys — new code against the old functions 500s on prepare/complete. Old code after the migration keeps working (null limit = no cap).
2. Run `match-video-attachments-db.spec.ts` against a non-prod project with the migration applied.
3. Drop the `p_active_limit` null default once no deployed caller omits it.
4. `match_video_begin_finalization` doesn't check the cap — a pending add can publish before activation refuses it (cleanup removes it); the wizard needs user-facing copy for the new code.
5. Product review of the error copy ("You can still replace a match's existing video.").

## T5 · Let the uploader, or a team owner/coach, remove an active match video — done

**gate:** mechanical GATE PASS · completion VERDICT: pass · ran on **opus** (routed fable; user override)

**changed:** New migration `20260924130000_match_video_remove_attachment.sql` — **written, NOT applied to live**, not executed anywhere (no local Postgres); checked by reading against live definitions. Adds `retired_reason` (check `removed|expired`, plus reason-only-on-retired) and service-role-only `match_video_remove_attachment(actor, match, attachment)`: uploader or program owner/coach, retires an active row with `retired_reason='removed'`, idempotent, refuses pending with `mode_conflict`, never calls `match_video_authorize_match`. New `remove.ts` handler + `authorizeMatchVideoRemoval` in `access.ts`; `DELETE /api/matches/[matchId]/video` (same-origin → sign-in → `{ attachmentId }` → visibility → removal check → RPC → cleanup via `after()`). Access-handler spec 68/68 incl. the five required cases; live-DB block written (skips on prod) incl. point-count + full snapshot unchanged. MAP.md API row mentions DELETE.

**follow-ups:**

1. **Deploy order:** apply `20260924120000_…cap` then `20260924130000_…remove`, then deploy code (DELETE 500s before). Run the live removal block against a non-prod project.
2. Removal doesn't require the active workspace — a coach's role is checked against the match's own program. Decide whether it should.
3. DELETE on a row already retired another way (e.g. replaced) returns 200 with `retiredReason: null`.
4. Add `remove.ts` to `tests/client-bundle-boundary.spec.ts`'s server-only list.
5. `scheduleAfterResponse` is duplicated in `purge.ts` and `remove.ts` — share it.

## T6 · Show the match-video count and the at-cap states in the Film empty state — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** `MatchFilmEntry.quota` (`{ used, cap, holder } | null`), filled by `resolveMatchFilmEntry` via a `loadUsage` seam (→ `getMatchVideoUsage`) only on the `add` path; holder = the personal workspace's one video, null for teams; a throwing usage read degrades to `quota: null` (today's copy). `film-empty-state.tsx`: under-cap micro line "MP4 up to 8 GB · N of M match video(s) used"; personal cap body + "Open <P1 surname> vs <P2 surname>" → `matchFilmHref(holder.matchId)`; team cap body + "Manage match videos" → `/dashboard/settings/usage`. `matchFilmHref` moved into client-safe `film-entry.ts` (re-exported from the server file). New `tests/film-empty-state-cap.spec.ts` (createLoader, 4 states).

**follow-ups:**

1. Nobody sees the at-cap states until T4's migration is applied (usage reads return 0 until then).
2. "More with Pro" goes on the micro line when pricing tiers land.

## T8 · Record when a match video was last watched — done

**gate:** mechanical GATE PASS · completion VERDICT: pass · ran on **opus** (routed fable; user override)

**changed:** New migration `20260924140000_match_video_last_viewed.sql` — **written, NOT applied to live**, never executed (no local DB): adds `last_viewed_at` / `expiry_warned_at` (no backfill), service-role-only `match_video_record_view(p_match_id)` (stamps the active row, clears the warning; no active row → no write), drops/recreates `match_video_workspace_usage` + its helper to return `last_viewed_at`. New `src/lib/match-video/expiry.ts` (`MATCH_VIDEO_EXPIRY_DAYS=365`, `…_WARN_DAYS=30`, pure `matchVideoExpiry`), `views.ts` handler, `POST /api/matches/[matchId]/video/viewed` (same-origin → visibility → RPC; `{view:null}` when no active video). Film player + fullscreen call `onFirstPlay` once per loaded source; `film-tab.tsx` de-dups across both surfaces and fires `record-video-view.ts` (fire-and-forget, AI videos excluded). `GET /video` / `handleGetPlayback` unchanged and asserted write-free. MAP.md, bundle-boundary list, usage loader updated.

**follow-ups:**

1. **Deploy order:** apply 20260924120000 → 20260924130000 → 20260924140000, then deploy. The POST 500s silently until then.
2. A credential refresh mid-playback counts as a new source → ~one extra POST per refresh; key on attachment id instead if it matters.
3. "11 months" copy can read 10 months in a leap-year edge — decide before T9's copy.
4. `remove.ts` (T5) still missing from `tests/client-bundle-boundary.spec.ts`'s server-only list.

## T7 · Add the "Match videos" card to Settings › Usage & quota — done

**gate:** mechanical GATE PASS · completion VERDICT: pass

**changed:** New `match-videos-usage-card.tsx` (third card on Settings › Usage & quota, follows the active workspace): personal "Your match videos" / team `WorkspaceMark` + "<team> · <squad> · match videos", meter "<used> / <cap>"; one `aria-expanded` row per uploader sorted by count ("Name · N videos · X.X GB", `YouPill` on the viewer's row); expanded matches "Surname vs Surname · date · Watched …" or "Added …"; grey `StatePill` "N expires <date>" from `matchVideoExpiry`; Remove (own rows; all rows for team owner/coach) → confirm dialog → T5 DELETE → row leaves local state and the meter drops. Honest empty line ("No match videos yet…"), skeleton in `settings-pending.tsx`. Page subtitle updated in `nav.ts`. New service-role `getMatchVideoUploaderNames(ids)` in `match-video-usage-server.ts` (only ids the membership-checked usage function returned). Spec: Remove count player 1 / staff 1 / coach 6 / owner 6, footnote exact.

**follow-ups:**

1. Eyes-on in a browser (populated, empty, loading) via the preview harness.
2. No spec clicks Remove and asserts the row leaves the DOM — needs a DOM-based test.
3. `getMatchVideoUsage` can't tell a failed read from zero videos — an error flag would let the card show an error line.
4. `ProgramUsageCard` doesn't mark the viewer's row with `YouPill`, as the settings rules ask.

## T9 · Warn at 11 months and expire at 1 year in the cleanup cron, with the email — blocked

**gate:** mechanical GATE PASS · completion VERDICT: needs-work · ran on **opus** (routed fable; user override)

**reason:** One criterion unmet, caused by the runner's dispatch prompt, not the subagent: the approved body text fixes "in 11 months", but the runner told the subagent to use `matchVideoExpiry().monthsUnwatched`, which reads "10 months" at day 335 for many clocks (e.g. Mar 1 → Jan 30). Everything else met: `match_video_expire_unwatched(p_limit, p_expiry_days)` / `match_video_claim_expiry_warnings(p_limit, p_expiry_days, p_warn_days)` in `20260924150000_match_video_expiry_sweep.sql` (not applied to live), `expiry-sweep.ts`, cron runs expire → warn → sweep with counts, template + `claimSend` dedupe + fake-sender spec, `index.ts` row, `docs/email-system.md` §8 "Scheduled mail". `shell.ts` gained opt-in bold spans + `footer` (reviewer: no auth-template change needed). `remove.ts` + `expiry-sweep.ts` added to the bundle-boundary list.

**stash:** 89ade8047a63fb9ea2b987f08e1001a6ae7f337c — recover with `git stash apply 89ade804`. Fix: make the body say "in 11 months" (drop `monthsUnwatched` from the template input or ignore it) and update `tests/match-video-expiry-email.spec.ts` accordingly — or amend the criterion if the user prefers the computed count.

**follow-ups:** warnings capped at 25/run within a 15 s budget (stamped before send; a failed send is not retried); the removal date is clock + 365 d UTC but the sweep runs 05:00 UTC so it can land a day later; "Keep this video" in the email only links to the Film tab — playing counts as a view (T10 adds the explicit Keep).

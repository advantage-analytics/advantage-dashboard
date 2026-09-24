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

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

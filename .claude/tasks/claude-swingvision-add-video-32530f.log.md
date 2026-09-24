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

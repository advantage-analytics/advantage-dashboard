# Run log — claude/admin-label-serve-let-01b28a

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Let serve result · data model and session rule — done

**gate:** mechanical pass · completion pass

**changed:** `label_shots.result` check now allows `let` (live migration 20261009182159 on `label_shots_result_check`, repo file matches). `LabelShotResult`/`LABEL_SHOT_RESULTS`/`RESULT_LABEL` gain let; `letResultError` refuses a let on a non-serve at parse time and against the stored row in `writeLabelShotEdit`. `LabelSession.playOnLets` read from `matches.format.play_on_lets` (literal true only). `positionPatch` keeps a stored let on position edits. Specs in label-edit, label-shot-derived, label-session-order.

**follow-ups:**

1. Retyping a let serve's stroke to a rally stroke leaves a let on a non-serve; `writeLabelShotEdit` could judge `{ ...row, ...patch }`.
2. The console's optimistic `applyLabelShotPatch` does not call `letResultError`; only the server refuses.
3. The `playOnLets` doc comment in session.ts reads confusingly next to the field name — tidy when the menu lands (T3).

## T2 · Let serve · derivation and scoring semantics — done

**gate:** mechanical pass · completion pass

**changed:** `deriveEnding` drops let serves before reading the point (lone let → null; let + missed first serve → null, not double fault). `pointSummary().rally` counts from the last non-let serve over non-let strokes (time and lastShot still include the let). `secondServeAsFirst` skips lets, so a first serve after a let raises no mark while a let between a fault and a first serve does not clear the fault. `isFault` unchanged (doc only); scorecard needed nothing. Specs in label-ending-derived, label-black-rows, label-after-point-hint.

**follow-ups:**

1. scorecard.ts per-result breakdowns (`resultChanges` keys) will show let as its own value — unchecked how it reads.
2. `serveAfterServeIn` in marks-state.ts does not skip lets; looks right but is untested.

## T3 · Rail serve-result menu with Let — done

**gate:** mechanical pass · completion pass

**changed:** Serve rows in a lets-replayed session get a `ServeResultCell` (SelectEditor trigger, "Serve result" heading, calculated Net/In/Out item "From where it landed", divider, "Let" with its description); pure `serveResultMenu`/`serveResultPatch` helpers; let ink `text-[var(--rail-amber)]`; the actions overlay hides via `group-has-[[data-menu-open]]/row:hidden`. `SelectOption` gains description/group/divider; shared `MenuSelect` gains `divider` and optional controlled open. `playOnLets` threads console → rail → `EditContext` (also covers T4's first criterion). Six specs in label-black-rows.

**follow-ups:**

1. With no landing placed, a let can't be switched back to In/Out from the menu (Reset still works).
2. Eyes-on in a real browser not done: amber trigger, divider/description in the dark FloatMenu, Delete hiding while open.
3. `menu-select.tsx` `setOpen` also sets own state when controlled — harmless, redundant.

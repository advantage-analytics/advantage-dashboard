# Run log — claude/upload-wizard-trimming-design-4629a3

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Score grid: Tab follows the digit path, new hint copy — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `ScoreBlock.tsx` — a plain Tab in a score cell now follows the digit path (player → opponent same set → player TB when the set went to a tiebreak → next set's player cell or the dashed add-set cell); tiebreak cells share one target with Enter (player TB → opponent TB → next set); Tab with nowhere to go and Shift/modifier+Tab are left to the browser. Hint line is now "Each digit moves to the next box · [tab] or [enter] leaves a tiebreak box" with Kbd chips at 11px/--ink-600. `tests/upload-score-regression.spec.ts` gains a browser test of the Tab path and its shared `setFormat` helper now targets `menuitemradio`.
**follow-ups:**

1. Six older tests in `tests/upload-score-regression.spec.ts` fail on stale selectors (`Ad`, `Best of 1` as buttons → `menuitemradio`), and the preset-mode test finds Continue disabled after the xlsx upload. The file only runs with WIZARD_REPRODUCTION_BASE_URL set, so `npm test` does not see it.
2. The schedule's score page also renders `ScoreBlock`, so it inherits the Tab behaviour and hint line — worth a look.

## T2 · Score caption: "How to enter a tiebreak" popover — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `ScoreBlock.tsx` — a "How to enter a tiebreak" text button (HelpCircle, 11px, --ink-600 → --ink-900) after the Score caption opens a 360px `floatMenuCls` popover, "Entering a tiebreak", with the two author-approved worked examples; mini boxes are aria-hidden spans stacked player over opponent (games box, then a blue-outlined TB box: 7·[7] / 6·[4] and 1·[10] / 0·[8]). Hidden when `gamesTo === 8` (doubles pro-set on the schedule score page). New offline spec `tests/upload-score-help.spec.ts` (3 tests).
**follow-ups:**

1. An 8-game pro-set still opens a TB box on a 9–8 score via `isTiebreakSet` — whether a pro-set should have one at all is an open question.
2. Edit Match (`edit-match-score.tsx`) uses `ScoreInput` directly and does not get the tiebreak help.

## T3 · Opponent naming hints under the name input and the selects — done

**gate:** mechanical GATE PASS (first run failed only on the live-DB `match-video-attachments-db.spec.ts` cleanup test, unrelated to this diff; the re-run passed) · completion VERDICT: pass
**changed:** `DetailsStepContent.tsx` — while naming the opponent, the line under the name input is now a `enter` Kbd chip + "to add them" (11px, --ink-600), replacing "Hand and backhand after the name"; a new line under the two disabled selects (`sm:col-span-2 sm:col-start-2`) reads "Hand and backhand open once the opponent is added." and disappears once an opponent is set. `tests/upload-player-details.spec.ts` gains source assertions for both strings and the removed one.

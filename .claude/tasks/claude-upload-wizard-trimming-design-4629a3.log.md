# Run log — claude/upload-wizard-trimming-design-4629a3

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Score grid: Tab follows the digit path, new hint copy — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `ScoreBlock.tsx` — a plain Tab in a score cell now follows the digit path (player → opponent same set → player TB when the set went to a tiebreak → next set's player cell or the dashed add-set cell); tiebreak cells share one target with Enter (player TB → opponent TB → next set); Tab with nowhere to go and Shift/modifier+Tab are left to the browser. Hint line is now "Each digit moves to the next box · [tab] or [enter] leaves a tiebreak box" with Kbd chips at 11px/--ink-600. `tests/upload-score-regression.spec.ts` gains a browser test of the Tab path and its shared `setFormat` helper now targets `menuitemradio`.
**follow-ups:**

1. Six older tests in `tests/upload-score-regression.spec.ts` fail on stale selectors (`Ad`, `Best of 1` as buttons → `menuitemradio`), and the preset-mode test finds Continue disabled after the xlsx upload. The file only runs with WIZARD_REPRODUCTION_BASE_URL set, so `npm test` does not see it.
2. The schedule's score page also renders `ScoreBlock`, so it inherits the Tab behaviour and hint line — worth a look.

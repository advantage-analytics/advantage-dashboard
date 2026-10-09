# Run log — claude/score-constrained-segmentation-836147

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add positional server module (`position.ts`) — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New pure `derivation/position.ts` with `playerAtEnd` (swap count = Σ ceil(T/2) over finished sets + ceil(gamesBeforeInSet/2) + floor(tiebreakPointsBefore/6)) and `serveEnd`; `frozenGameStarts` now calls `serveEnd`; `index.ts` re-exports both plus types `CourtEnd`/`EndSchedule`; new offline `tests/splitstep-position.spec.ts` (11 tests).
**follow-ups:**

1. A tiebreak set carries only its 13-game total into the next set; swaps inside the tiebreak are dropped. Confirm the ends after a tiebreak against a real match before the segmenter relies on it.
2. `frozen.ts` and `played.ts` headers already name players and jobs from earlier work; decide whether the no-names rule applies to existing headers (separate cleanup).

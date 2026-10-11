# Run log — claude/personal-statistics-page-ce72ae

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Statistics catalogue and rolling-window helpers (pure, with tests) — done

- **gate:** mechanical pass · completion pass
- **changed:** New pure module `src/lib/data/statistics.ts` — `STATISTIC_GROUPS` (15 entries, groups shaped `{ title, statistics }`, keys = the head-to-head keys plus `returnWinners`), `averageOf`, `rollingMean` (entry `i` = window ending at match `i + window − 1`), `windowChange` (rounded to 1 decimal), `WINDOW_OPTIONS`, `DEFAULT_WINDOW`, `parseWindow` (strict). `tests/statistics-rolling.spec.ts` pins labels, formats and `lowerIsBetter` against `H2H_GROUPS` plus the window arithmetic (19 tests).
- **follow-ups:**
  1. The catalogue restates the head-to-head card's labels to stay React-free; only the spec holds them in step. Moving the labels to a pure module would let both read one source.

## T2 · Personal statistics loader: per-match values and the points read — blocked

- **gate:** mechanical not completed (full suite exceeded the 10-minute window and was stopped once the review failed) · completion needs-work
- **reason:** Criterion 3 says "net points won and total points won = made / attempts × 100". The diff sets `values.totalPointsWon` to the bare count `num(total_points_won)`, because the head-to-head card reads it as a count and T1's committed catalogue and spec pin its format as `"count"`. The criterion and T1 contradict each other; the reviewer held the criterion as written. The other four criteria were judged met, and the `playerSide` / `isMe` move to a pure `player-identity.ts` was judged acceptable.
- **stash:** 9a451f3a989544386c1967304452c3df7a665f76

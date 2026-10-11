# Run log — claude/personal-statistics-page-ce72ae

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Statistics catalogue and rolling-window helpers (pure, with tests) — done

- **gate:** mechanical pass · completion pass
- **changed:** New pure module `src/lib/data/statistics.ts` — `STATISTIC_GROUPS` (15 entries, groups shaped `{ title, statistics }`, keys = the head-to-head keys plus `returnWinners`), `averageOf`, `rollingMean` (entry `i` = window ending at match `i + window − 1`), `windowChange` (rounded to 1 decimal), `WINDOW_OPTIONS`, `DEFAULT_WINDOW`, `parseWindow` (strict). `tests/statistics-rolling.spec.ts` pins labels, formats and `lowerIsBetter` against `H2H_GROUPS` plus the window arithmetic (19 tests).
- **follow-ups:**
  1. The catalogue restates the head-to-head card's labels to stay React-free; only the spec holds them in step. Moving the labels to a pure module would let both read one source.

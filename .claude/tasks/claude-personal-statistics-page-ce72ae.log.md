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

## T2 · Personal statistics loader: per-match values and the points read — done

- **gate:** mechanical pass · completion pass (re-run after the author amended criterion 3: total points won is a percentage on this page)
- **changed:** `src/lib/data/statistics.ts` gains the pure `toStatisticsMatches` and the types `StatisticValues`, `StatisticsMatchRow`, `StatisticsMatch`; `totalPointsWon` is now `total_points_won / total_points × 100` and `format: "percent"` in the catalogue (the rolling spec exempts that one key from the card format check). New `src/lib/data/statistics-server.ts`: `getPersonalStatistics(userId)` (`cache()`d, returns `{ matches, totalMatches }`) and `getPersonalStatisticsPoints(matchIds)` (cookie client, chunked by 100 ids, `null` on failure). `personal-matches-server.ts` selects `source_provider` and the eight catalogue columns. `playerSide` / `isMe` moved verbatim to a pure `src/lib/data/player-identity.ts`, re-exported from `player-identity-server.ts`. `tests/statistics-matches.spec.ts` pins the transform offline.
- **follow-ups:**
  1. Values are unrounded (rounding is the renderer's job after the mean) — the page UI must round before display.
  2. "Total points won" heads a percentage here and a count on the match report; consider a distinguishing label or unit.
  3. For derived (video) matches the card shows Aces and Winners from point tallies; here `values.aces` / `values.winners` are the published columns and may be null or differ on `isDerived` matches.
  4. `personal-kpis-server.ts` duplicates the `ProfileResult` construction now in `toStatisticsMatches`; note the season strip keeps matches with no stat row and this drops them.

## T3 · Statistics route: page shell, URL state model, loading and day-zero states, nav — done

- **gate:** mechanical pass · completion pass
- **changed:** `/dashboard/statistics` is a real page: `page.tsx` resolves the workspace (team → `/dashboard/team/statistics`), streams the title row and body inside `WidgetBoundary` > `Suspense`; `loading.tsx` exports `StatisticsSkeleton`. New under `src/components/dashboard/statistics/`: `statistics-search.ts` (pure URL contract + `applyStatisticsFilters`), `statistics-provider.tsx` (`useStatistics()` → `{ all, filtered, points, state, setState }`), `statistics-page-content.tsx`, `statistics-body.tsx` (one `<Slot>` per region — Filters, Season averages, Trend, By opponent type, All statistics, Rally length, How points ended), `statistics-placeholders.tsx`, `statistics-layout.tsx`, `statistics-title-row.tsx`, `statistics-day-zero.tsx`, `statistics-skeleton.tsx`. `nav.ts` drops `comingSoon` from the personal entry; `tests/search-palette-pages.spec.ts` updated because the ⌘K palette derives from nav. `MAP.md` already current. Specs: `tests/statistics-search.spec.ts`, `tests/statistics-page-states.spec.ts`.
- **follow-ups:**
  1. `AGENTS.md` (Routes bullet) and `.skills/advantage-analytics-design/reference/empty-and-loading.md` still describe `/dashboard/statistics` as coming-soon.
  2. Home's "Placement view" link points at `/dashboard/statistics`, which has no placement section.
  3. Points are awaited before the title row streams; on a long season, pass the promise down and `use()` it in the two point regions.
  4. Day zero offers only "View matches"; a true first-day player would be saved a hop by the standard "Send match video / Import instead" pair.
  5. `loading.tsx` always draws the skeleton; it could draw day zero on first paint the way Home and Matches do.
  6. The title row omits the frame's today's-date label; the column is `mx-auto`, following Home rather than the frame.

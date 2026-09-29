# Run log — claude/matchid-stats-filter-pills-079ab9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Land a statistic's cut into the shared filters so the drawer's pills are pressed — done

- **gate:** mechanical GATE PASS (after `npm ci` — the worktree's `node_modules` predated the `pglite`/`pg` devDependencies; not a task failure) · completion VERDICT: pass
- **changed:** `landFilmCut(shared, intent)` now returns `{ shared, remainder }` — the cut's `MatchFilters` keys replace the shared filters key by key, and only the `FilmCutExtras` (`rallyMin`/`rallyMax`/`ending`) + label survive as a Film-only remainder (`null` for a pure cut). The remainder lives in `MatchFiltersProvider` (`filmRemainder`/`setFilmRemainder`), above the view switch; `FilmRoom` keeps only `savedOnly`. `clearAll` clears all three. The list is shared ∧ `matchesFilmCutExtras` ∧ saved; the strip sentence adds "<label>, from Statistics" only while extras are in force; "Back to all points" only while the shared set still equals `remainder.landed` (and saved is off). New offline spec renders the real `FiltersPanel` on a landed "1st serve points won" cut and asserts exactly five pressed pills — Serve › Player, Serve › Type "First serve", Return › Player {opp} (the inverted `server` pill, a correction to the criterion's four), Result › Player, Result › Outcome "Won". `film-advanced-panel.tsx` adjusted to the new `FilmListFilters` shape; `match-report-context.tsx` doc comment only.
- **follow-ups:** 1. A pure cut lands no remainder, so its strip action reads "Clear filter" instead of "Back to all points"; after T6 makes Aces and rally bands pure they lose "Back to all points" too — decide whether a landed snapshot should be kept even with no extras. 2. `tests/match-filters-statistics.spec.ts` stubs `useMatchFilters` without the new `filmRemainder` fields (still passes; the card reads only `context`).

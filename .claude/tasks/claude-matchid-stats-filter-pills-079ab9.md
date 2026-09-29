# Tasks — claude/matchid-stats-filter-pills-079ab9

> Scope: Statistics → Video cuts land in the shared filters so the drawer's pills reflect them

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Land a statistic's cut into the shared filters so the drawer's pills are pressed

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/film/film-list-filters.ts, film/film-tab.tsx, match-filters/provider.tsx (or match-report-context.tsx), film-cut-context.tsx, tests/film-cut-intent.spec.ts, tests/film-filters-fullscreen.spec.ts (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `landFilmCut` returns `shared` with every `MatchFilters` key the cut sets replaced by the cut's value and every other key untouched, and a Film-only remainder holding ONLY `FilmCutExtras` keys (`rallyMin`, `rallyMax`, `ending`) plus the label, or `null` when the cut has no extras; `film-tab.tsx` writes that `shared` through `setShared` on landing. The `tests/film-cut-intent.spec.ts` test "landing a cut never writes to the shared filters" is rewritten to assert this, and asserts `matchFiltersQuery` now carries the cut's shared half
  - [ ] An offline spec (via `createLoader()` from `tests/fixtures/vm-modules.ts`) renders `FiltersPanel` with `filters={landFilmCut(…, sideCut({ serveType: ["first"] }, "you", "server", true)).shared}` and asserts `aria-pressed="true"` on exactly the Serve › Type "First", Serve › Player {you}, Result › Player {you} and Result › Outcome "Won" pills, and on no other pill
  - [ ] The landed remainder (label, extras, and the `MatchFilters` snapshot the landing wrote) is held above the view switch — in `MatchFiltersProvider` or `MatchReportProvider`, not in `FilmRoom`'s `useState`, which keeps only `savedOnly`; `filmFilters.clearAll` clears the shared filters, the remainder and `savedOnly` together, and a new landing replaces the remainder
  - [ ] The Film list is `applyMatchFilters(points, shared)` AND `matchesFilmCutExtras` AND saved, with no `MatchFilters` key of a landed cut evaluated anywhere except through `shared` (the remainder's type has no `MatchFilters` keys); a spec asserts that un-setting `serveType` on the landed `shared` widens the list back to every point the extras admit
  - [ ] `filmListSentence` reads the shared phrases, then `"<label>, from Statistics"` ONLY while extras are in force (a pure cut names nothing twice), then "saved"; `filmStripAction` reads "Back to all points" only while the remainder is non-null and `filtersEqual(shared, remainder.landed)`, else "Clear filter"; the sentence and action tests in `tests/film-cut-intent.spec.ts` and `tests/film-filters-fullscreen.spec.ts` are updated and pass
- **notes:** Root cause: `filter-rail.tsx:194` and `film-advanced-panel.tsx:55` seed `FiltersPanel` from `useMatchFilters().filters` / `filmFilters.shared`, while `landFilmCut` (`film-list-filters.ts:103`) keeps the whole cut in `FilmRoom`'s `local.cut`. T7 of claude-video-stats-filters-1facce's "never written to the provider" rule existed because Statistics then read the shared filters; since 4208ff1a Statistics is whole-match, so the `MatchFilters` half may land in the provider. Do NOT map the extras to pills (Result › Error would widen "Unforced errors"; Result › Winner would widen "Aces") — they stay Film-only, which is why they must be hoisted: leaving and re-entering Video with the shared half persisted but the extras reset would silently widen. Replace-per-key on landing (not intersect) so the clicked figure's own groups win; other shared groups still AND, so the list never exceeds the card's count. `FilmLocalFilters` may stay as the pure input shape the tab assembles from the provider's remainder + `savedOnly`. `MatchReportWhen` unmounts `FilmRoom`; the seek-on-landing effect (`film-tab.tsx:469-483`) keys on `local` identity, so keep that path working after the state moves. Keep `film-tab.tsx` and `film-list-filters.ts` free of `next/navigation` beyond what is there. Widget edits under src/components/dashboard trigger the widget-states hook; never put a `.tsx` beside a same-basename `.ts`. Read `docs/ui-revamp-guardrails.md`. The ui-verifier flow: open the match, on Statistics click a head-to-head "1st serve points won" cell, open the Video tab's "Advanced filters…" and expect the four pills pressed.

## T2 · Name a Film-only cut inside the filters drawer

- **status:** todo
- **model:** sonnet
- **needs:** T1
- **files:** src/components/dashboard/matches/match-detail/match-filters/filters-panel.tsx, match-filters/filter-rail.tsx, film/film-advanced-panel.tsx, tests/match-filters-panel.spec.ts (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `FiltersPanel` accepts an optional `filmCut?: string | null` (the landed remainder's label); when set it renders one read-only line with `data-film-cut=""` between the header and the sections, containing the label, "from Statistics", and that the strip's clear removes it; the line contains no `<button>` and no `aria-pressed`; nothing is rendered when it is null or absent
  - [ ] Both hosts pass it: `FilterRailShell` and `FilmAdvancedPanel` hand the remainder's label when T1's extras are in force and `null` otherwise, so a pure cut (every key a pill) shows no line
  - [ ] `tests/match-filters-panel.spec.ts` renders the panel through `createLoader()` with `filmCut="Short rallies · 1–4 shots"` and asserts the line's text, and with `filmCut={null}` asserts no `data-film-cut` element; the existing markup tests are unchanged
- **notes:** This is what the drawer shows for rally-length bands, "Unforced errors", "Aces", "Winners" and "Return winners": the pills their `MatchFilters` half sets are pressed (T1), and this line explains the rest of the footer count. Read `.skills/advantage-analytics-design/SKILL.md` first. Use DS type classes (`text-micro` / `text-[11px]` with `--ink-500`), no off-palette hex; `tone="dark"` must still resolve through the `.dark` token scope with no second set of classes. No `filters-panel.ts` beside the `.tsx`.

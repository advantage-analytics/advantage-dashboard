# Tasks — claude/opponents-page-build-a55d4b

> Scope: the personal Opponents page at /dashboard/opponents — loader, list page, peek drawer, nav flag

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

## T1 · Personal opponents loader + pure grouping module

- **status:** done
- **model:** opus
- **files:** (guess) new `src/lib/data/personal-opponents.ts` (pure grouping, no Supabase import), new `src/lib/data/personal-opponents-server.ts` (loader, `cache()`d), new `tests/personal-opponents.spec.ts`; reads `src/lib/data/personal-matches-server.ts` (scope predicate + viewer-side), `src/lib/data/match-utils.ts` (`matchOutcome`), `src/lib/data/person-name.ts` (`normalizedPersonName`), `src/lib/data/player-measures.ts`, `src/lib/data/team-roster-server.ts` (`RosterRecentMatch` / `RosterMeasure` shape to mirror)
- **done when:**
  - [ ] `getPersonalOpponents(userId)` in `personal-opponents-server.ts` reads `matches` with the personal predicate `created_by = userId AND program_id IS NULL` (the same one `personal-matches-server.ts` uses) plus the matching `match_stats_with_percentages` rows, and the Supabase server client is the only client it touches — no admin client.
  - [ ] Grouping lives in `personal-opponents.ts` as a pure function: the key is `opponent_player_id` when present, otherwise `normalizedPersonName(player2_name)`; each group carries `name`, `hand`, `backhand` (most recent non-null value, else null), `wins`/`losses` from `matchOutcome(score, isUserPlayer1)` (null outcomes counted in `played` but in neither), `form` (last five, oldest first, `"win" | "loss" | "pending"`), `lastMatch` (`{ id, date, won, sets }`), and `played` / `analyzed` counts.
  - [ ] Each group also carries `recent` (newest first, at most six, each with `values: Record<measureKey, number | null>` from the viewer's side of the stats row) and `measures` for exactly these four keys in this order: `total_points_won_pct`, `first_serve_won_pct`, `first_return_won_pct`, `break_points_converted_pct` — each `{ key, label, value, trend }` with `value` the mean over `recent`'s non-null points and `null` when nothing measured it.
  - [ ] The loader returns groups sorted by last-match date descending, plus page totals `{ opponents, matches, won, analyzed }`, and a `season` helper (or field) marks whether a match falls in the current `academicSeason()` (`src/lib/schedule/format.ts`) so T3's "This season" chip filters without re-deriving it.
  - [ ] `tests/personal-opponents.spec.ts` imports the pure module only and covers: two spellings of one name collapse to one row; an `opponent_player_id` beats the name; a match with no decidable score is `pending` in form and in neither win nor loss; hand/backhand take the latest non-null value; `measures[].value` is null when no match carries stats.
- **notes:** Design: artboard `project/Main.dc.html` in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV. Personal workspace only. No sample data. No migration — columns verified against the live DB 2026-10-10: `player2_name`, `opponent_hand` (`right|left`), `opponent_backhand` (`one-handed|two-handed`), `opponent_player_id` (uuid) all exist. **`opponent_player_id` is NULL on every live row (0/60)** — the name fallback is the real path today, not an edge case. `matches.result` is free text and must not be read for the outcome; `score` via `matchOutcome` is the rule. Do NOT extend `opponents-server.ts` — it is program-keyed (conference directory, pooled public-record views) and nothing in it takes a user id; this loader sits beside it. Mirror `team-roster-server.ts` for the drawer shape and `personal-matches-server.ts` for how the viewer's side (`isUserPlayer1`) is decided — never normalise `player1_id` (two id spaces, see `my_player_ids()`).

## T2 · Opponents list page: title row, table card, footer, skeleton, day zero

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** (guess) `src/app/dashboard/opponents/page.tsx` (personal branch renders the page; team branch keeps the existing `ComingSoonPage` call verbatim), new `src/components/dashboard/opponents/opponents-title-row.tsx`, `opponents-table.tsx`, `opponents-table-layout.ts` (grid string, no JSX), `opponents-skeleton.tsx`, `opponents-day-zero.tsx`, `opponents-page-content.tsx` (client; owns selection state for T4); reads `matches/matches-title-row.tsx`, `matches/matches-day-zero.tsx`, `matches/matches-skeleton.tsx`, `shared/form-ticks.tsx`, `dashboard/result-mark.tsx`, `ui/empty-mark.tsx`, `lib/ui/score-format.ts`, `matches/player-hands.ts`
- **routes:** /dashboard/opponents
- **done when:**
  - [ ] `page.tsx` branches on `getWorkspaceContext().kind`: `team` still renders the existing `ComingSoonPage` with its current props, `personal` renders the new page inside a `Suspense` whose fallback is `OpponentsSkeleton` (built only from `PendingBar`/`PendingRegion`, real "Opponents" h1 and the eight column labels as text, pulsing rows) — no route-level `loading.tsx`, so the team stub never flashes a skeleton.
  - [ ] The title row is `MatchesTitleRow`'s composition (`text-display` h1, 9px gap, `text-body-sm` subline + `text-micro` client-side date) reading "Opponents" with the subline "N opponents · N matches · N won" from T1's totals, and it has NO primary button (no "Merge duplicates", no New match).
  - [ ] One `surface-card` table with header row in `eyebrow-sm` and 52px rows on the grid `minmax(150px,1fr) 92px 92px 56px 72px 72px 60px 116px` (column-gap 16px, exported from `opponents-table-layout.ts` and imported by both the table and the day-zero ghost): Opponent (13/500 ink-900, truncating `<button aria-pressed>`), Hand and Backhand as "Right-handed" / "Left-handed" / "One-handed" / "Two-handed" at 12px ink-600 with `EmptyMark` when null, Record "W-L" tabular, Form via `FormTicks`, Last match date 12px tabular ink-700, Result via `ResultMark` (`EmptyMark` when `won` is null), Score via the shared score-line formatter with tiebreak superscripts; hover = surface-muted wash on an 8px-inset rounded row, no hairlines between rows, no chevron.
  - [ ] Under the card a footer line "N of N opponents · N of M matches analyzed" in `text-micro tabular` with a single 11px/500 blue link "Open Statistics" to `/dashboard/statistics`.
  - [ ] With zero personal matches the page renders `OpponentsDayZero` instead: the shared `DayZeroOffer` (one sentence, one action "New match" → `/dashboard/matches/new`) over the page's own shape at 0.32 and `inert` — toolbar, the card with its eight real column labels over five ghost rows — and no title row, exactly as `matches-day-zero.tsx` does.
- **notes:** Design: artboard `project/Main.dc.html` in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV — copy the layout from the frame, not from this text. Personal workspace only; the team branch is untouched on purpose (T5 explains why the stub call must stay literally in `page.tsx` until then). Exclusions: no "Merge duplicates" button, no Advantage Intelligence pattern note. No sample data anywhere, including the skeleton and day zero. The frame puts the fluid column FIRST (Opponent) while `reference/tables.md` law 1 (2026-10-02) says the last column takes the slack — follow the frame (author's instruction) and leave a one-line comment on the grid constant naming the deviation. Read `.skills/advantage-analytics-design/SKILL.md` + `reference/tables.md` + `reference/empty-and-loading.md` first. T3 adds the chip row and the toolbar triggers; T2 may render the toolbar row as the frame draws it with the chips/triggers inert or leave the slot for T3 — either way the frame must not move when T3 lands. Row click selection is T4's; render the `aria-pressed` button now with no handler.

## T3 · Opponents view chips, sort menu and filter panel

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/opponents/opponents-page-content.tsx`, new `opponents-view-chips.tsx` (or reuse the 26px pill anatomy from `matches/lifecycle-chips.tsx`), new `opponents-filter-panel.tsx`; reads `shared/list-toolbar-trigger.tsx` (`FilterTrigger`/`SortTrigger`), `ui/float-menu.tsx`, `matches/matches-filter-panel.tsx` (panel + applied-strip pattern), `shared/table-empty-body.tsx`
- **routes:** /dashboard/opponents
- **done when:**
  - [ ] A fixed four-chip view switcher — "All" · "This season" · "Played 3 or more" · "Never beaten" — 26px, hairline border, `aria-pressed`, no counts and no dots; active = `--border-medium` + surface-subtle + ink-900. "This season" keeps opponents with at least one match in the current `academicSeason()`, "Played 3 or more" keeps `played >= 3`, "Never beaten" keeps `wins === 0`.
  - [ ] `SortTrigger` reads the active sort ("Last played" by default) and opens a `FloatMenu` with exactly: Last played (newest first) · Name (A–Z) · Most played; the table re-orders client-side and the trigger label follows the selection.
  - [ ] `FilterTrigger` opens one panel with two segmented facets under an "Opponent" heading — Hand (Any · Right · Left) and Backhand (Any · One-handed · Two-handed) — a live "N of M" count and a quiet "Clear all" in its footer; on apply the panel closes and a one-line strip states the cut ("Left-handed · Two-handed · 3 of 10 · Clear filter") — no chips, no badge; the trigger takes the engaged wash while a filter is on.
  - [ ] When a chip or filter leaves nothing, the card keeps its header row and renders `TableEmptyBody` with one sentence; the title row, chips and footer stay exactly where they were (the footer's "N of M opponents" reads against the filtered set).
  - [ ] A small spec (`tests/opponents-views.spec.ts`) imports the pure chip/sort/filter predicates and asserts each of the three chips and each facet against a fixture of four grouped opponents.
- **notes:** Design: artboard `project/Main.dc.html` in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV — the frame shows the four chip labels and the two triggers; the sort-menu items and the two filter facets are not drawn there and are this task's proposal (Opponent facets per `tables.md` rule 6) — the author may trim them. Personal workspace only. No sample data. Keep the predicates in a module with no JSX so the spec can import them (see `tests/fixtures/vm-modules.ts` if the import chain pulls in client code).

## T4 · Opponent peek drawer on the roster shell + selection model

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** (guess) new `src/components/dashboard/opponents/opponent-drawer.tsx`, `src/components/dashboard/opponents/opponents-page-content.tsx` (selection state), `opponents-table.tsx` (row ids + `aria-pressed` + wash); reads `matches/match-drawer.tsx` (`PeekDrawerFrame`, `DRAWER_ATTR`), `team/player-drawer.tsx` (identity block, `Sparkline`, `StatPill`, `hasStats` gate, `RECENT_MATCH_GRID` from `player-drawer-layout.ts`), `team/roster-view.tsx` (select/close/toggle/step, window keydown, `syncUrl`)
- **routes:** /dashboard/opponents, /dashboard/opponents?opponent=<key>
- **done when:**
  - [ ] Clicking a row opens a 340px drawer rendered through `PeekDrawerFrame` (kind "Opponent", counter "n / N", ↑↓ stepping, divider, X; no ⋯ since it has no items) beside the table so the table reflows; the selected row keeps the surface-muted wash and `aria-pressed="true"`; re-clicking the selected row, Esc, or the X closes it; ↑/↓ step to the adjacent opponent in the current (chipped/sorted/filtered) order and scroll its row into view; the selection mirrors into `?opponent=<group key>` with `history.replaceState` and a page load with that param lands open.
  - [ ] Body, top to bottom: identity (`items-start`, 48px initials avatar, name as an `h2 text-title-lg` link to `/dashboard/statistics` that wraps and never truncates, line "Right-handed · Two-handed backhand" with `EmptyMark`-style dashes for unknowns, line "W-L against you · N of M analyzed"), then the stat block, then Recent matches, then the pinned footer.
  - [ ] The stat block renders only when any of the four `measures[].value` is non-null (`hasStats` gate as in `player-drawer.tsx`): header label + 16px value + delta from `trend`, the `Sparkline` over `recent`'s non-null points with first/last date under it, and the four 26px `StatPill`s (`aria-pressed`) that switch the chart; when nothing is measured the block is absent and one sentence under Recent matches says the numbers appear once a match against this opponent is analyzed.
  - [ ] Recent matches: `eyebrow-sm` "Recent matches" with an "All N" 11px blue link to `/dashboard/matches` (shown only when N > 0), then up to three record rows on `RECENT_MATCH_GRID` — `ResultMark`, event/tournament name (or "Match" when none), score, mono date, trailing `chevron-right` 12px ink-300 — each a `Link` to `/dashboard/matches/<id>`.
  - [ ] Footer pinned to the bottom: ghost "Ask about {first name}" → `/dashboard/ask` and `advButton("primary","md")` "Open statistics vs. {first name}" → `/dashboard/statistics`; both links present for every opponent.
- **notes:** Design: artboard `project/Main.dc.html` in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV — copy the drawer's layout from the frame. Exclusions: the Advantage Intelligence pattern note (the grey `surface-page` box with the engine chip) is NOT built; "Merge duplicates" is not in the ⋯ either, so omit the ⋯. Personal workspace only. No sample data. `PeekDrawerFrame` IS the roster shell (same `roster-drawer-in/out` width keyframes, `DRAWER_ATTR`) — use it rather than a third copy; `Sparkline` and `StatPill` are module-private in `player-drawer.tsx` today — export them from there (or lift to `shared/`) rather than re-drawing. Both Statistics and Ask are `ComingSoonPage` stubs today; the links still point there per the author's instruction. Read `reference/tables.md` → Peek Drawer before building.

## T5 · Lift the personal comingSoon flag, amend the two nav tests, npm run map

- **status:** todo
- **model:** sonnet
- **needs:** T2, T3, T4
- **files:** (guess) `src/lib/dashboard/nav.ts`, `tests/nav-icons.spec.ts`, `tests/search-palette-pages.spec.ts`, `src/app/dashboard/opponents/page.tsx` (doc comment only), `MAP.md`
- **routes:** /dashboard/opponents
- **done when:**
  - [ ] `PERSONAL_NAV`'s Opponents entry has no `comingSoon` line; `TEAM_NAV`'s keeps `comingSoon: true`; the long comment above `TEAM_NAV` gains one sentence saying the personal page shipped and the team one is still the stub.
  - [ ] `tests/nav-icons.spec.ts` "a nav entry is flagged exactly when its page renders ComingSoonPage" passes with the split: it carries an explicit, commented allowlist of routes that are coming-soon in one workspace only (`{"/dashboard/opponents": { personal: false, team: true }}`) and asserts each list's flag against that map, while every other route keeps the original file-text rule.
  - [ ] `tests/search-palette-pages.spec.ts` "coming-soon pages are never shortcuts" expects "Opponents" to be ABSENT from the team shortcuts and PRESENT in the personal ones; the loop no longer lists Opponents as a stub for both kinds.
  - [ ] `page.tsx`'s doc comment no longer says the page is "not finalised" for personal; `npm run map` has been run and `MAP.md` is byte-identical before and after (no new route) — `tests/generate-map.spec.ts` passes.
- **notes:** Personal workspace only — the team workspace keeps the stub and its flag, which is why the tests are amended rather than the stub removed. Both specs are pure Node specs (no browser); run `npx playwright test tests/nav-icons.spec.ts tests/search-palette-pages.spec.ts tests/generate-map.spec.ts` before handing back. `src/components/dashboard/sidebar/rail-item.tsx` reads the flag for the tooltip and aria-label — no change needed there.

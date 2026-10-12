# Run log — claude/opponents-page-build-a55d4b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Personal opponents loader + pure grouping module — done

**gate:** mechanical pass · completion pass

**changed:** New `src/lib/data/personal-opponents.ts` (pure grouping: key = `opponent_player_id` else normalised opponent name; record, last-five form, last match, `recent` ×6, four measures, season helpers, totals), `src/lib/data/personal-opponents-server.ts` (`getPersonalOpponents(userId)`, `cache()`d, server client only, own `matches` read on `created_by = userId AND program_id IS NULL` + `match_stats_with_percentages`), `tests/personal-opponents.spec.ts` (15 offline tests). Deviations kept: viewer side via `playerSide()` + `getMyPlayerIds()`; name key is side-aware (`player1_name` when the viewer sits as player 2); matches naming no opponent are left out, so `totals.matches` counts matches against a named opponent; dates are stored ISO values; matches where `playerSide` is null are dropped.

**follow-ups:**

1. Merge a name group into the id group it matches once `opponent_player_id` starts being written.
2. Add a short `pill` label beside `label` on measures if the drawer wants "Pts won"-style pills.
3. Expose an `unattributed` count for matches with no opponent named.
4. `currentSeason` reads the clock in UTC — a user-zone clock would be exact around Aug 1.
5. The PostToolUse typecheck hook picks up the main checkout's `_video/` errors from inside a worktree.
6. Confirm at /pr-check that a `created_by = me` match is never legitimately dropped by the null-`playerSide` skip.

## T2 · Opponents list page: title row, table card, footer, skeleton, day zero — done

**gate:** mechanical pass (lint + typecheck clean; full suite failed twice on unrelated load-only flakes under a machine load average of ~26 — run 1: 7 failures in event-table / film-playback-refresh / match-video-attachment-flow / match-video-azure-smoke / match-video-file-step / schedule-doubles-picker, all 7 passed re-run alone; run 2: 5,816 passed, 2 failed, `film-playback-refresh.spec.ts:571` and `match-video-attachment-flow.spec.ts:1015`, both 4/4 alone with `--repeat-each=4`; none reachable from this diff) · completion pass · widget-states audit: loading ✓, empty ✓, error ✓

**changed:** `src/app/dashboard/opponents/page.tsx` branches on workspace kind — team keeps the literal `ComingSoonPage` call, personal renders `getPersonalOpponents` inside `Suspense` with `OpponentsSkeleton`, wrapped in `WidgetBoundary`. New `src/components/dashboard/opponents/`: `opponents-table-layout.ts` (grid, labels, row box, page frame), `opponents-title-row.tsx`, `opponents-table.tsx`, `opponents-page-content.tsx` (client; holds `selectedKey` for T4), `opponents-skeleton.tsx`, `opponents-day-zero.tsx`, `opponents-toolbar.tsx` (the frame's toolbar drawn inert for T3), `opponent-style.ts` (hand/backhand labels). Deviations kept: day zero fires on `opponents.length === 0` (loader has no raw match count); card `min-w-[822px]` rather than the frame's 720px; shared `FormTicks` and comma-joined score sets kept; no `cursor-pointer` until T4; counts singularised. Not opened in a browser.

**follow-ups:**

1. Return a raw personal-match count from the loader so "no matches" and "matches, none naming an opponent" get different copy.
2. Widen the Last match column when any row needs the year, as Matches does.
3. `formatShortDate` parses date-only ISO as UTC — the cell can read a day early in US zones (shared with Matches).
4. Skeleton shows the h1, day zero drops it — an empty account sees the title flash; reuse the layout's presence read.
5. Give `WidgetBoundary`'s retry state the page padding on this route.
6. Add an offline spec for `opponent-style.ts`.
7. Confirm the 822px card floor and form-tick alignment at /pr-check eyes-on.

## T3 · Opponents view chips, sort menu and filter panel — done

**gate:** mechanical pass (lint + typecheck clean; full suite 5,837 passed, 4 failed under a machine load average of 20–65, none reachable from this diff: `film-playback-refresh.spec.ts:1422` and `:1455`, `schedule-drawer-actions.spec.ts:270`, `viz-fullscreen-filters-browser.spec.ts:317`. Repeated alone ×3 at load ~10: schedule-drawer and viz-fullscreen 3/3 each variant; the two film T16 tests passed 2 of 3 each, the miss a 30 s timeout — intermittent, in the file already recorded as a load-only flake. Counted as passed on that basis; worth a clean re-run at /pr-check) · completion pass · widget-states audit: loading ✓ (skeleton and day zero keep the inert toolbar), empty ✓ (`TableEmptyBody` under the kept header row), error ✓

**changed:** New `src/components/dashboard/opponents/opponents-views.ts` (pure chip / facet / sort predicates, labels, `applyOpponentCut`, strip and empty-sentence copy) and `tests/opponents-views.spec.ts` (29 tests). `opponents-toolbar.tsx` gains the live `OpponentsToolbar` (four chips via the shared `Chip`, `SortTrigger` + `FloatMenu`, `FilterTrigger` through the shared `MatchesFilterPanel`); `OpponentsToolbarStatic` stays inert for the skeleton and day zero. `opponents-page-content.tsx` owns the cut state, applied strip, empty body and footer count, and exposes `visibleOpponents` for T4. `opponents-table.tsx` gains an `empty` slot. Deviations kept: the filter panel applies live and closes on outside click / Esc (shared panel, no Apply button) rather than "on apply"; panel and strip "N of M" read against the current chip's set; chips use `schedule/static/chip.tsx`; empty-body icon is the Opponents nav icon. Not opened in a browser.

**follow-ups:**

1. Eyes-on: filter panel placement on a right-side trigger, the strip, and the empty body inside the 822px card.
2. One constant for the Opponents nav icon and the empty-body icon.
3. Decide whether the cut (chip, filter, sort) should survive a reload via URL params.
4. If a literal close-on-apply is wanted, add an opt-in to `MatchesFilterPanel` as its own task — it affects Matches and Schedule.
5. The two film T16 tests (`film-playback-refresh.spec.ts:1422`, `:1455`) time out intermittently even when run alone on a busy machine — add them to the known-flake notes or harden them.

## T4 · Opponent peek drawer on the roster shell + selection model — done

**gate:** mechanical pass (lint, typecheck, full suite clean at a load average of ~5) · completion pass · widget-states audit: loading ✓ (drawer reads props already on the page — no fetch, no skeleton), empty ✓ (stat block absent when nothing is measured, one sentence in its place; unknown hand/backhand draw `EmptyMark`), error ✓ (inside the page's `WidgetBoundary`)

**changed:** New `src/components/dashboard/opponents/opponent-drawer.tsx` (`OpponentDrawer` through `PeekDrawerFrame`: identity, gated stat block with `Sparkline` + four `StatPill`s, up to three recent-match record rows, pinned Ask / Statistics footer; no ⋯, no Advantage Intelligence note). `opponents-page-content.tsx` gains the roster selection model (toggle, close, step over `visibleOpponents`, window keydown, `?opponent=` via `history.replaceState`, close when a cut hides the selection); `opponents-table.tsx` gains row ids, the click handler, the selected wash and `cursor-pointer`; `page.tsx` reads `searchParams.opponent`. `Sparkline` / `StatPill` lifted verbatim from `team/player-drawer.tsx` into new `shared/drawer-stat-chart.tsx` (roster drawer now imports them; `percent` renamed `drawerPercent`). T1's `personal-opponents.ts` / `-server.ts` gain `recent[].event` from `matches.tournament_name`. Deviations kept: recent-row date is "Sep 14" this year, "Sep ’25" otherwise; pills carry the full label and a trend delta; drawer is `hidden lg:block` as on Matches. The subagent reported it did NOT read `docs/ui-revamp-guardrails.md` or the design SKILL.md in full — the guardrails pass at /pr-check is the first check against them. Not opened in a browser.

**follow-ups:**

1. Eyes-on: slide-in and reflow, Esc and arrows, cut-hides-selection close, and the roster drawer unchanged after the chart lift.
2. Sparkline tooltip reads "{opponent name} · date" inside that opponent's own drawer — a `caption` on `SparkPoint` could carry the event name.
3. "W-L against you" could be read as the opponent's record — consider "You lead 5-2".
4. Lift `PeekDrawerFrame` / `DRAWER_ATTR` out of `matches/match-drawer.tsx` into `shared/`.
5. A small-screen fallback for peek drawers (Matches and Opponents).
6. An offline spec for the selection model, ideally after extracting a hook shared with the roster view.

## T5 · Lift the personal comingSoon flag, amend the two nav tests, npm run map — done

**gate:** mechanical pass (lint, typecheck, full suite clean) · completion pass · widget-states: `page.tsx` change is its doc comment only — no state affected

**changed:** `src/lib/dashboard/nav.ts` — `PERSONAL_NAV`'s Opponents entry loses `comingSoon`, `TEAM_NAV`'s keeps it, and the comment above `TEAM_NAV` says the personal page shipped. `tests/nav-icons.spec.ts` gains the commented `splitByWorkspace` allowlist (`/dashboard/opponents`: personal false, team true) and asserts each list against it. `tests/search-palette-pages.spec.ts` expects Opponents absent from team shortcuts and present in personal ones, and the exact personal label list now includes "Opponents". `page.tsx` doc comment reads "not finalised for a team". `npm run map` reported MAP.md already current (byte-identical).

**follow-ups:**

1. `AGENTS.md`'s Routes section still lists `/dashboard/opponents` among the pages that render `ComingSoonPage` — now true for the team workspace only.
2. The remaining comment lines above `TEAM_NAV` about the Opponents stub want a pass once the team page is built.

## T6 · Migration: opponent_program_id + opponent_school on matches, grants, applied live — done

**gate:** mechanical pass · completion pass (checked against the live database)

**changed:** New `supabase/migrations/20261012003309_matches_opponent_program.sql`, applied live as version `20261012003309`: `matches.opponent_program_id uuid null references programs(id) on delete set null`, `matches.opponent_school text null`, CHECK that at most one is set, partial index on `opponent_program_id`, column grants to `authenticated` and `service_role`, two column comments. No policy changed (four policies identical before and after); 0 rows carry either column. Deviation: the task's reason for the column grants was false — `matches` has a table-wide grant to `authenticated` and no real column ACLs (only `users` has them), so the grants are redundant; they were kept and the file's comment says so. No generated Supabase types file exists in the repo, so none was updated.

**follow-ups:**

1. AGENTS.md / memory: "every new column needs a column grant" is true for `users` only (the one table with column-scoped grants).
2. `program_event_entries.opponent_program_id` and the new `matches` pair can disagree for a match with an `event_entry_id` (0 such matches today) — decide which wins, or backfill.

## T7 · Lift the personal page's selection model onto `useRowSelection` — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (selection logic only)

**changed:** New `src/components/dashboard/schedule/row-selection-model.ts` (pure reducer: `initialRowSelection`, `rowSelectionReducer` with select / toggle / close / step / cutHid / finishClose). `use-row-selection.ts` is now a thin wrapper over it with `rowId` and `focusTarget` options and a `[data-row-keys="ignore"]` stand-down. `opponents-page-content.tsx` drops its hand-copied model and calls the hook; `opponents-table.tsx`'s `onToggle` takes `(key, viaKeyboard)`; the Opponents toolbar root and `MatchesFilterPanel`'s `PopoverContent` carry `data-row-keys="ignore"`. Behaviour notes: for existing hook callers (dual and tournament detail) a row that leaves `ids` during the close slide-out now finishes sliding out rather than vanishing; on Opponents, keys also stand down inside alert dialogs, an `?opponent=` naming no listed row is stripped from the URL on mount, and a refresh that leaves the selection outside the current cut clears the drawer at once. Not opened in a browser.

**follow-ups:**

1. Eyes-on for Opponents: deep link, cut-hides-row slide-out, Esc focus return, arrows on a chip or sort trigger not stepping the drawer.
2. `close()` with nothing open still sets `closing` for 240ms — could be a no-op in the model.
3. `team/roster-view.tsx` and the Matches page keep their own copies and lack the `data-row-keys` guard — a separate branch.
4. `schedule/README.md` could mention `row-selection-model.ts`.

## T8 · Offline spec for the row-selection model — done

**gate:** mechanical pass · completion pass

**changed:** New `tests/row-selection-model.spec.ts` (30 tests, pure import): toggle, close → finishClose, stepping over a filtered order and stopping at both ends, `cutHid` clearing a hidden selection and standing down while closing, initial state from `(ids, initialId)`, `openedByKeyboard` after keyboard and pointer actions, same-object identity on no-op transitions, and position derived from `drawerId` during a close. To make position testable, `row-selection-model.ts` gains the pure selector `rowSelectionPosition(state, ids)` and `use-row-selection.ts` calls it (same expressions, moved).

**follow-ups:**

1. Make `close` an identity no-op when nothing is selected or open.
2. Make `finishClose` stand down unless `closing` is true (a stray `onClosed` can leave a selected row with no drawer).
3. Decide whether `step` from a selection not in `ids` should be a no-op in both directions (today ↓ lands on the first row, ↑ does nothing).
4. `use-row-selection.ts`'s DOM side (key-guard selectors, URL mirror, focus return) has no direct test.

## T9 · Wizard data: team keys, persistence, history prefill, richer directory search — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (`DetailsStepContent.tsx` changed in callbacks and a prop type only, no markup)

**changed:** New `new-match-wizard/opponent-team.ts` (pure: `opponentTeamColumns` for inserts, `opponentTeamUpdate` for updates, `opponentTeamFromHistory`) and `tests/opponent-team.spec.ts` (23 tests). `formData` gains `opponentTeamProgram` / `opponentTeamSchool` / `opponentTeamSource`, reset with Start over and on a line swap; the line's own `opponentProgramKey` / `opponentSchool` are only read. Save: inserts write both columns (explicit nulls when empty); a reuse-update writes both when the field is set or a dual line's program resolves, and NEITHER when the field is empty — amended after the first handback so a wizard re-save cannot wipe a team set later from the edit dialog or the drawer (differs from the criterion's literal "writes the same two keys"; reviewer accepted). `opponentsPlayed` rows carry the most recent match's team via the `matches_opponent_program_id_fkey` embed; picking or typing a known opponent prefills with source "history". `searchPrograms` and `/api/programs/search` return `id`, `schoolAbbrev`, `crestUrl` through a follow-up `programs` read (the `search_programs` RPC was not widened — that needs DDL and resets its anon grant). Guardrail-protected inputs untouched. The FK embed has not been exercised against live PostgREST.

**follow-ups:**

1. A dual line with a hand-typed school and no program key saves no team — `line.opponentSchool` could fall back into `opponent_school`.
2. "Most recent match" is literal: a newer match with no team makes history forget an older one.
3. The line fallback does not exclude the workspace's own program id (`program_event_entries` has such a CHECK, `matches` does not).
4. `tests/fixtures/local-supabase/live-baseline.sql` lacks the two new `matches` columns.
5. `tests/upload-start-over.spec.ts`'s `RESET_FIELDS` could list the three new keys.
6. Fold `id` / abbrev / crest into `search_programs` in a later migration to drop the second read.
7. Confirm the `opponent_program:programs!matches_opponent_program_id_fkey` embed on a real request (eyes-on, team wizard).

## T16 · ProgramCrest: short code, fixed letters, three characters, never wraps — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (a presentational tile)

**changed:** New `src/lib/ui/crest-letters.ts` (`crestLetters(shortCode, name)`: a 1–3 character short code uppercased, else `getInitials(name)` capped at three) and `tests/crest-letters.spec.ts`. `ProgramCrest` takes `shortCode?`, sets letters at 9px / 0.2px tracking in the 26px tile (10px at 38 and 52, 16px at 64, unchanged), and the tile is `flex-none overflow-hidden whitespace-nowrap leading-none`. No caller edited; none passes `shortCode` yet. Visible change for existing callers: 26px tiles go from 10px to 9px letters. A one-word name with no usable short code still gives one letter ("Stanford" → "S") because `getInitials` was kept unchanged.

**follow-ups:**

1. If one-word names should show three letters ("STA"), that changes every existing caller — its own task.

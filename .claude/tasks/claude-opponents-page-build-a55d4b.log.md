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

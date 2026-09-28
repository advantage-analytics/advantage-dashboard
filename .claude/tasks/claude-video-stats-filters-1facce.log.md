# Run log — claude/video-stats-filters-1facce

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add court-half, shot-direction and spin helpers for match filters — done

**gate:** mechanical pass (after `npm ci` refreshed a stale node_modules missing `pg` and `@electric-sql/pglite`); completion pass
**changed:** New `match-filters/shot-geometry.ts` (`hitterHalf`, `shotDirection`, `inferHand`, plus `backhandHalf`/`isForehand`) and `match-filters/spin.ts` (`normalizeServeSpin`, `normalizeReturnSpin`), with `tests/match-filters-geometry.spec.ts` (21 tests). Deuce = x > 0 at the low-y end and x < 0 at the high-y end, anchored in the spec to `serveCourtSide()` in `derivation/court.ts`. Nothing under `supabase/` and no `shots.zone` derivation touched.
**follow-ups:**

1. `shotDirection` counts any `shotType` containing "forehand", so a forehand volley from the backhand half can read Inside Out/In; consider limiting it to groundstrokes.
2. Once `courtSideOf` moves into `match-filters/model.ts` (T3), add a spec asserting that a 0-0 serve gets the same answer from `courtSideOf` and `hitterHalf`.
3. `viz-model.ts` `getPointSide` and `film/filters/types.ts` `courtSideOf` both derive deuce/ad from score parity; merge them into one helper during the cleanup.

## T2 · Expose the raw point score and both players' hands to the match page — done

**gate:** mechanical pass; completion pass
**changed:** `MatchPoint.pointScoreRaw?: string | null` is now filled from `points.point_score` with no fallback; `pointScore` keeps its `?? "0-0"`. It is optional so the full-literal `MatchPoint` fixtures stay valid, and the loader always sets it. New `src/components/dashboard/matches/player-hands.ts` adds `normalizePlayerHand` and `playerHands(match, youIsPlayer1)`. `match.player1/2.hand` are already assigned to the right seat server-side (`match-detail-server.ts:183-186`), so the helper only normalises each seat and does NOT swap on `youIsPlayer1`. Specs: `tests/player-hands.spec.ts` and `tests/point-score-raw.spec.ts`, the second driven through `getMatchPointsFromSupabase` with a fake client.
**follow-ups:**

1. T3 should build `ctx.hands` as `playerHands(match).playerN`, falling back to `inferHand(points, isPlayer1)` when that is null; that composition does not exist yet.

## T3 · Build the shared MatchFilters model and predicates — done

**gate:** mechanical pass; completion pass
**changed:** New pure `match-filters/model.ts`: `MatchFilters`, `EMPTY_MATCH_FILTERS`, `applyMatchFilters`/`matchesPoint`, `buildFilterContext` (`playerHands`, falling back to `inferHand`), `optionAvailability`, `serializeMatchFilters`/`parseMatchFilters` (compact `_`/`.` form), `activeFilterCount`, `filtersEqual`, `toggleMatchFilter`, `MATCH_FILTER_OPTIONS`/`SECTIONS`/`KEYS`. New `match-filters/score.ts` holds `courtSideOf`, `isDeucePoint`/`isGamePoint` and the score parsing moved out of `film/filters/types.ts` (which now imports and re-exports them; no behaviour change), plus `courtSidesOf` and `normalizePointScore`. `tests/match-filters-model.spec.ts` has 25 tests.
Implementer's own calls:

- Service Winner and double fault are credited to the SERVER. On the live data the last shot row is usually the returner's (377/421 service winners, 81 double faults).
- Every point of a 6-6 game is treated as a tiebreak, so it never matches the Points grid. This could misfire in advantage sets.
- A winner with no shot rows goes to the point winner; an error goes to the point loser.
- A return contact exactly 1.0 m behind the baseline is Middle.
- A Result player picked alone narrows nothing; it only sets the point of view.
  **follow-ups:**

1. `point-endings-card.tsx` and head-to-head's derived path credit Service Winners to `p.player` (usually the returner), so their winner counts will disagree with the new filter's Winner count. This matters when T7 maps the "Winners" cut.
2. `applyFilmFilters` could use `courtSidesOf` instead of its own game walk (moot once T8 deletes it).
3. T5 decides whether a group with at most one available option is hidden (the plan says a one-set match shows no Sets group).

## T5 · Build the FiltersPanel from the mockups — done

**gate:** mechanical pass; completion pass. Widget states: loading n/a (renders from props, no fetch or Suspense); empty ✓ ("No filterable points in this match.", no `return null`); error n/a until T6/T7 mount it inside a region.
**changed:** New `match-filters/filters-panel.tsx` (`FiltersPanel`: "Filters" title, blue-text Clear all with no icon, collapsible Score/Serve/Return/Result/Custom sections from the model's catalog, `rounded-full` pills with `aria-pressed`, a Points grid laid out server-column × returner-row, and an `advButton` Apply that is disabled until the draft differs). New `match-filters/panel-draft.ts` holds the pure draft logic (`panelSections`, `draftToggle`, `draftClear`, `panelActions`, `initialOpenSections`, `pointGridCell`). `model.ts`: the Custom player group is now labelled "Choose Player". `tests/match-filters-panel.spec.ts` renders through `createLoader()`. Not yet mounted anywhere.
**follow-ups:**

1. A URL filter the match can't produce (e.g. Ad-40 on a video match) is still applied but its pill isn't drawn, so only Clear all removes it. T6/T7 should either draw selected-but-unavailable pills or drop unavailable values when parsing.
2. The draft is seeded from `filters` only on mount, so hosts should remount with `key={serializeMatchFilters(filters)}`.
3. The DS filter-panel rule wants a live match count in the footer; T6/T7 can pass one in.

## T4 · Add MatchFiltersProvider with a URL mirror, replacing set scope — done

**gate:** mechanical pass (branch merged with origin/splitstep-integration incl. PR #303 first; merged tree passed the gate before T4 ran); completion pass. Widget states: loading unchanged (the Suspense/`MatchReportPending` boundary is re-nested, not altered); empty ✓ (cards filtered to zero points name the filters; head-to-head's derived rows show em dashes via a value-level null, never zeros); error unchanged.
**changed:** New `match-filters/provider.tsx` (`MatchFiltersProvider({ initialQuery })`; `useMatchFilters()` returns filters, setFilters, clearFilters, filteredPoints, filtersActive and context, and is safe with no provider), mounted above `MatchReportProvider` in `[matchId]/page.tsx` and in `/m/[token]/page.tsx`. Filters are seeded server-side from `?f=` and written back with `history.replaceState(null, …)`, keeping other params and dropping `f` when empty; a `popstate` listener re-applies `?f=` on Back/Forward. `model.ts` gains `MATCH_FILTERS_PARAM = "f"` and `matchFiltersQuery`. Head-to-head, the performance tracker, rally length and point endings read `filteredPoints`; head-to-head's derived path is gated on `filtersActive`, and its hover counts are taken over the filtered points. `useSetScope`, `parseSetParam`, `selectableSets` and `setScopeQuery` are removed; `scopePoints`/`scopeMeta` stay for `report-facts.tsx`. Every `scopeCut(…, activeSet)` is now `scopeCut(…, null)`, with T7 comments. Filtered copy: "Filtered · N of M points", "in the filtered points". Specs: new `match-filters-provider.spec.ts`; `set-scope`, `report-empty-states` and `stat-widget-cuts` updated. Not checked in a browser (the `?f=` write-back and popstate were reasoned through, not run).
**follow-ups:**

1. T7: clicks from Statistics open Video without the match filters, so Video can list more points than the hover count. Move `watchCut`/`scopeCut` onto `MatchFilters` and remove `scopeCut` plus its stale `scopePoints` comment in `film-cut-context.tsx`.
2. T6: add the page-level "No points match these filters" state when `filtersActive && filteredPoints.length === 0`.
3. T6: head-to-head's published sections still render when filtered, with unsupported rows as em dashes; consider an explanatory note.
4. T6: `report-facts.tsx` still prints whole-match points and games; decide whether it should follow the filters.

## T6 · Wire filters into the Statistics tab — done

**gate:** mechanical pass; completion pass. Widget states: loading ✓ (the Statistics skeleton in `match-report-pending.tsx` gains the Filter-button row, so nothing shifts); empty ✓ (`FilteredPointsEmpty` reads "No points match these filters" with a single Clear all; the bar and insight stay); error unchanged. Browser-checked by the implementer in a throwaway `src/app/dev-preview` route (deleted): the rail opens at 340px and reflows the pane, re-click and Esc close it with focus returned, Apply writes `?f=`, chip removal updates the URL and badge, and `?f=sc.Ad-40_sv.y` gives removable chips, "0 of 40 points" and the empty state.
**changed:** New in `match-filters/`: `applied-chips.ts` (`appliedChips`, `removeChip`; one chip per applied value, including values the match can't produce, and `server` as a single "Rudy serving" chip), `rail-state.ts` (`filterRailReducer`, `escClosesRail`), `filter-rail.tsx` (`FilterRailProvider`, `useFilterRail`, `useFilterRailHost`, `FilterRail` using the roster's CSS width-keyframe shell, keyed `FiltersPanel` with whole-match availability, Apply → `setFilters` then close), and `applied-filters.tsx` (`MatchFiltersBar`: one Filter button with a count badge plus chips and "N of M points"; `FilteredPointsEmpty`). `MatchReportFrame` mounts the rail as a third column (score rail │ pane │ filters). `StatisticsView` gains `canFilter` (default true); `/m/[token]` passes false, so there is no button and the chips have no remove, but "N of M" and Clear all remain. The head-to-head scope line now reads just "Filtered". Spec: `tests/match-filters-statistics.spec.ts` (17 tests).
**follow-ups:**

1. DESIGN-SYSTEM CONFLICT for the author: SKILL.md's Banned list and `reference/tables.md` rule 6 ban accumulating filter chips and say the applied strip is "never chips, never a badge". The task's criteria asked for both. Either record an exception for match-report filters in the design system, or change the design.
2. T7: the Film tab should call `useFilterRailHost()` from its own Filter button and reuse `MatchFiltersBar`/`FilteredPointsEmpty`; the rail is frame-level and free of `next/navigation`.
3. On a narrow pane the filter rail plus the 300px score rail squeeze the pane; there is no mobile rule yet (the roster drawer is `hidden lg:block`).
4. `FiltersPanel`'s header has no side padding while its sections do (16px vs 32px inside the rail); consider aligning them.

## T7 · Move the Film tab onto the shared model and rewrite watch cuts — done

**gate:** mechanical pass; completion pass. Widget states: loading unchanged; empty ✓ (the Film list's empty sentence comes from `filmListSentence` and names the shared filters, cut and saved toggle); error unchanged. Not checked in a browser: neither the chip strip nor the dark `FiltersPanel` in the film room has been seen on screen.
**changed:** `film-cut-context.tsx` rewritten: `FilmCut = Partial<MatchFilters>` plus Film-only extras (`rallyMin`, `rallyMax`, `ending`: ace | winner | unforced-error | return-winner); a pending cut is `{ cut, label }`; `applyFilmCut` and `isReturnWinner` moved here; `scopeCut`/`mergeFilmCut` removed. New `film/film-list-filters.ts` holds `FilmListFilters` (shared + Film-only cut + savedOnly), `filmListPoints`, `landFilmCut` (returns `shared` by identity, so a cut never reaches the provider or `?f=`), the chips and sentence, the quick-menu mapping and the legacy URL helpers (`cut=break` → shared Breakpoint, `serve=you|opp` → shared server, `cut=saved` → local toggle; only legacy values are stripped). `film-tab.tsx` reads `useMatchFilters()` and passes one `filmFilters` object to both `PointList` mounts. The Advanced panel is a thin host for the shared `FiltersPanel` (new `tone="dark"` for the film room, where Clear all is white/70 → white); its old option table is deleted. The head-to-head, point-endings and rally-length cuts are rewritten, and hover counts and clicks share `applyFilmCut` over the shared filtered points. `watchCut(cut, label)`. The four named specs and the `PointList` harnesses are updated.
Behaviour changes (author should know):

- "…won / saved / converted" cells now open only the points that side WON (before, the denominator), matching the figure shown.
- Winners and errors are attributed by the shared model's `winnerHitBy`/`errorMadeBy`.
- Double faults are Error + Serve.
- Landing a cut turns "Saved only" off.
- Return winners stays a Film-only ending: expressed as Shot Return + Winner it disagreed with `isReturnWinner` on the spec fixtures.
  **follow-ups:**

1. T8: `film/film-this-point.tsx:10` imports `lastNameOf` from `./film-filters`; switch it to `./film-list-filters`. `tests/film-filters-model.spec.ts` is the only remaining user of `DEFAULT_FILM_FILTERS`, `applyFilmFilters`, `countFilmOption`, `filmFiltersEqual`, `FILM_FILTER_SECTIONS`, `cutName`, `describeFilmCut`, `hasActiveFilmFilters`, `parseCut` and `serializeCut`. Stale comments remain at `film/film-room-prefs.ts:13` and `match-filters/score.ts:79`. The copy of `isReturnWinner` in `types.ts` has no importers, and `groupsFor` has none either.
2. Move the legacy-URL translation into `provider.tsx`, so an old `?cut=break` link that lands on Statistics is translated too (today that only happens once Film mounts).
3. Check chip wrapping on screen in the 320px column with many shared filters applied.

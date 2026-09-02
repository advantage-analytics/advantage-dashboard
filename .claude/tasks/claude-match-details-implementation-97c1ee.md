# Tasks — claude/match-details-implementation-97c1ee

> Scope: frame 47f of "Match Details Final" — the Statistics tab and match
> rail of `/dashboard/matches/[matchId]` at dashboard density, on top of the
> shipped round 46. Pipeline workspace: `work/match-details-47f/`.

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

## T1 · KPI history loader and its spec
- **status:** done
- **model:** opus
- **files:** src/lib/data/match-stats-server.ts, tests/match-kpi-history.spec.ts
- **done when:**
  - [ ] `match-stats-server.ts` exports `MatchKpiKey`, `MatchKpiHistory`, a pure `buildKpiHistory(rows, matchId)` and `getMatchKpiHistory(playerId, matchId, matchDate)`; `getPlayerAverageStats` keeps its signature and returns the same fields it does today
  - [ ] `buildKpiHistory` derives `baseline` as the mean over the player's OTHER matches only (current match and null values excluded; key absent when nothing measured it) and `series` as at most 8 values — the 7 matches dated before this one plus this one, oldest → newest, gaps dropped, key absent below 2 points
  - [ ] The four keys read `first_serve_pct`, `first_serve_won_pct`, `second_serve_won_pct`, `break_points_saved_pct` from `match_stats_with_percentages` on the player's `is_player1 = true` rows, the same rows the average already uses
  - [ ] `npx playwright test tests/match-kpi-history.spec.ts` passes and covers: current match excluded from the baseline, nulls excluded, series order and window, one measured match → baseline but no series
  - [ ] `npx tsc --noEmit` exits 0
- **notes:** design § Data flow; plan step 1. Factor the "player's matches → stat rows" fetch into a private helper both loaders share (rows now carry `match_id` and `matches.date`). Keep the arithmetic in exported pure functions — the `team-kpi.ts` split — so the spec runs without a database.

## T2 · Thread kpiHistory through getMatchDetailData and the provider
- **status:** done
- **model:** fable
- **needs:** T1
- **files:** src/lib/data/match-detail-server.ts, src/components/dashboard/matches/match-data-provider.tsx, src/app/dashboard/matches/[matchId]/layout.tsx
- **done when:**
  - [ ] `getMatchDetailData` returns `kpiHistory: MatchKpiHistory | null`, computed inside the existing `Promise.all` wave for the you-side player id (`dbRow.player1_id` or `player2_id`) chosen by the same `isUserPlayer1` rule `transformDbMatchToMatch` applies — that rule is one named function called from both places, not two copies
  - [ ] `viewerIsPlayer` is true exactly when the you-side player id is one of `getMyPlayerIds()`
  - [ ] `MatchDataProvider` and `useMatchData()` carry `kpiHistory` (default `null`) and `layout.tsx` passes it; `playerAverages` is untouched
  - [ ] The diff touches only these three files (plus the loader import) and changes no rendered output; `npx tsc --noEmit` exits 0
- **notes:** plan step 2. Guardrails §4 — a wrong you-side id silently attributes the baseline to the wrong person, which is why this is routed up. Remove any temporary logging before committing.

## T3 · Set-scope primitive: hook, helpers, chips, spec
- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/set-scope.tsx, tests/set-scope.spec.ts
- **done when:**
  - [ ] `set-scope.tsx` exports `useSetScope()` (reads `?set=` into `activeSet: number | null`; `select()` writes with `router.replace` and `scroll: false`; invalid or out-of-range values read as `null`), `scopePoints()`, `scopeMeta()` and `SetScopeChips`
  - [ ] `scopeMeta` returns `{ label, points, games }` with `label` `Whole match` or `Set N`, points counted from the scoped rows and games from `score.sets` (a 7-6 set is 13 games)
  - [ ] `SetScopeChips` renders one 22 px chip per `useMatchSides().sets` entry in `text-scoreboard-sm` at 12 px (inline `fontSize`) on a `surface-muted` `p-0.5` track — active chip on `surface-card`, the others at reduced opacity while filtered, chips for sets with no point rows disabled — with the `text-micro tabular` scope label before it and a blue 11/500 `Whole match` reset after it, both only while filtered
  - [ ] Nothing mounts the chips yet; `npx playwright test tests/set-scope.spec.ts` passes (parse/serialize, `scopeMeta` including a tiebreak set, `scopePoints`) and `npx tsc --noEmit` exits 0
- **notes:** design § Components → `set-scope.tsx`; plan step 3. Sets come from `useMatchSides().sets`, never player order.

## T4 · Shell surface and tab row with the trailing slot
- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/match-detail-shell.tsx, src/components/dashboard/matches/match-detail/match-tabs.tsx, src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] The pane is `bg-[var(--surface-card)] px-5 pb-4 gap-3.5` and keeps `min-h-0 overflow-y-auto`; the tab-less analysing/failed branch is unchanged (guardrails §3.3)
  - [ ] `MatchTabs` is a 42 px row — `pt-1.5` on the strip, tabs `pt-[11px] pb-[9px]`, `gap-5`, `surface-card` background, no bottom border, a `flex-1` spacer then a `trailing` prop rendered at the right — and stays sticky
  - [ ] `MatchDetailShell` accepts `tabBarTrailing?: Partial<Record<MatchTab, ReactNode>>` and renders the active tab's entry; `page.tsx` passes `{ statistics: <SetScopeChips /> }` so the chips appear on Statistics only
  - [ ] `npx tsc --noEmit` exits 0
- **notes:** plan step 4.

## T5 · KPI strip and the Statistics tab layout
- **status:** todo
- **model:** opus
- **needs:** T2, T4
- **files:** src/components/dashboard/matches/match-detail/match-kpi-strip.tsx (new), src/components/dashboard/matches/match-detail/statistics-tab.tsx, src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] `MatchKpiStrip` renders `KpiTileStrip` + four `KpiTile` from `shared/kpi-tile.tsx` in the order First serve in · First serve points won · Second serve points won · Break points saved, values from `useMatchSides().you.stats` (break points saved = `fractions.breakpointsSaved` made/attempts), `—` plus `hintText` "Not measured" for a null value or zero attempts
  - [ ] Each tile's trend is `round(value − baseline)` with `changeLabel` `vs your avg NN%` when `kpiHistory.viewerIsPlayer` and `vs avg NN%` otherwise; the sparkline is `kpiHistory.series[key]` (omitted below 2 points); `hintText` reads "No earlier matches to compare" when the baseline is absent, and no trend or sparkline is ever derived from a missing baseline
  - [ ] `StatisticsTab` props are `{ statsPublished, isDerived }`; it renders notice (unpublished only) → strip (published only) → `grid xl:grid-cols-2 gap-3.5 flex-1 min-h-0` with `HeadToHeadCard` left and a `flex flex-col gap-3.5` column of tracker, rally, endings right; it no longer imports `InsightStrip`; `page.tsx` passes the new props
  - [ ] The strip reads nothing from `player1`/`player2`; `npx tsc --noEmit` exits 0
- **notes:** design § Components → `match-kpi-strip.tsx`, `statistics-tab.tsx`; plan step 5. `insight-strip.tsx` itself is deleted in T10.

## T6 · Head-to-head as a 15-row table
- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/head-to-head-card.tsx, tests/match-h2h-rows.spec.ts
- **done when:**
  - [ ] The row config is exactly the design's 15 rows in three groups (Serve 7 · Return 4 · Points 4) with sentence-case labels, `lowerIsBetter` on Double faults and Unforced errors, Break points saved shown as a percentage from `fractions.breakpointsSaved`, and Return winners as a keyless row that always renders `—` with the missing-data tooltip — exported as pure config plus a leader function
  - [ ] Header row is blank | you ✓ (104 px, right-aligned, ✓ gated on `match.verificationStatus`) | opp (104 px); section titles are `eyebrow-sm` in `ink-400`; rows are `min-h-8 px-2 -mx-2 rounded-[var(--radius-element)] hover:bg-[var(--surface-muted)]` with a 12 px `ink-600` label and 13 px tabular values, leader 500/`ink-900` else 400/`ink-500`, ties unemphasised; a centred dark `ChartTooltip` carries the label and the fraction; no legend row, set chips, bars or sub-figures remain
  - [ ] Header meta reads `{label} · {points} points · {games} games` from `scopeMeta`, the per-set derivation reads `useSetScope()` (local `activeSet` state and chips removed), and non-derivable rows keep the em dash with "Not measurable for a single set"
  - [ ] `npx playwright test tests/match-h2h-rows.spec.ts` passes (15 rows in 7/4/4, leader flips on the two ↓ rows, ties, Return winners `—`, `9/12` → `75%`); `npx tsc --noEmit` exits 0
- **notes:** design § Components → `head-to-head-card.tsx` (the row table); plan step 6. Every you/opp read stays on `useMatchSides()`.

## T7 · Performance tracker: Expand, above-label, annotation
- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/performance-tracker-chart.tsx
- **done when:**
  - [ ] Header is the eyebrow plus an inert `Expand` (`<button aria-disabled>` using the header's existing dark-tooltip pattern, reading "Expanded view coming soon"); the legend swatches and break-of-serve legend are gone; a 10 px `ink-400` `{you.shortName} above` label sits inside the chart's top-left on a `surface-card` backing
  - [ ] The chart is `viewBox 0 0 1000 96` at 104 px — dashed `ink-200` `3 3` set dividers, `ink-200` midline, area fills at 0.14, 1.5 px lines, no `viz-key` break verticals — with 10 px `ink-400` set labels, and its series comes from `scopePoints(points, activeSet)`
  - [ ] Hover shows a 1 px `ink-300` crosshair and a three-line annotation: event (`Break of serve · Set N` from `detectBreakIndices`, else Match/Set/Break point, else `Point N`), margin (`{leader} +{n} on margin` or `Level`, game score appended only under the existing `showScores` guard), and a mono `{mm:ss} · point {n}` line whose time is omitted when `videoTime` is null
  - [ ] `npx tsc --noEmit` exits 0
- **notes:** design § Components → `performance-tracker-chart.tsx`; plan step 7. Flags #9 (score coercion) and #11 (Expand) apply.

## T8 · Rally length card
- **status:** todo
- **model:** sonnet
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/rally-length-card.tsx
- **done when:**
  - [ ] Header meta is `{avg} shots average`; the mosaic is `flex-1 min-h-24` with 2 px gaps between and inside bands, fixed `viz-you-mid` over `viz-opp-light` (no leader-based tone swap), `radius-cell` on the outer corners only, and no percentage labels inside the bands
  - [ ] The label row reads in the `Short 106 · Medium 54 · Long 28` form (11 px `ink-700` label + mono 10 px `ink-400` count); the legend uses the same two tones; the footer reads `Width is how often`
  - [ ] Tooltip lines are title / `{n} points · {share.toFixed(1)}% of the match` / `{you} {pct}%` / `{opp} {pct}%`
  - [ ] Points come from `scopePoints(points, useSetScope().activeSet)`; the section root is `flex-1 min-h-0`; `npx tsc --noEmit` exits 0
- **notes:** design § Components → `rally-length-card.tsx`; plan step 8a.

## T9 · How points ended card
- **status:** todo
- **model:** sonnet
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/point-endings-card.tsx
- **done when:**
  - [ ] Header meta is `Own outcomes`; each player row is the name at 11 px `ink-600` plus a mono 10 px total; the bars are `h-2.5`
  - [ ] The legend is 6 px squares labelled `Winners · Aces · Unforced · Double faults`; the footer sentence is removed
  - [ ] Points come from `scopePoints(points, useSetScope().activeSet)`; the derived-match Aces drop is unchanged; `npx tsc --noEmit` exits 0
- **notes:** design § Components → `point-endings-card.tsx`; plan step 8b.

## T10 · Rail metrics and the insight card; retire the strip
- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/components/dashboard/matches/match-detail/match-rail.tsx, src/components/dashboard/matches/match-detail/rail-insight-card.tsx (new), src/components/dashboard/matches/match-detail/insight-dismissal.ts (new), src/components/dashboard/matches/match-detail/insight-strip.tsx (delete), src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] `insight-dismissal.ts` holds `insightDismissedStorageKey` and the `useSyncExternalStore` dismissal store unchanged (same key, same `"true"` sentinel); `insight-strip.tsx` is deleted and `grep -rn insight-strip src` finds nothing
  - [ ] `RailInsightCard` is a `surface-subtle` card (`p-[13px_14px] gap-[7px]`): 20 px `ink-900` logo chip with the same mark and inversion the strip used, 13/500 headline = the viewer's `summary`, ✕ with an `aria-label` and `ink-100` hover wash, footer `View full analysis` (blue 11/500 → `/dashboard/ask`) plus `text-micro ink-400` "Advantage Intelligence"; it renders nothing without a summary or once dismissed
  - [ ] The rail is `px-5 py-[18px] gap-4` with the score at 26 px and one fact group at `gap-2`; the Advantage Intelligence blurb and the film card are removed; the `mt-auto` group orders `MatchDataBlock` → no-video note → `RailInsightCard`
  - [ ] The `film` prop is `"note-swingvision" | "note-neutral" | "none"` and `page.tsx` passes `"none"` when a video exists; `npx tsc --noEmit` and `npm run lint` exit 0 with no new warnings
- **notes:** design § Components → `match-rail.tsx`, `RailInsightCard`; plan step 9. Flags #1–#3 apply; the note strip's `Add video` link is unchanged.

## T11 · Flags doc rows for 47f
- **status:** todo
- **model:** sonnet
- **needs:** T6, T7, T8, T9, T10
- **files:** docs/match-detail-v46-flags.md
- **done when:**
  - [ ] Rows #1, #2, #3 and #9 gain a note naming where 47f renders the element (rail card; tracker annotation), in the table's existing columns
  - [ ] New rows exist for #10 ("vs season" shipped as "vs your avg" / "vs avg"; unblock = a season definition), #11 (tracker `Expand` inert; unblock = a spec), #12 (Return winners `—`; no statistic and no `points.result_type` value behind it), #13 (eight-match sparkline window, tied to #10), each with element, render site, suspected source, unblock condition and status
  - [ ] The header's "as of" line names this branch and date; `npm test` still passes
- **notes:** design § Flags-doc changes; plan step 10.

## T12 · Gate and visual pass against the 47f frame
- **status:** todo
- **model:** fable
- **needs:** T11
- **files:** any file from T1–T11, fixes only
- **done when:**
  - [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` and `npm test` exit 0 with no new lint warnings
  - [ ] The `pipeline-guardrails-reviewer` agent, run on the branch diff, reports no finding (short-circuit gate, status predicates, attribution, wizard untouched)
  - [ ] Every `useMatchSides`/`sides.` read in the changed files is listed in the task's result with a one-line justification, and no changed component reads `player1`/`player2` for orientation
  - [ ] The brief's success criteria 1–5 and 7 are each recorded in the task's result as verified in the browser (the derived match and a SwingVision import at 1512×982 against the 47f present view, screenshots attached) or explicitly as unverified with the reason; criterion 6 (player-2 viewer) likewise; remaining pixel deviations are listed by element and either fixed in the owning file or left with a reason
- **notes:** plan step 11. To see the frame: open the design URL in Chrome → Present → New tab (the canvas view ignores automated scrolling). Fixes only — no new surfaces.

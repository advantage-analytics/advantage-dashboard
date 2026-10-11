# Tasks — claude/personal-statistics-page-ce72ae

> Scope: the personal Statistics page at /dashboard/statistics — per-match loader, rolling-window helpers, URL-held controls, trend / opponent-split / all-statistics / rally / endings sections; replaces the ComingSoon stub (the team stub at /dashboard/team/statistics is untouched).

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

## T1 · Statistics catalogue and rolling-window helpers (pure, with tests)

- **status:** done
- **model:** opus
- **files:** src/lib/data/statistics.ts (new, pure — no Supabase, no React), tests/statistics-rolling.spec.ts (new) — guesses
- **done when:**
  - [ ] `src/lib/data/statistics.ts` exports a `STATISTIC_GROUPS` catalogue (Serve / Return / Points) of 15 entries each carrying `key`, `label`, `format` (`"percent" | "count"`) and `lowerIsBetter`, and the spec asserts its labels in order equal `H2H_GROUPS.flatMap(g => g.configs.map(c => c.label))` imported from `src/components/dashboard/matches/match-detail/head-to-head-card.tsx`.
  - [ ] `averageOf(values)` is the mean of present finite values and `null` over none (delegating to `meanOfPresent` in `aggregate.ts`); `rollingMean(values, window)` takes a series ordered oldest→newest and returns one entry per index whose trailing window of `window` matches is full — the mean of the present values in that window, `null` when none are present — and `[]` when `window` is `null` (Off) or the series is shorter than the window.
  - [ ] `windowChange(values, window)` returns `latest − previous`, where `latest` is the last rolling value and `previous` the rolling value `window` matches earlier, and `null` when either is null, when the series holds fewer than `2 × window` matches, or when the window is Off.
  - [ ] `WINDOW_OPTIONS` is `[null, 3, 5, 10]` with `DEFAULT_WINDOW = 5`; `parseWindow(raw)` maps `"off" | "3" | "5" | "10"` to those and anything else to the default.
  - [ ] The spec covers: legitimate zeros kept, nulls skipped not zeroed (`[10, null, 20]` rolling 3 → 15), change null below `2 × window`, Off yielding `[]` / `null`.
- **notes:** Semantics are the frame's own script (project/Statistics.dc.html in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV): `roll` = mean of the last N, `d` = now minus the rolling value N matches earlier, table note "Last N matches against the N before". The window counts matches, not measured values. `returnWinners` stays in the catalogue (its row shows em dashes; see T2).

## T2 · Personal statistics loader: per-match values and the points read

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/data/statistics-server.ts (new), src/lib/data/statistics.ts, src/lib/data/personal-matches-server.ts (widen `MATCH_COLUMNS` with `source_provider` and `PERSONAL_STAT_COLUMNS` with the catalogue's columns), tests/statistics-matches.spec.ts (new) — guesses
- **done when:**
  - [ ] `getPersonalStatistics(userId)` (React `cache()`d) reads through the existing `getPersonalMatchData(userId)` + `getMyPlayerIds()` pair — the personal predicate `created_by = me AND program_id IS NULL` is not restated and no second `match_stats` query is issued; `PERSONAL_STAT_COLUMNS` gains `net_points_won, net_points_appearances, total_points, total_points_won, break_points_faced, break_points_saved, first_return_won_pct, second_return_won_pct` and `MATCH_COLUMNS` gains `source_provider`.
  - [ ] A pure, exported `toStatisticsMatches(matches, statRows, myPlayerIds, userId)` returns one `StatisticsMatch` per match whose side resolves via `playerSide` and whose own-seat stat row exists, ordered oldest→newest: `{ id, date, isPlayer1, opponentName, opponentHand, opponentBackhand, courtType, isDerived: source_provider === "splitstep", won, values, opponentValues, profile: ProfileResult }` — `values` from the viewer's seat row, `opponentValues` from the other seat row (null-filled when absent); a match with no own-seat row or an unresolved side is dropped, never zero-filled.
  - [ ] Each `values[key]` is derived as the head-to-head card reads it: `_pct` columns via `pct()`, break points saved = `break_points_saved / break_points_faced × 100`, net points won = `net_points_won / net_points_appearances × 100`, total points won = `total_points_won / total_points × 100` — a percentage on this page, a deliberate departure from the card's count, so `STATISTIC_GROUPS`' `totalPointsWon` entry becomes `format: "percent"` and `tests/statistics-rolling.spec.ts`'s format check against the card exempts that one key; counts via `num()`; absent or a zero denominator stays `null`; `returnWinners` is always `null` (it needs shots, which are not loaded).
  - [ ] `getPersonalStatisticsPoints(matchIds)` reads `points` (`match_id, result_type, won_by_player1, server_is_player1, rally_length`) through `fetchAllPages` with the cookie client for the given ids and returns `null` on a read failure and `[]` for no rows (the `match-points-server.ts` contract).
  - [ ] The spec pins `toStatisticsMatches` with plain objects: a seat-two viewer attributed correctly, `null` preserved, `isDerived`, ordering, a match with no stat row dropped, `opponentValues` from the other seat.
- **notes:** Cookie (RLS) client only — never `admin.ts`. `opponent_hand`, `opponent_backhand`, `court_type` are already on `DbPersonalMatch`. `ProfileResult` + `statRowsByKey` come from `player-profile.ts`, as `personal-kpis-server.ts` builds them — `seasonStrip(filtered.map(m => m.profile))` is how T3 draws the strip over a filtered set.

## T3 · Statistics route: page shell, URL state model, loading and day-zero states, nav

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/app/dashboard/statistics/page.tsx, src/app/dashboard/statistics/loading.tsx (new), src/components/dashboard/statistics/{statistics-page-content.tsx, statistics-provider.tsx, statistics-search.ts, statistics-day-zero.tsx, statistics-skeleton.tsx} (new), src/lib/dashboard/nav.ts, MAP.md, tests/statistics-search.spec.ts (new), tests/statistics-page-states.spec.ts (new) — guesses
- **routes:** /dashboard/statistics
- **done when:**
  - [ ] `page.tsx` no longer imports `ComingSoonPage`: it resolves `getWorkspaceContext()`, redirects a team workspace to `/dashboard/team/statistics` (that stub untouched), and renders the title row — "Statistics" and "N analyzed matches · <first date> – <last date> · W won" — from `getPersonalStatistics` inside a Suspense region whose fallback is a skeleton built from `PendingBar` / `PendingRegion` / `PendingFrame`; `loading.tsx` exports the same frame.
  - [ ] A pure `parseStatisticsSearch(searchParams)` / `serializeStatisticsSearch(state)` pair owns the URL contract — `opponent`, `hand`, `backhand`, `courtType`, `matches` (`all` or a count), `window` (via `parseWindow`), `stat` (catalogue key, default `firstServeWinPct`) — with unknown values falling back to defaults, and `applyStatisticsFilters(all, state)` is the one place the filtered set is computed; the spec pins parse, serialize and a round-trip.
  - [ ] `StatisticsPageContent` ("use client") reads the params with `useSearchParams` and provides `{ all, filtered, points, state, setState }` through a `StatisticsProvider` context (`setState` = `router.replace` of the serialized params; no global store), rendering `SeasonKpiStrip` over `seasonStrip(filtered.map(m => m.profile))` and one `WidgetBoundary`-wrapped placeholder region per later section (Trend, By opponent type, All statistics, Rally length, How points ended).
  - [ ] Zero analyzed matches renders a day-zero page in the Matches/Home pattern (the page's own dimmed shape + one offer to `/dashboard/matches`); a non-empty set that filters to nothing keeps the page and shows the strip's and regions' honest-zero anatomy with `—`, never the day zero or a skeleton; `tests/statistics-page-states.spec.ts` renders both through `createLoader()` and asserts the copy and the `—` marks.
  - [ ] `comingSoon` is removed from the personal Statistics entry in `nav.ts` (the team entry untouched), `npm run map` has been run, and `tests/nav-icons.spec.ts` passes as committed.
- **notes:** Copy layout from the frame at https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV, project/Statistics.dc.html: `<main>` padding 20px 56px 32px, 24px column gap, max-width 1536; header subtitle as quoted. Read `.skills/advantage-analytics-design/SKILL.md` + `reference/empty-and-loading.md` and run the widget-states checklist on every region. `matches` options: All analyzed / Last 5 / Last 10 / Last 20.

## T4 · Statistics controls: Opponent, Opponent type, Matches, Rolling window

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/statistics/statistics-controls.tsx (new), src/components/dashboard/statistics/statistics-page-content.tsx, src/components/dashboard/matches/matches-filter-panel.tsx (reuse, not edit), src/components/dashboard/matches/matches-page-content.tsx (extract the hand/backhand phrase helper), tests/statistics-controls.spec.ts (new) — guesses
- **routes:** /dashboard/statistics
- **done when:**
  - [ ] The controls row renders four labelled controls in frame order: Opponent (`MenuSelect` over the distinct opponent names plus "All opponents"), Opponent type (the existing `MatchesFilterPanel` with one "Opponent" section of segmented Hand / Backhand rows and a Court checklist built from the loaded matches, footer "N of M matches", `label="Filter statistics"`), Matches, and Rolling window as a `role="radiogroup"` of Off / 3 / 5 / 10 pills.
  - [ ] Every change goes through the provider's `setState`, so the URL is the only state: the spec renders the controls through `createLoader()` with state parsed from `?hand=left&window=3&opponent=Marcus+Hale` and asserts the checked pill, the active segment and the selected opponent label.
  - [ ] The Opponent-type trigger reads "Any hand, any backhand" with nothing applied and otherwise the applied sentence, using the Matches page's value→phrase mapping (left/right, one-/two-handed) extracted to a shared helper rather than copied.
  - [ ] Hand and Backhand rows are omitted when no loaded match carries that value, and the Court checklist when no match has a court — the same rule `matches-page-content.tsx` applies.
  - [ ] The spec pins the hand+backhand sentence and that selecting a facet's neutral option removes its param from the serialized URL.
- **notes:** Pills `rounded-full`, buttons `rounded-[6px]`; single-choice = the check-dot `Radio` vocabulary (`reference/primitives.md`). Trigger from `shared/list-toolbar-trigger.tsx`. Frame: radiogroup width 200px, height 30px, 4px gap.

## T5 · Trend card

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/statistics/trend-card.tsx (new), src/components/dashboard/shared/kpi-detail-chart.tsx (extend), src/lib/data/statistics.ts, tests/statistics-trend.spec.ts (new) — guesses
- **routes:** /dashboard/statistics
- **done when:**
  - [ ] A pure `trendSeries(filtered, statKey, window)` returns `{ points: KpiDetailPoint[] (present values only, oldest→newest, date + opponent), average, rolling: (number | null)[] aligned to points, latest, change }` built on T1's helpers; the spec pins it, including Off → no rolling and null change.
  - [ ] `KpiDetailChart` gains optional `average` and `rolling` props that draw a dashed average reference line and a rolling line inside the existing Recharts composition, keeping the dark readout (`DARK_READOUT_*`) and leaving `kpi-tile.tsx`'s call unchanged — no new chart library.
  - [ ] Card header: eyebrow "Trend", the statistic's label, "Average NN%"; the window readout (legend "Rolling N", latest value, delta as ↑ / ↓ / → coloured good/bad by `lowerIsBetter`) prints `—` for each figure when the window is Off or the series is short; a hairline legend row "Each match / Rolling N / Average" and an "N matches" caption.
  - [ ] The hover readout reads opponent, date, "NN% this match" and, where a rolling value exists at that point, "NN% rolling N".
  - [ ] Fewer than two present values renders the card's own anatomy with one sentence ("Not enough matches to draw a trend yet") and no chart — the spec renders it through `createLoader()` and asserts.
- **notes:** Frame: `surface-card`, `flex: 999 1 520px`, padding 20px, gap 12px; dots in `VIZ_BLUE`. Good/bad colours from DS tokens, never the frame's hex.

## T6 · By opponent type split card

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/statistics/opponent-split-card.tsx (new), src/lib/data/statistics.ts, tests/statistics-splits.spec.ts (new) — guesses
- **routes:** /dashboard/statistics
- **done when:**
  - [ ] A pure `opponentSplits(filtered, statKey)` returns up to three groups — Hand (Right-handed / Left-handed), Backhand (Two-handed / One-handed), Court (one row per distinct court) — each row `{ label, n, value: averageOf(group values), leader }`; rows with `n = 0` and groups with no rows are omitted; null values are not counted in `n`; the spec pins this.
  - [ ] The card renders each group's title and rows in a `minmax(0, 1fr) 88px 36px` grid — label, a bar whose width is the value (leader `--viz-you`, others `--player-1-bar-tint`), the value — and a footer "<statistic label> · N matches".
  - [ ] The card carries no "Advantage Intelligence" eyebrow, no "Ask why" action and no generated claim sentence.
  - [ ] With no group to show, the card keeps its anatomy with the sentence "Opponent hand, backhand and court haven't been recorded yet" and `—` where values go; the spec renders it through `createLoader()` and asserts.
- **notes:** Sits beside the Trend card in the frame's flex row (`flex: 1 1 184px`-class column, 20px padding, 12px gap). The statistic shown is the provider's `stat`, same as Trend.

## T7 · All statistics table

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/statistics/all-statistics-table.tsx (new), src/lib/data/statistics.ts, tests/statistics-table.spec.ts (new) — guesses
- **routes:** /dashboard/statistics
- **done when:**
  - [ ] A pure `statisticsTableRows(filtered, window)` returns Serve / Return / Points groups of rows `{ key, label, average, rolling, change, spark: last 8 present values, opponents: averageOf(opponentValues[key]) }` on T1's helpers; the spec pins group order against the catalogue, a lower-is-better decrease reading as good, and Off → null rolling and change.
  - [ ] The table follows the v3 table laws: eyebrow "All statistics", note "Last N matches against the N before · M matches" (or "Rolling window off · M matches"), header cells Average / Rolling N (or "Rolling") / Change / Last 8 / Opponents, group header rows, tabular numerals, `—` in Rolling and Change when Off or short.
  - [ ] Change prints `↑ x` / `↓ x` / `→ 0` coloured good / bad / flat via DS tokens by `lowerIsBetter`; the Last 8 cell is an inline SVG sparkline in `--viz-you`, falling back to `placeholder-sparkline.tsx` under two values.
  - [ ] Clicking a row (or Enter on it) sets `stat` through the provider, the selected row carries `aria-selected="true"`, and the `returnWinners` row prints `—` in every numeric cell.
  - [ ] The spec renders the table through `createLoader()` over a fixture and asserts the note text, the selected row and the dashes.
- **notes:** Frame: `min-width: 720px` column, 14px header padding. Row click chooses the Trend/Split statistic.

## T8 · Rally length and How points ended over aggregated points

- **status:** todo
- **model:** fable
- **needs:** T2, T3
- **files:** src/components/dashboard/matches/match-detail/rally-length-card.tsx, src/components/dashboard/matches/match-detail/point-endings-card.tsx (extract), src/components/dashboard/statistics/{rally-length-summary.tsx, point-endings-summary.tsx} (new), src/components/dashboard/statistics/statistics-page-content.tsx, tests/statistics-points-cards.spec.ts (new) — guesses
- **routes:** /dashboard/statistics, /dashboard/matches/[matchId]
- **done when:**
  - [ ] `rallyBands(points, youIsPlayer1)` and `outcomeTally(points, isPlayer1, isDerived)` are exported pure functions over a minimal point shape (`rallyLength, wonByPlayer1, serverIsPlayer1, resultType`) — one implementation each — and both match-detail cards call them; `tests/report-empty-states.spec.ts`, `tests/head-to-head-cuts.spec.ts` and `tests/stat-widget-cuts.spec.ts` pass unchanged.
  - [ ] The mosaic and stacked-bar markup are lifted into presentational components (`RallyLengthMosaic`, `PointEndingsBars`) that take the tallies, labels and an optional watchable handler; the match-detail cards render their previous markup through them (a lift, no behaviour change) and the statistics summaries pass no handler — no film cuts there.
  - [ ] On the statistics page both cards tally the points of the FILTERED matches (`getPersonalStatisticsPoints` over all analyzed ids on the server, narrowed client-side by match id), with each point's viewer side from its `StatisticsMatch.isPlayer1` and the derived-aces rule applied per match by `isDerived`; "How points ended" shows per-match means ("You 48 pts") under a "Per match" caption.
  - [ ] Rally length's header reads "N.N shots" average with band labels carrying their share; no points renders each card's honest-zero anatomy with `—` (never a skeleton), and a `null` points read falls to the region's `WidgetBoundary` fallback.
  - [ ] The spec pins both pure tallies (derived aces, band edges) and renders both summaries' empty state through `createLoader()`.
- **notes:** `docs/ui-revamp-guardrails.md` §4 — the side comes from `StatisticsMatch.isPlayer1`, never "player1 by default"; `pipeline-guardrails-reviewer` is the right second read. Bottom grid `repeat(auto-fit, minmax(300px, 1fr))`, 24px gap. `rally-length-card.tsx` and `point-endings-card.tsx` are "use client" and read `useMatchData/useMatchSides/useMatchReport`; the extraction must keep those reads inside the match-detail wrappers only.

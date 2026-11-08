# Tasks — claude/player-profile-design-1c3b05

> Scope: build the team player profile redesign "Q" at /dashboard/team/roster/[playerId] (report-style rail, season Statistics and Visualizations tabs), plus the match report's chart-order change.

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

## T1 · Fold a player's analyzed matches into season Head to head rows

- **status:** done
- **model:** fable
- **files:** `src/lib/data/player-season.ts` (new, pure), `tests/player-season.spec.ts` (new) — guess
- **done when:**
  - [ ] A pure `foldSeasonRows(matches)` takes, per analyzed match, `{ points, isPlayer1, isDerived, errorSplitJudged, lobKeys | null, youStats, oppStats }` and returns `{ title, rows }[]` over every row of `h2hGroups` (head-to-head-card.tsx) for the player AND the opponents' column, without re-deriving any statistic: published values via `rowValue`/`buildStatRows`, point rows via `tallySide` per match
  - [ ] Count rows (no `isPercentage`/`fromFraction`) are per-match averages printed to one decimal; rate rows are pooled (sum made ÷ sum attempts × 100); a spec pins both with a two-match fixture
  - [ ] Per match the Aces row follows that match's own config (derived rule on `splitstep`, published aces otherwise); the fold emits one "Errors" row unless every match's `errorSplitJudged` is true, then "Unforced errors" + "Forced errors"
  - [ ] Lob points and Passed rows average only over matches whose `lobKeys` is non-null; zero such matches yields `value: null` ("—") with the report's `NO_LOB_DATA_NOTE`/`NO_PASS_DATA_NOTE`
  - [ ] The same module exports season tallies the right-column cards need — per-match `{ matchId, date, opponent, youWon, total }`, summed `outcomeTally`, summed `netGameTally`, rally bands — each built by calling the report's exported calculators per match and summing, with a spec asserting the sum equals the per-match parts
- **notes:** Reuse `rowValue`, `tallySide`, `withPointRows`, `h2hGroups`, `withLobAvailability` (head-to-head-card.tsx), `outcomeTally` (point-endings-card.tsx), `netGameTally` (match-filters/net-game.ts), `rallyLengthBandOf`. Never normalise/flip points to a common seat — pass each match's own `isPlayer1`, as guardrails §4 wants. Design: canvas https://claude.ai/artifact/FSEsqhrCmsJyjPy5PJZTwv (CohesiveQ).

## T2 · Season loader for the profile

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** `src/lib/data/player-season-server.ts` (new), `src/lib/data/player-profile-server.ts`, `tests/player-season-loader.spec.ts` (new) — guess
- **done when:**
  - [ ] `getPlayerSeason(programId, playerId)` (`cache()`d) reads this player's matches through the RLS client using the roster fold `getPlayerProfile` already does (`canonicalRosterIds`/`sideOf`), keeps those with points on this side, and returns `{ analyzed, matchesPlayed, opponentsCount, groups, tallies, perMatch }` built by T1
  - [ ] `match_stats_with_percentages` rows are read for both seats of each analyzed match; points come from `getMatchPointsFromSupabase` per match, awaited in parallel
  - [ ] Lob keys come from the ball-paths file via `supabaseBallPathsBody` + `lobShotKeys`, derived matches only, read only after the RLS-scoped matches read returned the row (the `resolveAnalysedWindowSeconds` pattern); a missing or failed file reads as `null`, never as "no lobs"
  - [ ] `opponentsCount` counts distinct opponents by the key `team-opponents.ts` groups on, so the rail's "N opponents" equals the rows the Faced-by filtered page shows
  - [ ] A spec against stubbed reads pins: a match with stats but no points is not analyzed; `isDerived`/`errorSplitJudged` are taken from `source_provider`/`errorSplitJudged()` per match
- **notes:** Service role only for the ball-paths blob; `rls-boundary-reviewer` will look here. `tests/match-day-readers.spec.ts` guards date reads — use `matchDay()`.

## T3 · Profile frame: report rail, two tabs, links, header slot

- **status:** done
- **model:** opus
- **files:** `src/app/dashboard/team/roster/[playerId]/page.tsx`, `src/components/dashboard/team/player-profile/profile-frame.tsx`, `profile-rail.tsx`, `profile-view.ts` (new), `profile-actions.tsx`, `src/components/dashboard/matches/match-detail/match-report.tsx`, `tests/profile-view.spec.ts` — guess
- **routes:** `/dashboard/team/roster/[playerId]`, `/dashboard/team/roster/[playerId]?tab=visualizations`
- **done when:**
  - [ ] The page renders `MatchReportFrame`/`MatchReportRail`/`MatchReportSpacer`/`MatchReportRailFooter`/`MatchReportPane` inside the same `h-[calc(100dvh-var(--header-h))] overflow-hidden` box the match detail layout uses; `MatchReportRail` gains an optional `label` prop (default "Match summary") and the profile passes "Player summary"
  - [ ] The rail's player block renders a 40px `PersonAvatar`, the name, `{classYear} · Singles {n}` (facts omitted when unrecorded), `recordLabel` + `FormStrip`, and `hand · backhand` with `YouPill` on the viewer's own page or `StatePill` "Coach-managed" on an unclaimed teammate's — no outline pills
  - [ ] Two switcher rows "Statistics" and "Visualizations" use `viewRowClass` and a new pure `profile-view.ts` (`parseProfileView`, `profileViewQuery`, key `tab`, default `statistics`) with a spec; `role="tablist"` + `role="tab"`/`aria-selected` markup matches `report-view-switcher.tsx`
  - [ ] Under the tabs, "N matches ›" links to `/dashboard/matches?player=<profile.playerId>` and "N opponents ›" to `/dashboard/opponents?facedBy=<profile.playerId>`; the rail footer holds `advButton("primary")` "New match" full width (only when `canUploadForProgram`), and `ProfileActions` no longer draws it
  - [ ] The pane's title row is `MatchReportTitleRow` with an `<h1 class="text-title-lg">` naming the active tab, a facts line `{N} matches · {A} analyzed`, and `ProfileActions` (Ask + ⋯) in `MatchReportTitleActions`; `ProfileHeaderSlot` is unchanged
- **notes:** Canvas boards `CohesiveQ`/`QEmpty` at https://claude.ai/artifact/FSEsqhrCmsJyjPy5PJZTwv. The pane content for each tab arrives in T7/T9; until then the pane renders the title row only.

## T4 · Season Head to head card

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** `src/components/dashboard/matches/match-detail/head-to-head-card.tsx`, `head-to-head-table.tsx` (new, extracted), `src/components/dashboard/team/player-profile/season-head-to-head-card.tsx` (new), `tests/season-head-to-head.spec.ts` — guess
- **done when:**
  - [ ] The row/cell rendering (groups, `rowLeader` emphasis, value cells, `--h2h-col` width) is extracted into a presentational `HeadToHeadTable` that takes `groups`, `youName`, `oppName` and optional readout/cut handlers; `HeadToHeadCard` renders it and `tests/match-h2h-rows.spec.ts` + `head-to-head-cuts.spec.ts` still pass
  - [ ] `SeasonHeadToHeadCard` renders the table with eyebrow "Head to head", caption "Per match · {A} analyzed", columns `surnameLabels(player)` and "Opponents", every T1 row, no cuts and no "Watch" readouts
  - [ ] With zero analyzed matches every row still renders with "—" in both columns and the caption reads "Per match · 0 analyzed"
  - [ ] A rendered-markup spec (`fixtures/vm-modules`) asserts the eyebrow, caption, the Errors-vs-Unforced/Forced choice and the dash row

## T5 · Season Performance tracker and How points ended

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** `performance-tracker-chart.tsx`, `point-endings-card.tsx` (both under `match-detail/`), `player-profile/season-performance-tracker.tsx`, `player-profile/season-point-endings-card.tsx` (new), `tests/season-tracker-endings.spec.ts` — guess
- **done when:**
  - [ ] `PointEndingsCard`'s bar/legend/readout markup is split into a body component taking `{ youTally, oppTally, youName, oppName, errorSplitJudged, isDerived, watchable }`; the report's card renders it unchanged (`report-empty-states.spec.ts` passes) and the season card renders it from T1's summed tallies with `watchable: false`
  - [ ] `SeasonPerformanceTracker` draws one sample per analyzed match in date order — the match's won-point differential (you − opp) mirrored around the midline in `viz-you`/`viz-opp`, reusing `ChartTooltip`/`LegendSwatch`; no break lines or set labels; the readout names opponent, date and "N of M points"
  - [ ] Both season cards with zero analyzed matches render their anatomy (eyebrow, legend, empty track or empty plot) plus one sentence, never `0`/`0%`
  - [ ] A spec asserts the sample count equals the analyzed-match count and the dash/empty markup

## T6 · Season Rally length and Net game

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** `rally-length-card.tsx`, `net-game-card.tsx` (under `match-detail/`), `player-profile/season-rally-length-card.tsx`, `player-profile/season-net-game-card.tsx` (new), `tests/season-rally-net.spec.ts` — guess
- **done when:**
  - [ ] Each report card is split into a hook-reading wrapper and a body taking its tallies, names, `hasLobs` and `watchable`; `tests/net-game.spec.ts` and `report-empty-states.spec.ts` pass unchanged
  - [ ] The season cards render those bodies from T1's summed rally bands (with the average-shots figure) and summed `netGameTally`, `hasLobs` true only when every analyzed match had lob keys, `watchable: false`
  - [ ] Zero analyzed matches: anatomy with dashes/empty tracks and one sentence, no `0%`
  - [ ] A spec asserts both season cards' empty markup and that band widths sum to the banded total

## T7 · Statistics tab view and the no-analyzed-matches state

- **status:** done
- **model:** opus
- **needs:** T2, T3, T4, T5, T6
- **files:** `player-profile/profile-statistics-view.tsx`, `player-profile/profile-insight-empty.tsx` (new), `src/app/dashboard/team/roster/[playerId]/page.tsx`, `tests/profile-statistics-view.spec.ts` — guess
- **routes:** `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] Inside the Statistics tab the pane renders, in order: the insight card slot, then a row that splits 1:1 from `@min-[720px]` with `SeasonHeadToHeadCard` left and the column Performance tracker → How points ended → Rally length → Net game right (`statistics-view.tsx`'s classes)
  - [ ] `ProfileInsightEmpty` reuses `INSIGHT_SURFACE` + `InsightMark` with season copy ("No Advantage Intelligence summary for {firstName}'s season yet." and one line saying it is written once a match is analysed), `role="status"`, `data-testid="insight-empty"`
  - [ ] `getPlayerSeason` is awaited inside a `<Suspense>` around the pane body so the rail renders from `getPlayerProfile` first
  - [ ] A rendered-markup spec covers the zero case: every card present, dashes, the season empty copy, and no `SeasonKpiStrip`/`LastMatchCard`/`MatchHistoryCard` in the page's imports

## T8 · Opponents page reads `?facedBy=` into the Faced-by filter

- **status:** todo
- **model:** opus
- **files:** `src/app/dashboard/opponents/page.tsx`, `team-opponents-page-content.tsx`, `opponents-views.ts`, `tests/opponents-views.spec.ts` — guess
- **routes:** `/dashboard/opponents?facedBy=<playerId>`
- **done when:**
  - [ ] A pure `initialOpponentCut(params, facedByChoices)` in `opponents-views.ts` seeds `filters.facedBy` from one or many `facedBy` values, keeping only ids present in `opponentFacedByChoices`, else `RESTING_OPPONENT_CUT`
  - [ ] The team branch of `page.tsx` reads `searchParams.facedBy` (string | string[]) beside `opponent` and `TeamOpponentsPageContent` uses it as the initial cut; the personal branch ignores it
  - [ ] The filter strip's existing "Faced by …" description renders for a seeded cut with no change to its wording
  - [ ] Specs pin the helper: unknown id → resting cut; two ids → both; a known id → `hasOpponentFilters` true

## T9 · Visualizations tab: the season viz wall

- **status:** todo
- **model:** fable
- **needs:** T2, T3
- **files:** `src/lib/data/player-season-viz.ts` (new, pure), `player-profile/profile-visualizations-view.tsx` (new), `src/lib/data/player-season-server.ts`, `tests/player-season-viz.spec.ts` — guess
- **routes:** `/dashboard/team/roster/[playerId]?tab=visualizations`
- **done when:**
  - [ ] A pure `buildSeasonTiles(perMatch, sides, savedViews)` runs `vizPoints` + `computeViz` per match with that match's `isPlayer1`, `MatchFilterContext` and the T1 errors-judged rule, and merges `dots`/`total` per tile key — the player's five default cuts then the opponents' five (`defaultCutsFor` order), plus one tile per workspace saved view
  - [ ] Tiles are computed on the server in the loader (no season points reach the client); the client wall renders `CourtTile as="static"` with `playerName`, `name`, `pills`, `tileCountLabel`, no `href`, no fullscreen glyph, on `VIZ_TILE_GRID_CLASS`
  - [ ] A Default/Saved switch with `viz-wall.tsx`'s pill markup; Saved lists the workspace's `getSavedViews` tiles read-only (no Create view, no Manage); the switch is absent when there are no saved views
  - [ ] Zero drawable points renders `viz-wall.tsx`'s `EmptyWall` sentence adapted to the season; a spec asserts merged totals equal the per-match sums and the ten-tile order
- **notes:** Confirm `computeViz`/`viz-model.ts` import nothing client-only before calling it server-side; if it does, move the pure part.

## T10 · Loading skeletons for the profile

- **status:** todo
- **model:** opus
- **needs:** T7
- **files:** `src/components/dashboard/loading/player-profile-pending.tsx`, `src/app/dashboard/team/roster/[playerId]/loading.tsx` (new), `tests/player-profile-pending.spec.ts` — guess
- **done when:**
  - [ ] `loading.tsx` draws the rail (bars for avatar/name/facts, real "Statistics"/"Visualizations" rows via `viewRowClass`, a bar where New match lands) and the pane skeleton; the pane skeleton is also T7's Suspense fallback
  - [ ] The Statistics pane skeleton mirrors T7's geometry: `INSIGHT_SURFACE` insight card with the real engine credit, head-to-head group labels as text, four card eyebrows as text, bars elsewhere
  - [ ] Every region has `role="status"` + `aria-label="Loading …"`, bars are `aria-hidden` in `bg-[var(--surface-skeleton)] motion-safe:animate-pulse`; no `<button>`, no hex
  - [ ] A rendered-markup spec modelled on `tests/match-report-pending.spec.ts` asserts the above

## T11 · Season Advantage Intelligence claim

- **status:** todo
- **model:** fable
- **needs:** T1, T7
- **files:** `src/app/api/player-insight/route.ts` (new), `player-profile/profile-insight-card.tsx` (new), `src/lib/data/player-season.ts`, `openapi/advantage-api.yaml`, `tests/player-insight-prompt.spec.ts` — guess
- **done when:**
  - [ ] `POST /api/player-insight` `{ playerId }` authenticates via the cookie client, resolves the active team workspace and the player through `program_roster_full` (a non-member gets `errorResponse` 403/404), builds the prompt from T1's season numbers with `home-insight`'s voice rules (one sentence, ≤8 words, no digits), streams through `getLLMStream` + `textStreamResponse`, and answers 204 with zero analyzed matches
  - [ ] A pure `buildPlayerInsightPrompt` and a server-composed evidence line (`buildSeasonEvidence`, e.g. "{A} analyzed · points won {x}% · first serve {y}%") are exported and pinned by a spec; the model never writes a figure that is shown
  - [ ] `ProfileInsightCard` uses `INSIGHT_SURFACE`, the claim slot, the evidence line and the engine credit; caches per `playerId` + season signature in `sessionStorage` like `home-ai-insight.tsx`; settles on 204/error to T7's `ProfileInsightEmpty`
  - [ ] `openapi/advantage-api.yaml` describes the route and `npm run api:lint` passes

## T12 · Retire the old profile pieces

- **status:** todo
- **model:** sonnet
- **needs:** T7, T9, T10
- **files:** `player-profile/profile-identity.tsx`, `last-match-card.tsx`, `serve-placement-card.tsx`, `match-history-card.tsx`, `line-history-card.tsx`, `src/lib/data/player-profile-server.ts`, `tests/player-profile-serve-card.spec.ts`, `tests/player-profile-serve-map.spec.ts` — guess
- **done when:**
  - [ ] `ProfileIdentity`, `LastMatchCard`, `ServePlacementCard`, `MatchHistoryCard` and `LineHistoryCard` are deleted along with their two specs, after `grep -rn` shows the page was their only importer; `SeasonKpiStrip` stays (Home and Team Home import it)
  - [ ] `PlayerProfile` drops `serve`, `lastMatch`, `kpis`, `hasStats`, `listSource`; `serveMapFor` and `getPlayerMatchList` are removed; `tests/player-profile.spec.ts` keeps only helpers still imported from `player-profile.ts`
  - [ ] `npm run typecheck` and `npm run lint` pass; `npm run map` produces no diff (no route changed)
- **notes:** `LineHistoryCard` is not in the author's list but the Q layout has no slot for it and Schedule is coming-soon; flagged here for the author to keep or drop.

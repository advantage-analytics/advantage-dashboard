# Design — Match Details 47f ("Statistics — dashboard density")

Input: `../01_brief/output/brief.md` (unchanged by the human — its nine open
questions are resolved below, each with the decision and why; override any of
them by editing this file). Artboard: `references/match-details-final.dc.html`
frame `id="47f"` (lines 288–454); DS component source:
`references/_ds_bundle.js` lines 176–303 (`KpiTile`, `KpiStrip`).

**Route traced** (trace-route skill): `/dashboard/matches/[matchId]` renders
from `src/app/dashboard/matches/[matchId]/page.tsx` → `MatchDetailShell`
(`src/components/dashboard/matches/match-detail/match-detail-shell.tsx`) →
`MatchTabs` + the active panel; the rail is `match-detail/match-rail.tsx`
(→ `match-data-block.tsx`); the Statistics panel is
`match-detail/statistics-tab.tsx` → `insight-strip.tsx`,
`unpublished-stats-notice.tsx`, `head-to-head-card.tsx`,
`performance-tracker-chart.tsx`, `rally-length-card.tsx`,
`point-endings-card.tsx`. Data comes from `layout.tsx` →
`getMatchDetailData()` (`src/lib/data/match-detail-server.ts`, React
`cache()`d) → `MatchDataProvider`; every card reads `useMatchData()` and
decides you/opp only through `useMatchSides()`. Those are the files this
design changes; nothing else on the route is touched.

## Approaches considered

1. **Restyle the round-46 components in place** *(chosen)*. Keep the shell /
   rail / tab / card set and the single cached fetch; change each file to
   47f's metrics; add the two genuinely new pieces (a KPI strip and a
   pane-level set scope); extend the loader for the one thing the page does
   not carry (a per-match KPI history). Smallest diff, no duplicate
   components, every guardrail invariant stays where it already lives.
2. **Build a parallel `statistics-tab-47f/` tree and swap it in.** Rejected:
   it leaves two near-identical card sets in the repo for the length of the
   feature, which is exactly how the wrong one gets edited later (the
   guardrails doc's own lesson, and why round 46 deleted what it superseded
   in the same change).
3. **Generalize the team KPI strip (`team/kpi-strip.tsx`) into a shared
   primitive and use it here.** Rejected for now: that strip is a
   server-rendered, team-keyed component with its own sample-size refusals
   and "vs earlier" grammar. 47f's tiles are label · value · signed trend ·
   sparkline — precisely the props of `shared/kpi-tile.tsx`, which is the
   repo's transcription of the DS `KpiTile` and already renders the personal
   Home strip. Reuse that; a unification of the two strips is its own task.

Within (1), the one real fork was **where the set scope lives**. Options:
React state lifted into `StatisticsTab` (loses the selection on tab switch
and needs the control rendered inside the panel, not the tab row), a small
context provided by the shell, or the URL (`?set=2`, absent = whole match).
**URL chosen**: the tab row control and the cards then share state with no
plumbing, the selection survives a tab round-trip and a reload, and it is the
same mechanism `?tab=` already uses on this page. Writes use `router.replace`
(`scroll: false`) rather than `push`: a filter change is not a place the back
button should return to.

## Chosen design

### Architecture

No new route, no new fetch path, no schema change. The page keeps its shape:

```
layout.tsx ── getMatchDetailData() ──▶ MatchDataProvider  (+ kpiHistory)
page.tsx   ── reconcile / analysis / video (unchanged)
└─ MatchDetailShell                       pane bg → surface-card; paddings → 47f
   ├─ MatchTabs  (+ trailing slot)        42 px row, no hairline, tabs 11/9 px
   │     └─ SetScopeChips  (statistics tab only)   ?set= chips · scope label · Whole match
   ├─ MatchRail                            18/20 px padding, 26 px score, one fact group
   │     ├─ identity + facts               unchanged data, 47f metrics
   │     └─ bottom group (mt-auto)         MatchDataBlock → no-video note → RailInsightCard
   └─ StatisticsTab
         ├─ UnpublishedStatsNotice         when !statsPublished (unchanged)
         ├─ MatchKpiStrip                  NEW — 4 × shared KpiTile in KpiTileStrip
         └─ two-column row (gap 14)
               ├─ HeadToHeadCard           15-row table, tooltips, lower-is-better
               └─ column (gap 14)
                     ├─ PerformanceTrackerChart   Expand · above-label · annotation
                     ├─ RallyLengthCard           flex:1 absorber
                     └─ PointEndingsCard          10 px bars
```

Shots & placement and Film room are untouched except that they now sit on the
white pane (brief Q3 — resolved below).

### Components

**`match-detail-shell.tsx`** — pane becomes `bg-[var(--surface-card)]`,
`px-5 pb-4`, `gap-3.5`; keeps `min-h-0 overflow-y-auto` so viewports shorter
than 982 px still scroll (brief constraint: no new breakpoints). The tab bar
gets a `trailing` slot; the shell takes
`tabBarTrailing?: Partial<Record<MatchTab, ReactNode>>` and renders the
active tab's entry. The analysing/failed mode (`tabs` absent) is unchanged.

**`match-tabs.tsx`** — 42 px row: `pt-1.5` on the strip, tab buttons
`pt-[11px] pb-[9px]`; background `surface-card`; **no `border-b`** (47f draws
none — the 2 px inset underline is the only rule); `gap-5`; a `flex-1`
spacer then `{trailing}`. Sticky stays (the pane can still scroll).

**`set-scope.tsx`** *(new)* — three exports:
- `useSetScope(): { activeSet: number | null; select(n: number | null) }`
  reading/writing `?set=`; invalid or out-of-range values read as `null`.
- `scopePoints(points, activeSet)` and
  `scopeMeta(sides.sets, points, activeSet)` → `{ label: "Whole match" |
  "Set 2", points: n, games: n }` — games from `score.sets` (a 7-6 set is
  13 games), never from point rows.
- `SetScopeChips` — 47f's segmented control: `p-0.5 rounded-[var(--radius-button)]
  bg-[var(--surface-muted)]`, one 22 px chip per set in `text-scoreboard-sm`
  at 12 px (inline `fontSize`, the class is unlayered), `px-[9px]
  rounded-[4px]`, active chip `bg-[var(--surface-card)]`, others at reduced
  opacity while filtered, chips for sets with no point rows disabled (as the
  shipped card does). While filtered, a `text-micro tabular` scope label
  (`Set 2 · 61 points · 9 games`) sits before the control and a blue 11/500
  `Whole match` reset after it. Sets read from `useMatchSides().sets` — never
  player order.

**`match-kpi-strip.tsx`** *(new, client)* — `KpiTileStrip` + four `KpiTile`
from `shared/kpi-tile.tsx`, in 47f's order. Per tile: `label`, `value`
(`NN%` or `—`), `trend: { change, changeLabel }` when a baseline exists,
`sparkline` when the series has ≥ 2 points, `hintText` otherwise. Colour is
the tile's own good/bad rule (`change ≥ 0` good — none of the four is
lower-is-better). Reads `useMatchData().kpiHistory` and `useMatchSides()`;
never player1/player2. Renders nothing when `statsPublished` is false (the
notice takes its place — brief Q9).

**`head-to-head-card.tsx`** — the stat config collapses to 15 rows in three
groups, sentence case, with a per-row `lowerIsBetter`:

| Group | Row | Key | Display | Tooltip line |
|---|---|---|---|---|
| Serve | Aces | `aces` | count | — |
| | Double faults | `doubleFaults` ↓ | count | — |
| | First serve in | `firstServeInPct` | % | `fractions.firstServeInPct` |
| | First serve points won | `firstServeWinPct` | % | fraction |
| | Second serve points won | `secondServeWinPct` | % | fraction |
| | Break points saved | `fractions.breakpointsSaved` | **% from made/attempts** | `9/12` |
| | Service games won | `serviceGamesWonPct` | % | `serviceGamesWon/serviceGames` when the fraction exists |
| Return | First serve returns won | `firstReturnWonPct` | % | fraction |
| | Second serve returns won | `secondReturnWonPct` | % | fraction |
| | Break points converted | `breakpointsWonPct` | % | fraction |
| | Return winners | *(none)* | `—` | "Not recorded by any source yet" |
| Points | Net points won | `netPointsWonPct` | % | fraction |
| | Winners | `winners` | count | — |
| | Unforced errors | `unforcedErrors` ↓ | count | — |
| | Total points won | `totalPointsWon` | count | `of {totalPoints}` |

Leader = higher value, or lower where marked ↓; ties emphasise neither.
Header row: blank | you (104 px, right, 12/500 `ink-900` + the verified ✓
under the same gate as the rail) | opp (104 px, 12/500 `ink-600`). Section
eyebrows `eyebrow-sm` in `ink-400`, `pt-[13px] pb-[5px]`. Rows `min-h-8
px-2 -mx-2 rounded-[var(--radius-element)] hover:bg-[var(--surface-muted)]`,
label 12 px `ink-600`, values 13 px tabular, leader 500/`ink-900` else
400/`ink-500`; the dark row tooltip (reuse `ChartTooltip`, centred, hanging
just above the row) carries the label and the fraction in mono 10 px.
Removed: legend row, set chips (now `SetScopeChips`), the two-segment bars,
the 9 px sub-figures. Header meta: `{label} · {points} points · {games}
games` in `text-micro ink-400`. The per-set derivation (`tallySide`,
`derivedValue`) is kept and now reads `useSetScope()`; non-derivable rows
show the existing em dash with "Not measurable for a single set".

**`performance-tracker-chart.tsx`** — header: eyebrow + `Expand` (blue
11/500). Legend swatches and the break-of-serve legend go; a 10 px `ink-400`
`{you.shortName} above` label sits inside the chart's top-left on a
`surface-card` backing. Chart: `viewBox 0 0 1000 96`, 104 px tall; set
dividers dashed `ink-200` `3 3`; midline `ink-200`; area fills at 0.14; lines
1.5 px; **no `viz-key` break verticals**. Hover: 1 px `ink-300` crosshair and
a dark annotation of three lines — event (`Break of serve · Set 2`, else
`Match point` / `Set point` / `Break point` / `Point {n}` with the set),
margin (`{leader} +{n} on margin`, `Level` at zero; the game score joins
only when the column is real, per the existing `showScores` guard), and a
mono line `{mm:ss} · point {n}` (time from `videoTime`, omitted when null).
Break detection reuses `detectBreakIndices`. Set labels row: 10 px
`ink-400`. Series come from `scopePoints`. `Expand` ships as drawn but
inert — a `<button aria-disabled>` with the dark tooltip "Expanded view
coming soon" — and gets a flags-doc row (brief Q5, below).

**`rally-length-card.tsx`** — header meta `{avg} shots average`; mosaic
`flex-1 min-h-24`, 2 px gaps between and inside bands, fixed `viz-you-mid`
over `viz-opp-light` (drop the leader-based tone swap), outer corners only
at `radius-cell`, no in-band percentage labels; label row `Short 106 ·
Medium 54 · Long 28` (11 px `ink-700` + mono 10 px `ink-400`); legend in the
same two tones; footer `Width is how often`. Tooltip: title / `{n} points ·
{share.toFixed(1)}% of the match` / `{you} {pct}%` / `{opp} {pct}%`. The
card is the column's `flex:1` absorber. Scope-aware.

**`point-endings-card.tsx`** — header meta `Own outcomes`; per player: name
11 px `ink-600` + mono 10 px total; bars `h-2.5` (10 px); legend 6 px squares
labelled `Winners · Aces · Unforced · Double faults`; footer sentence
removed. Aces segment still dropped on derived matches. Scope-aware.

**`statistics-tab.tsx`** — props shrink to `{ statsPublished, isDerived }`.
Renders the notice (when unpublished), `MatchKpiStrip` (when published), then
`grid xl:grid-cols-2 gap-3.5 flex-1 min-h-0`; below `xl` one column (the v3
rail auto-collapses at 1280 px, so a two-column pane is ≥ 916 px there — fine;
narrower stacks and scrolls).

**`match-rail.tsx`** — `px-5 py-[18px] gap-4`; identity block gap 3 (eyebrow
→ names 12 px, names → score 8 px); score `26px`; one fact group at `gap-2`.
The "Advantage Intelligence" blurb and the film card go. Bottom group
(`mt-auto gap-3`): `MatchDataBlock` (derived) → the 44a no-video note strip
(unchanged copy and `Add video` link, flags #3) → **`RailInsightCard`**
(new, in `rail-insight-card.tsx`): `surface-subtle` card, `p-[13px_14px]
gap-[7px]`, 20 px `ink-900` logo chip (same mark and inversion as the
retired strip), 13/500 headline in `ink-900`, dismiss ✕ (20 px, `ink-100`
hover wash, `aria-label`), footer `View full analysis` (blue 11/500, →
`/dashboard/ask`, flags #2) + `text-micro ink-400` "Advantage Intelligence".
The headline is the viewer's `summary`; the artboard's second sentence with
numbers has no source and is not rendered (flags #1 stands). Dismissal
reuses `insightDismissedStorageKey` + the `useSyncExternalStore` pattern —
both move to `insight-dismissal.ts`; `insight-strip.tsx` is deleted. The
`film` prop loses its `"card"` value (`"note-swingvision" | "note-neutral" |
"none"`); `page.tsx` passes `"none"` when a video exists.

**`page.tsx`** — passes `tabBarTrailing={{ statistics: <SetScopeChips /> }}`,
the reduced `StatisticsTab` props, and the reduced `film` value. Everything
else (reconcile, `loadMatchAnalysis`, the short-circuit gate, `MarkReportSeen`)
unchanged.

**Deleted**: `insight-strip.tsx`. Nothing else is orphaned — `ChartTooltip`
and `LegendSwatch` keep their other callers.

### Data flow

Every binding is an existing column, verified against the live database on
2026-09-02.

| Element | Source |
|---|---|
| KPI values | `sides.you.stats`: `firstServeInPct`, `firstServeWinPct`, `secondServeWinPct` (nullable on derived matches → `—`), and `fractions.breakpointsSaved` → `made / attempts` (attempts 0 → `—`) |
| KPI baseline ("vs your avg NN%") | `kpiHistory.baseline[key]` — mean of the same statistic over the **you-side player's other matches**, current match excluded, absent values excluded (the `getPlayerAverageStats` rule). Break points saved uses the view's `break_points_saved_pct`, present in `match_stats_with_percentages` |
| KPI sparkline | `kpiHistory.series[key]` — the you-side player's value for that statistic over the 7 matches before this one plus this one, oldest → newest, gaps dropped (not zeroed); hidden below 2 points. Eight is the personal Home strip's window (`performance-server.ts`) and the DS example's |
| KPI trend | `round(value − baseline)`; `changeLabel` = `vs your avg {baseline}%` when the viewer is the you-side player, `vs avg {baseline}%` otherwise (a coach reading an athlete's match) |
| H2H rows | `sides.you.stats` / `sides.opp.stats` per the table above; per-set rows recomputed from `points` as today |
| Set scope | `?set=`; sets from `useMatchSides().sets`; games from `score.sets` |
| Tracker annotation | `detectBreakIndices`, `isBreakPoint/isSetPoint/isMatchPoint`, `videoTime`, `gameScore` (only when real) |
| Rally / endings | `points.rallyLength`, `points.resultType`, `points.player` — unchanged |
| Rail card | `insights.{side}.summary` picked in `page.tsx` |

**`kpiHistory`** is one new optional field on `MatchDetailData` and the
provider:

```ts
interface MatchKpiHistory {
  /** Whether the viewer IS the you-side player (drives the pronoun). */
  viewerIsPlayer: boolean;
  baseline: Partial<Record<MatchKpiKey, number>>;   // absent = no other matches measured it
  series: Partial<Record<MatchKpiKey, number[]>>;   // ≤ 8, oldest → newest, ends at this match
}
type MatchKpiKey = "firstServeIn" | "firstServeWon" | "secondServeWon" | "breakPointsSaved";
```

Loaded by a new `getMatchKpiHistory(youPlayerId, matchId, matchDate)` in
`match-stats-server.ts`, which factors the "own matches → stat rows" fetch
out of `getPlayerAverageStats` into a shared private helper (rows now also
carry `match_id` and `matches.date`). `getPlayerAverageStats` keeps its
signature and result; `playerAverages` stays on the provider untouched. The
you-side player id is `dbRow.player1_id` or `player2_id` chosen by the same
`isUserPlayer1` resolution `transformDbMatchToMatch` already performs
(extract it if it is not already a function) — never by position. It joins
the existing `Promise.all` wave in `getMatchDetailData`. Known, carried
limitation: the baseline reads `is_player1 = true` rows only, as the average
always has.

### Error handling

- History query fails or returns nothing (first analyzed match, or every
  other match withheld the stat): `kpiHistory` is `null` / the key is absent
  → tiles render the value with `hintText` "No earlier matches to compare"
  and no sparkline. Never a zero baseline, never an invented delta.
- Statistic withheld on this match (`null`): value `—`, no trend, `hintText`
  "Not measured". Same convention as the Home strip.
- `points` empty: tracker, rally and endings return `null` (unchanged); every
  set chip is disabled; the KPI strip and H2H still render from `match_stats`.
- `?set=` names a set with no rows: reads as `null` (whole match).
- Unpublished stats: notice in the strip's slot, no strip, no H2H; the three
  point cards render. Analysing/failed: the shell's tab-less mode, unchanged.
- Dismissed insight: the card is absent and the `mt-auto` group closes up;
  nothing else in the rail moves.
- `prefers-reduced-motion`: entrance and draw-in collapse to opacity, as the
  shipped cards and tile already do.

### Testing

- **Unit specs (Playwright runner, pure functions — the `tests/team-kpi.spec.ts`
  pattern):**
  `tests/match-kpi-history.spec.ts` — baseline excludes the current match and
  nulls, series is oldest → newest and ends at this match, window is 8, trend
  rounding, pronoun flag; `tests/match-h2h-rows.spec.ts` — exactly 15 rows in
  Serve 7 / Return 4 / Points 4, lower-is-better on Double faults and
  Unforced errors, break points saved rendered as a percentage from the
  fraction, Return winners always `—`; `tests/set-scope.spec.ts` — `?set=`
  parse/serialize, `scopeMeta` games (7-6 → 13), disabled chips for empty
  sets.
- **Gates:** `npm run lint`, `npx tsc --noEmit`, `npm run build` clean;
  `npm test` green; `pipeline-guardrails-reviewer` on the diff (short-circuit,
  status predicates, attribution through `useMatchSides`, wizard untouched).
- **Browser verification** against the 47f present view at 1512×982 on the
  dev server: an analyzed (derived) match, a SwingVision import, and — where a
  fixture exists — a match where the viewer is player 2. Round 46 marked the
  player-2 case unverifiable in this environment; if that still holds, the
  unit specs above plus a review of every `sides.` read stand in, and the
  task says so rather than claiming a browser check.
- No new route → `npm run map` unaffected.

### Flags-doc changes (`docs/match-detail-v46-flags.md`)

Existing rows: #1 gains a note that the strip became the rail card and still
renders the summary alone; #2 gains the rail card's `View full analysis`
site; #3 unchanged (the note strip survives in the 47f rail); #9 is now also
the tracker annotation's game-score line. New rows: **#10** "vs season" —
shipped as "vs your avg" / "vs avg" over the player's other matches, because
no season exists in the schema (`matches` has `date` only); a season
definition would unblock the original copy. **#11** tracker `Expand` — inert
with a tooltip until an expanded view is specced (same class as #7). **#12**
Return winners — no statistic and no `result_type` value behind it (the live
`points` table carries Service/Forehand/Backhand/Overhead winners only);
renders `—`. **#13** sparkline window — eight matches by convention, not by a
season boundary; tied to #10.

## Open questions

The brief's nine, resolved here; edit to override.

1. **Set scope breadth → the whole pane.** 55c says the chips scope the page
   and the control now sits in the tab row, so every point-derived card
   (H2H derivable rows, tracker, rally, endings) follows `?set=`. The KPI
   strip stays whole-match — its values come from `match_stats`, which has no
   per-set form — and nothing on it claims otherwise.
2. **Rail slots → stacked above the insight card**, bottom group order
   `MatchDataBlock` → no-video note → insight card. The caveats stay on
   screen; the card stays pinned last as drawn.
3. **Surface on the other tabs → yes, shell-level.** The pane background is a
   shell property; `.surface-card` already carries the hairline border and
   shadow, so Shots & placement and Film room need no per-card change to read
   correctly on white.
4. **"vs season" → "vs your avg NN%"** (and `vs avg` for a coach viewer). The
   DS bundle's own match-page example uses exactly this label; the schema has
   no season. Flagged (#10) so a season definition can restore the copy.
5. **`Expand` → shipped inert with a tooltip**, flagged (#11), per the round-46
   precedent for unspecced controls. Dropping the link would be the
   alternative; say so if preferred.
6. **Return winners → row kept with `—`** and the existing missing-data
   tooltip, flagged (#12). Dropping the row is the alternative.
7. **Break points saved baseline → the baseline grows**, via the shared
   history loader, using `break_points_saved_pct` which the view already has.
8. **History window → eight matches ending at this one**, no date bound
   (#13).
9. **No published stats → the notice takes the strip's slot**; no strip, no
   H2H, point cards render.

Still open for the human (not blocking): whether a coach reading an athlete's
match should see any pronoun at all in the trend label (`vs avg` is the
proposal), and whether `?set=` should be preserved when switching to the
Shots tab (it is today by construction — harmless, since Shots ignores it).

## Also consulted

Beyond the declared inputs (brief, `MAP.md`, `docs/ui-revamp-guardrails.md`,
`.skills/advantage-analytics-design/SKILL.md`, `references/`):

- `src/app/dashboard/matches/[matchId]/{page,layout}.tsx` and
  `src/components/dashboard/matches/match-detail/{match-detail-shell,
  match-tabs,match-rail,match-data-block,statistics-tab,head-to-head-card,
  performance-tracker-chart,rally-length-card,point-endings-card,
  insight-strip,chart-tooltip,legend-swatch,use-match-sides}.tsx` — the
  route trace and the shipped metrics the deltas are stated against.
- `src/components/dashboard/matches/match-data-provider.tsx` — provider
  shape.
- `src/components/dashboard/shared/kpi-tile.tsx` (the DS `KpiTile`
  transcription reused here) and `src/components/dashboard/team/kpi-strip.tsx`
  + `src/lib/data/team-kpi.ts` (approach 3).
- `src/lib/data/match-stats-server.ts` (`getPlayerAverageStats`, the stats
  select and `fractions` builder), `src/lib/data/match-detail-server.ts`
  (the `Promise.all` wave), `src/lib/data/performance-server.ts`
  (`KPI_SPECS`, the 8-match window), `src/lib/data/statistics-server.ts`
  (`SelectableMatch`, considered and not used), `src/lib/data/types.ts`
  (`PlayerStatistics`, `Player`), `src/lib/data/match-points-server.ts`
  (`MatchPoint`, the `"0-0"` coercion), `src/lib/data/match-utils.ts`
  (`formatDelta`).
- `src/app/globals.css` (`.surface-card` already borders and shadows) and
  `src/styles/design-system/colors.css` (surface and border tokens).
- `tests/` listing and `tests/team-kpi.spec.ts` (test pattern);
  `playwright.config.ts` (`testDir`).
- Live database via the Supabase MCP: `match_stats` and
  `match_stats_with_percentages` columns (`break_points_saved_pct` present),
  `points.result_type` distinct values (no return-winner value), `points`
  `video_time` / `game_score` null counts, `matches` columns (no season).

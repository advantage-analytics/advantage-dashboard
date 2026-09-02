# Plan — Match Details 47f

Source: `../02_design/output/design.md` (unchanged by the human). Scope
guard: `../01_brief/output/brief.md` — every step below maps to one of the
brief's eleven scope items; nothing here touches Shots & placement, Film
room, routes, derivation, or the wizard.

Eleven steps, each sized for one fresh subagent context: **one surface per
step**, the largest single file being `head-to-head-card.tsx` (620 lines).
Steps name their files, their change, and the check that proves them. The
design doc carries the pixel values; a step says which design section it
implements rather than restating it, except where a value is easy to get
wrong.

Read before any step: `docs/ui-revamp-guardrails.md` §3.3 and §4 (the
short-circuit gate and attribution), and the "Components" section of the
design for the step's file. Every you/opp decision goes through
`useMatchSides()`; a step that reads `player1`/`player2` on a component is
wrong by construction.

## Order and dependencies

```
1 kpi history loader ─┐
                      ├─▶ 2 thread kpiHistory ─▶ 5 KPI strip + tab layout ─┐
3 set scope primitive ┼─▶ 4 shell + tab row                                 │
                      ├─▶ 6 head-to-head                                    ├─▶ 9 rail ─▶ 10 flags doc ─▶ 11 gate + visual pass
                      ├─▶ 7 tracker                                         │
                      ├─▶ 8a rally ─▶ 8b endings ───────────────────────────┘
```

1 and 3 are independent of each other and of everything shipped; run them
first. 4, 6, 7, 8a, 8b each depend only on 3. 5 depends on 2. 9 depends on 5
(the Statistics tab must have stopped importing `InsightStrip` before the
file is deleted). 10 and 11 close.

## Steps

### 1 · KPI history loader

**Files:** `src/lib/data/match-stats-server.ts`, new
`tests/match-kpi-history.spec.ts`.

**Change:** implement design § Data flow's `MatchKpiHistory`:
- Export `MatchKpiKey` (`"firstServeIn" | "firstServeWon" | "secondServeWon"
  | "breakPointsSaved"`) and `MatchKpiHistory` (`viewerIsPlayer`, `baseline`,
  `series`).
- Factor the "player's matches → `match_stats_with_percentages` rows" fetch
  that `getPlayerAverageStats` performs into a private helper that also
  returns `match_id` and the match `date` (join or second select — whichever
  the existing query style already uses in this file). `getPlayerAverageStats`
  keeps its signature and its result exactly; its existing behaviour is the
  regression check.
- Add `getMatchKpiHistory(playerId, matchId, matchDate)`: baseline per key =
  mean of that key over the player's other matches (current excluded, nulls
  excluded, `undefined` when nothing measured it — the `meanOfPresent` rule);
  series per key = the values of the 7 matches dated before this one plus
  this match's own value, oldest → newest, gaps dropped, key absent when
  fewer than 2 points. Column map: `first_serve_pct`, `first_serve_won_pct`,
  `second_serve_won_pct`, `break_points_saved_pct`.
- Keep the arithmetic in exported pure functions (`buildKpiHistory(rows,
  matchId)`) so the spec runs without a database, the `team-kpi.ts` split.

**Verify:** `npx playwright test tests/match-kpi-history.spec.ts` — baseline
excludes the current match and nulls; series ends at the current match and
is oldest → newest; window is 8; a key with one measured match has a
baseline and no series; a key nothing measured has neither. `npx tsc
--noEmit` clean.

### 2 · Thread `kpiHistory` to the provider

**Files:** `src/lib/data/match-detail-server.ts`,
`src/components/dashboard/matches/match-data-provider.tsx`,
`src/app/dashboard/matches/[matchId]/layout.tsx`.

**Change:** in `getMatchDetailData()`, resolve the you-side player id
(`dbRow.player1_id` or `player2_id`) with the same `isUserPlayer1` rule
`transformDbMatchToMatch` uses — extract that rule into a named function if
it is inline today, and use it in both places so they cannot drift — and
compute `viewerIsPlayer` (that id ∈ `myPlayerIds`). Call
`getMatchKpiHistory` inside the existing `Promise.all` wave (chained after
`getMyPlayerIds()` the way `getPlayerAverageStats` already is). Add
`kpiHistory: MatchKpiHistory | null` to the returned data, the provider's
context value and props, and the layout's hand-off. `playerAverages` stays.

**Verify:** `npx tsc --noEmit` clean; dev server renders an existing match
unchanged (`npm run dev`, open any match — nothing on screen changes in this
step); a temporary `console.log` of `kpiHistory` on the derived match shows
the four keys with a baseline and, if the account has ≥ 2 analyzed matches,
a series. Remove the log before committing.

### 3 · Set-scope primitive

**Files:** new `src/components/dashboard/matches/match-detail/set-scope.tsx`,
new `tests/set-scope.spec.ts`.

**Change:** design § Components → `set-scope.tsx`: `useSetScope()` over
`?set=` (`router.replace`, `scroll: false`; invalid → `null`),
`scopePoints`, `scopeMeta` (games from `score.sets`, 7-6 → 13), and the
`SetScopeChips` control with 47f's metrics (22 px chips, 12 px
`text-scoreboard-sm` via inline `fontSize`, `surface-muted` track, active on
`surface-card`, reduced opacity on the others while filtered, disabled chips
for sets with no point rows, the `text-micro tabular` scope label before and
the blue `Whole match` reset after, both only while filtered). Sets come from
`useMatchSides().sets`. Nothing mounts it yet.

**Verify:** `npx playwright test tests/set-scope.spec.ts` — parse/serialize
of `?set=`, `scopeMeta` points and games (tiebreak set), `scopePoints`
filtering. `npx tsc --noEmit` clean.

### 4 · Shell surface and tab row

**Files:** `match-detail/match-detail-shell.tsx`, `match-detail/match-tabs.tsx`,
`src/app/dashboard/matches/[matchId]/page.tsx` (the `tabBarTrailing` prop
only).

**Change:** design § Components → shell and tabs: pane
`bg-[var(--surface-card)] px-5 pb-4 gap-3.5`, still `min-h-0
overflow-y-auto`; tab strip 42 px, `pt-1.5`, tabs `pt-[11px] pb-[9px]`,
`surface-card`, **no bottom hairline**, `gap-5`, `flex-1` spacer then the
`trailing` slot; shell prop `tabBarTrailing?: Partial<Record<MatchTab,
ReactNode>>` rendering the active tab's entry; `page.tsx` passes
`{ statistics: <SetScopeChips /> }`. The tab-less analysing/failed mode is
untouched — re-read guardrails §3.3 before editing the shell.

**Verify:** dev server on a match with points: white pane on all three tabs;
the chips appear only on Statistics; clicking a set writes `?set=N` and the
chip goes active, `Whole match` clears it, switching to Shots and back keeps
it; the tab row has no rule under it; `npx tsc --noEmit` clean; the
analysing state (a match whose job is in flight, or temporarily force the
gate) still renders rail + progress with no tabs.

### 5 · KPI strip and the Statistics layout

**Files:** new `match-detail/match-kpi-strip.tsx`,
`match-detail/statistics-tab.tsx`, `page.tsx` (the `StatisticsTab` props
only).

**Change:** design § Components → `match-kpi-strip.tsx` and
`statistics-tab.tsx`. The strip reuses `shared/kpi-tile.tsx`'s `KpiTile` +
`KpiTileStrip`; four tiles in 47f's order (First serve in · First serve
points won · Second serve points won · Break points saved); value from
`useMatchSides().you.stats` (break points saved from
`fractions.breakpointsSaved` made/attempts; null or 0 attempts → `—` +
`hintText` "Not measured"); trend `round(value − baseline)` with
`changeLabel` `vs your avg NN%` / `vs avg NN%` by `viewerIsPlayer`; sparkline
from `kpiHistory.series`; `hintText` "No earlier matches to compare" when the
baseline is absent. `StatisticsTab` props become `{ statsPublished,
isDerived }`; render order notice → strip (published only) → `grid
xl:grid-cols-2 gap-3.5 flex-1 min-h-0` with H2H left and a `flex flex-col
gap-3.5` right column (tracker, rally, endings). Drop the `InsightStrip`
import and the `summary`/`matchId` props (the file itself is deleted in
step 9).

**Verify:** dev server: on an analyzed match the four tiles show the
viewer's published values and, with ≥ 1 other match, a delta and label; on
the derived match the second-serve tile shows `—`; with `?set=2` the strip
does not change; the two columns sit side by side at ≥ 1280 px; `npx tsc
--noEmit` clean.

### 6 · Head to head

**Files:** `match-detail/head-to-head-card.tsx`, new
`tests/match-h2h-rows.spec.ts`.

**Change:** design § Components → `head-to-head-card.tsx`, including its
15-row table. Replace the three stat configs with the 15-row config (keys,
sentence-case labels, `lowerIsBetter` on Double faults and Unforced errors,
Break points saved as a percentage from its fraction, Return winners as a
config entry with no key), keep `tallySide`/`derivedValue` for the per-set
rows but read `useSetScope()` instead of local state, remove the legend row,
the set chips, the bars and the sub-figures, add the header row (blank |
you ✓ | opp at 104 px each), the section eyebrows in `ink-400`, the 32 px
hover rows and the centred dark row tooltip (`ChartTooltip`) carrying the
label and fraction. Header meta from `scopeMeta`. Export the row config and
the leader rule as pure functions for the spec.

**Verify:** `npx playwright test tests/match-h2h-rows.spec.ts` — 15 rows in
7/4/4, leader flips on the two ↓ rows, ties emphasise neither, Return winners
always `—`, break points saved `9/12` → `75%`. Dev server: rows match the
frame's order and casing; hover shows the tooltip with the fraction; `?set=1`
narrows the derivable rows and dashes the rest; the verified ✓ appears only
on a verified match; `npx tsc --noEmit` clean.

### 7 · Performance tracker

**Files:** `match-detail/performance-tracker-chart.tsx`.

**Change:** design § Components → `performance-tracker-chart.tsx`: header
eyebrow + inert `Expand` (`aria-disabled`, dark tooltip "Expanded view coming
soon" — use the existing `ChromeTooltip`/`Tooltip` pattern the header uses,
not a new one); remove the legend swatches and break legend; add the
in-chart `{you.shortName} above` label; `viewBox 0 0 1000 96`, 104 px tall,
`ink-200` dashed `3 3` set dividers, `ink-200` midline, 0.14 area fills,
1.5 px lines, **no** `viz-key` break verticals; crosshair `ink-300`;
three-line annotation (event · margin · mono time/point) per the design's
rules, game score only under the existing `showScores` guard, time only when
`videoTime` is non-null; 10 px `ink-400` set labels; series from
`scopePoints`. Keep `detectBreakIndices`.

**Verify:** dev server on the derived match (no game scores, has
`videoTime`): the hover annotation shows the event line, a margin line with
no score, and a mono `mm:ss · point N`; on a SwingVision import (scores, no
video) it shows the score and no time; `?set=2` draws one set; no break
verticals; `npx tsc --noEmit` clean.

### 8a · Rally length

**Files:** `match-detail/rally-length-card.tsx`.

**Change:** design § Components → `rally-length-card.tsx`: meta `{avg} shots
average`; mosaic `flex-1 min-h-24` with 2 px gaps, fixed `viz-you-mid` over
`viz-opp-light`, outer corners only, no in-band labels; label row with mono
counts; two-tone legend; footer `Width is how often`; tooltip with a
one-decimal share and per-player percentages; points from `scopePoints`.
The card must stay the right column's `flex:1` absorber (root `flex-1
min-h-0`).

**Verify:** dev server: no percentages inside bands; labels read `Short 106`
style with the count in mono; the card grows to fill the column at 982 px
with no pane scroll; `?set=` changes the counts; `npx tsc --noEmit` clean.

### 8b · How points ended

**Files:** `match-detail/point-endings-card.tsx`.

**Change:** design § Components → `point-endings-card.tsx`: meta `Own
outcomes`; per-player name 11 px `ink-600` + mono 10 px total; bars `h-2.5`;
6 px legend squares labelled `Winners · Aces · Unforced · Double faults`;
footer sentence removed; points from `scopePoints`; the derived-match Aces
drop unchanged.

**Verify:** dev server: bars are 10 px; legend reads `Unforced`; the derived
match shows no Aces segment; `?set=` changes the totals; `npx tsc --noEmit`
clean.

### 9 · Rail and the insight card

**Files:** `match-detail/match-rail.tsx`, new
`match-detail/rail-insight-card.tsx`, new
`match-detail/insight-dismissal.ts`, delete
`match-detail/insight-strip.tsx`, `page.tsx` (the `film` value only).

**Change:** design § Components → `match-rail.tsx` and `RailInsightCard`.
Move `insightDismissedStorageKey` and the `useSyncExternalStore` dismissal
store into `insight-dismissal.ts` unchanged (same key, same `"true"`
sentinel); build `RailInsightCard` on it with 47f's metrics (logo chip,
13/500 headline = the viewer's `summary`, ✕, `View full analysis` →
`/dashboard/ask`, `Advantage Intelligence` micro label); rail `px-5 py-[18px]
gap-4`, 26 px score, one fact group at `gap-2`; delete the blurb and the film
card; bottom group order `MatchDataBlock` → no-video note → insight card;
narrow the `film` prop to `"note-swingvision" | "note-neutral" | "none"` and
pass `"none"` from `page.tsx` when a video exists; delete
`insight-strip.tsx` and confirm nothing imports it (`grep -rn insight-strip
src`).

**Verify:** dev server: the card sits at the rail bottom on every tab; ✕
hides it and a reload keeps it hidden (same localStorage key as before); a
match with video shows no film card and no note; a SwingVision match shows
the note above the card; the derived match shows `MatchDataBlock` above
both; `grep` finds no `insight-strip` import; `npx tsc --noEmit` and `npm
run lint` clean.

### 10 · Flags doc

**Files:** `docs/match-detail-v46-flags.md`.

**Change:** per design § Flags-doc changes: annotate rows #1, #2, #3, #9 with
where 47f renders them; add rows #10 ("vs season" → "vs your avg"), #11
(`Expand` inert), #12 (Return winners `—`), #13 (eight-match window). Each
new row names its element, where it renders, the suspected real source, the
unblock condition and a status, in the table's existing columns. Update the
header's "as of" line.

**Verify:** the table has 13 numbered rows; every element the brief lists as
still-copy has one; `npm test` unaffected.

### 11 · Gate and visual pass

**Files:** any of the above, for fixes only; no new surfaces.

**Change:** run the full gate and compare against the frame; fix mismatches
in the file that owns them. `npm run lint`, `npx tsc --noEmit`, `npm run
build`, `npm test`; the `pipeline-guardrails-reviewer` agent on the branch
diff. Then, on the dev server at a 1512×982 viewport with the sidebar
expanded, open the derived match and a SwingVision import and check the
brief's success criteria 1–5 and 7 element by element against the 47f
present view (open the design URL in Chrome → Present → New tab, scroll to
47f). Check criterion 6 (player-2 viewer) if a fixture exists; if it does
not, say so in the run log and rely on the specs plus a read-through of
every `sides.` use in the changed files. Record what was verified and what
was not.

**Verify:** all four commands exit 0 with no new lint warnings; the
reviewer reports no guardrail finding; screenshots of both matches attached
to the run log with any remaining pixel-level deviation listed by element.

## Test strategy

- **Pure logic gets a spec before its UI lands.** Steps 1, 3 and 6 each ship
  a Playwright-runner unit spec in `tests/` alongside their code, in the
  `tests/team-kpi.spec.ts` style: import the exported pure functions, no
  database. These are the checks that catch the silent failures — a
  baseline that counts the current match, a series in the wrong order, a
  leader rule that bolds the wrong side on Double faults.
- **Types are the second gate.** Every step ends with `npx tsc --noEmit`;
  step 9 adds `npm run lint` because it deletes a file.
- **Previewable steps are checked on the dev server** against the specific
  behaviours their verify line names, on two real matches: the one
  Advantage Intelligence match in the live database (`source_provider =
  'splitstep'`: withheld aces and second serve, no game scores, has video
  time) and any SwingVision import (scores, no video). These two cover every
  branch the cards take.
- **Attribution is verified twice.** By code review of every `sides.` read
  in step 11, and in the browser for a player-2 viewer where a fixture
  allows; the run log states which of the two actually happened.
- **The guardrails reviewer runs once, on the whole diff**, in step 11 —
  the short-circuit gate (step 4 touches the shell), status predicates,
  attribution and the untouched wizard.
- **Visual exactness is checked last and by eye**, element by element
  against the frame, not by pixel diff; deviations are fixed in place or
  listed. Round 46's flags-doc convention holds: anything that stays copy
  is a row, never a silent omission.
- No new route, so `npm run map` is not needed; `npm test` still runs the
  route-table check.

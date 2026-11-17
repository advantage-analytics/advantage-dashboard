# Run log — claude/approach-heatmap-design-1ef8c8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add the approach classifier — done

**gate:** mechanical pass · completion pass
**changed:** New pure `match-filters/approach.ts` (`approachOf`, `laneOf`, `wingOf`, `approachLateralM`, `APPROACH_BUCKET_LABEL`) built on `netEntryOf` / `netApproachShotOf` / `netEndingOf`, which are unchanged; new `tests/approach.spec.ts` (11 cases). Orientation copied from `rallyLandingMetrics` to avoid a future import cycle with `viz-model.ts`. A pass whose reply zone is Middle or missing counts as crosscourt; an approach with no landing has `lane`/`wing` null.
**follow-ups:**

1. Have `viz-model.ts` share `approachLateralM` so the two copies of the orientation cannot drift.
2. Product check: should a pass tagged Middle read as crosscourt, or get its own row?

## T2 · Add the approaches cut to the viz model — done

**gate:** mechanical pass · completion pass
**changed:** `viz-model.ts` gains the `approaches` cut (scatter only via `chartAllowedOn`, new exported `chartsFor`), the `entry` / `approachTo` / `approachDir` filter groups, `VizDot.pair`, five `VizDotMeta` fields and `computeApproachViz`, using T1's `approachLateralM`. One-line `approaches` entries in `viz-labels.tsx`, `viz-analytics.ts`, `court-art.tsx`, `player-season-viz.ts`, plus `lightbox-court.tsx` and `lightbox-filters.tsx` (needed to compile). T1's fixture moved to `tests/fixtures/approach-points.ts`; 12 new viz-model cases including the agreement with `netGameTally` for both seats, with and without lob keys.
**follow-ups:**

1. Carry `bucket` (the "How it ended" row) on `VizDotMeta` for T3.
2. `src/lib/services/mcp/links.ts` `VISUALIZATION_CUTS` has no `approaches`, so the MCP `open_visualization` tool cannot link to it.
3. Share the net-height and lateral-third constants between `approach.ts` and `viz-model.ts`.
4. `HEAT_NOUN` in `court-art.tsx` has a dead `approaches` entry, since heat is not allowed for the cut.

## T3 · Compute the Approaches statistics — done

**gate:** mechanical pass · completion pass
**changed:** `computeVizStats("approaches")` (new `approachStats`) builds the KPI (`VizStats.kpi`: count, "of N approaches" only when narrowed, Won %) and three pick groups: Approach to, Direction (absent with no direction in the pool), How it ended (five rows, four with lobs unknown). Court and rail share one pool helper so unplaced approaches count without drawing. `VizDotMeta` gains `bucket`; `statRowKeyOf` / `orderStatRows` know the new groups. `lightbox-stats.tsx` renders a bare count tile; `use-viz-view.ts` now passes the match context into `computeVizStats` so the rail reads hands and lob keys. New viz-model cases cover all five criteria.
**follow-ups:**

1. A row click on Approach to / Direction acts as a pick, but those groups lift their own filter; the mockup makes a row click set the filter. Decide in T8/T10.
2. T13: the season merge must carry `VizStats.kpi` across matches (sum count and won, rebuild the label, or recompute).
3. Check `statRowTooltip`'s share noun reads "approaches" once T5 lands the labels.

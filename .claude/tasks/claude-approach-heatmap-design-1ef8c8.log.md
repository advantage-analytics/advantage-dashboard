# Run log — claude/approach-heatmap-design-1ef8c8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add the approach classifier — done

**gate:** mechanical pass · completion pass
**changed:** New pure `match-filters/approach.ts` (`approachOf`, `laneOf`, `wingOf`, `approachLateralM`, `APPROACH_BUCKET_LABEL`) built on `netEntryOf` / `netApproachShotOf` / `netEndingOf`, which are unchanged; new `tests/approach.spec.ts` (11 cases). Orientation copied from `rallyLandingMetrics` to avoid a future import cycle with `viz-model.ts`. A pass whose reply zone is Middle or missing counts as crosscourt; an approach with no landing has `lane`/`wing` null.
**follow-ups:**

1. Have `viz-model.ts` share `approachLateralM` so the two copies of the orientation cannot drift.
2. Product check: should a pass tagged Middle read as crosscourt, or get its own row?

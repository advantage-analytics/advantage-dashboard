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

## T4 · Let saved views store the approaches cut — done

**gate:** mechanical pass · completion pass
**changed:** New `supabase/migrations/20261117222932_saved_views_approaches.sql` re-creates `saved_views_cut_check` with `approaches` added to the six existing cuts. Live constraint read first (six cuts, as expected), applied through the Supabase MCP `apply_migration` on the first attempt, re-read after (seven cuts); the filename matches the version live recorded.
**follow-ups:**

1. Live has two migrations with no local file in this worktree (`20261117182112_label_todo`, `20261117183517_label_todo_newest_job`), presumably another branch's.

## T5 · Add approaches labels, cut kind and URL state — done

**gate:** mechanical pass · completion pass
**changed:** `isPlacementCut("approaches")` is true; `legendItemsFor("approaches", "scatter")` gives Won, Lost, Forehand, Backhand; `viz-url.ts` parses `cut=approaches` (scatter only), adds `OPTIONS.entry` / `approachTo` / `approachDir` and the `ventry` / `vto` / `vdir` params, with directions written as short codes (`crosscourt`, `middle`, `dtl`) through a new `urlValueFor`, and clears them when leaving the cut. `saved-views-logic.ts` and `viz-analytics.ts` map through `urlValueFor`; `rowNoun` and `cutNoun` now read "approaches". Round-trip, old-URL, legend, placement and saved-view specs added.
**follow-ups:**

1. `bandKindFor("approaches")` now returns `"depth"` (it follows `isPlacementCut`); decide whether a scatter-only cut should return `null` so the chart menu offers no bands.
2. "Middle" labels both an Approach to value and a Direction value; T10's sentence should tell them apart ("To the middle" / "Middle").
3. `activeFilterEntries` lists the baseline `entry: ["approach"]` like any filter; T10 must treat it as the card's baseline.

## T6 · Add the full vertical court frame and pair projection — done

**gate:** mechanical pass · completion pass
**changed:** `court-geometry.ts` (append only) exports `fullVerticalToScreen`, `FULL_COURT_VERTICAL` (opened `viewBox` 118 −142 244 482, wall `cardViewBox` 130 −104 220 418, `groupTransform` rotate(-90 240 104.5), baselines, lane spans and label points on the apron), `FullVerticalLane` and `projectApproachPair` (placement in the far half, contact in the near half, hitter's right is screen right, clamped to the opened viewBox). New court-geometry specs pin the frame, the halves, the lane-to-label mapping and the apex-up triangle.
**follow-ups:**

1. Points clamp to the opened viewBox only; on the tighter wall card a serve contact far behind the baseline would be clipped. T7 may clamp to `cardViewBox` there.
2. `subjectBaselineX` is `RETURN_COURT.farBaselineX` (40): the names read reversed from `RETURN_COURT`'s near/far.

## T7 · Draw approach pairs and labels in CourtArt — done

**gate:** mechanical pass · completion pass
**changed:** `court-art.tsx` gains `ApproachCourtArt` for the `approaches` cut: the court inside the rotated group, each dot a `data-approach-pair` group with an unjoined contact mark and placement mark, backhands apex-up through a new `CourtMark` `triangleKind` override. With `labels`, Placement / Contact and the hand-aware wing names sit on the apron in `--font-mono` and `--surface-dark`; without, the wall card uses `cardViewBox` and clamps to it. The landscape court drawing was extracted into `ReturnCourtSurface` / `ReturnCourtLines`, shared with the return frames (same output). New harness `tests/viz-approach-court-browser.spec.ts` with fixture `tests/fixtures/viz-approach-court-harness.tsx`.
**follow-ups:**

1. Wing labels are inferred from the dots; if a filter leaves no dot with a known hand, a left-handed opponent's labels fall back to right-handed wording. An explicit opponent-hand prop would fix it.
2. On the approaches frame, heat and zones draw only the court (the cut is scatter only).
3. v9 draws small centre marks on each baseline; the existing return court never did, so they were left out.

## T8 · Make a pair one interactive mark in the opened court — done

**gate:** mechanical pass · completion pass
**changed:** `lightbox-court.tsx` draws a pair dot as one interactive group with two marks (contact in the near half, placement in the far half of the lightbox's upright court): hovering or focusing either rings both, selecting rings both, dims the rest to `UNSELECTED_OPACITY` and appends an aria-hidden, pointer-less copy so the pair sits on top without moving the focused node. `viz-readout.ts` gains an optional `part` line ("Contact" / "Placement") and `placeApronReadout` (outward, then the other side, then above). New harness `tests/viz-approach-lightbox-browser.spec.ts` (+ fixture) and `placeApronReadout` cases in `tests/viz-readout.spec.ts`; `viz-mark-roving.ts` unchanged.
**follow-ups:**

1. The lightbox opens framed on the far half (as for every landing cut), so approach contacts start below the stage until "Full court" is pressed; selecting a pair centres on the placement and can push the contact off-screen. Fix in `viewerInitialTransform` (`court-geometry.ts`); no queued task covers it.
2. The opened court has no Contact / Placement / wing labels: T7 added them to `CourtArt` only, and the lightbox draws its own court. No queued task covers it.
3. The raised copy's hover scale (1.4) repeats a value in `globals.css`; keep them in step.

## T9 · Add the Approaches wall card — done

**gate:** mechanical pass · completion pass
**changed:** `DEFAULT_CUTS` gains the Approaches cut after Rally shots (`entry: ["approach"]`, pills `["Approaches"]`), in the judged and unjudged lists; the wall has six cards per player. `wallSummaryFor("approaches")` gives To backhand / Middle / To forehand segments and "Won x of n" (from the KPI, so unplaced approaches count), plus a `countNote` "n not drawn: no landing recorded"; `wall-card.tsx` shows that note and adds it to the aria-label; `lightboxCountLine` reads won from the KPI for this cut. Specs: wall-summary (cuts, tiles, segments, not-drawn line, zero-net-points tile); tile and card counts updated in `viz-rally-placement.spec.ts` and `player-season-viz.spec.ts`.
**follow-ups:**

1. T13: the season merge drops the KPI, so a season card's "Won x of n" counts wins among drawn approaches only while n counts all.
2. The card's noun is always "approaches"; a saved view with another "How you came in" choice would want "times at the net" (`approachNoun` is not exported).
3. On a wing-filtered saved view, the not-drawn number is capped at 0 rather than going negative; worth a proper fix when saved views of this cut are tested.

## T10 · Add approach filters to the panel and sentence — done

**gate:** mechanical pass · completion pass
**changed:** The Approaches Filters panel leads with three checklist sections (How you came in, Approach to, Direction) with counts; no other cut shows them. `activeFilterEntries` lists every ticked value, with Approach to worded "To their backhand / To the middle / To their forehand". A new `DefaultCut.floor` keeps the card's `entry: ["approach"]` out of the strip and makes Clear return to it; the strip appends "Assumes right-handed" (new `sentenceNote` on `viz-lightbox-shell.tsx`) when a shown point assumed the hand. New harness `tests/viz-approach-filters-browser.spec.ts` (+ fixture) and an updated `viz-url.spec.ts` case. No new empty-state returns.
**follow-ups:**

1. The season lightbox (`player-season-viz.ts`) has its own copy of the baseline/Clear rule: it does not use `floor` yet and shows no hand note. Fold into T13 or a follow-up.
2. `save-view-dialog.tsx` / `cut-menu.tsx` count `activeFilterEntries`, so the card's own `entry: ["approach"]` counts as a filter there; the save dialog may suggest "Approach" as a name.

## T11 · Word the point list for approaches — done

**gate:** mechanical pass · completion pass
**changed:** New pure `approachDetail` in `match-filters/approach.ts` ("Forehand down the line, to their backhand"; "Serve and volley · " / "Drawn in · " prefixes; no dangling separator without a direction; a middle ball to the middle reads "down the middle"). `pointDetail`'s flag tail extracted into an exported `pointFlags` with unchanged output. `lightbox-point-list.tsx` shows the approach line plus the flags only on the approaches cut. New `approachDetail` cases in `tests/approach.spec.ts`.
**follow-ups:**

1. The season lightbox does not use `LightboxPointList`; for the same wording on the season card it needs its own hook-up to `approachDetail`.
2. A point that is not an approach falls back to `pointDetail`'s line on the approaches cut (documented in code).

## T12 · Pass lob keys to the Visualizations tab — done

**gate:** mechanical pass · completion pass
**changed:** New `VizLobKeysProvider` (`shots/viz-lob-keys.tsx`, context in `shots/viz-lob-keys-context.ts`) reads lob keys with `useBallPathsRoute` / `useLobShotKeys`, enabled only when `meta.isDerived && route.allowed` (null on share links, the sample and before load); `ShotsTab` mounts it once. `useVizFilterContext` merges `lobKeys` (plus the live bands) through a pure `vizFilterContext`; `viz-wall.tsx`, `saved-views-band.tsx` and `lightbox-point-list.tsx` now use it, as the lightbox already did. No new fetch or endpoint. New `tests/viz-lob-keys.spec.ts`; `tests/report-empty-states.spec.ts` stubs the provider. `use-viz-view.ts` imports `viz-bands-context` by its `@/` path so the gallery spec's bundle keeps its mock.
**follow-ups:**

1. A browser spec mounting `ShotsTab` on an Advantage Intelligence match with a stubbed ball-paths response, checking a "Lobbed" row on both the card and its lightbox (no current harness covers the loaded case).
2. Confirm `film/use-film-filter-context.ts` (`sourceProvider === "splitstep"`) and this tab (`meta.isDerived`) cannot diverge.
3. Wall and saved cards now read the live bands too: a saved view with a Contact or Landed-in filter buckets by the same bands as its lightbox (small behaviour change).

## T13 · Carry approaches through the season card — blocked

**gate:** mechanical FAIL (lint pass, typecheck pass, tests: 2 failed of ~10,700) · completion not run
**reason:** `tests/player-season-loader.spec.ts:857` ("loadPlayerSeasonCourts reads the season's matches and points…") pins the exact keys of a season match, and the task added `playerHand` (read in `player-season-server.ts` so the opponent's court can use the player's hand) without updating that list. Real, and a one-line spec update. The second failure, `tests/r2-delete-and-fallback.spec.ts:425` (R2 copy queued when Azure deletes fail), touches nothing on this branch and passed in all twelve earlier gates; likely flaky, not this task's.
**stash:** ed5dd836dc014719d2b362e6e17997676f3bb1c7
**what the stashed work does:** season Approaches card computed per match with that match's hands (`seasonMatchContext` gains a cut argument; hands only on `approaches`), a new optional `playerHand` on season matches, pair contacts carried on `result.dots[i].pair` (millimetre-rounded), `mergeApproachKpi` so "Won x of n" sums across matches, `DefaultCut.floor` and the "assumes right-handed" note in the season lightbox, `approachNoun` exported; 7 new `player-season-viz` cases.
**to unblock:** `git stash apply ed5dd836dc014719d2b362e6e17997676f3bb1c7`, add `"playerHand"` to the key list at `tests/player-season-loader.spec.ts:889`, re-run the gate, reset T13 to `todo` or commit by hand.

## T13 · Carry approaches through the season card — done

**gate:** mechanical pass · completion pass (re-run after the block above)
**changed:** Stash ed5dd836 applied unchanged, plus `"playerHand"` added to the season match key list in `tests/player-season-loader.spec.ts` (the one-line fix that blocked it). Season Approaches card computed per match with that match's hands (`seasonMatchContext` gains a cut argument, hands only on `approaches`), optional `playerHand` on season matches (`player-season.ts`, `player-season-server.ts`), pair contacts on `result.dots[i].pair` (millimetre-rounded; `SeasonDotPoint` unchanged), `mergeApproachKpi` so "Won x of n" sums across matches, `DefaultCut.floor` and the "assumes right-handed" note in the season lightbox, `approachNoun` exported from `viz-model.ts`. 7 new `player-season-viz` cases. The `r2-delete-and-fallback` failure from the first run did not recur.
**follow-ups:**

1. The match report infers an unrecorded hand from strokes (`inferHand`); the season assumes right-handed and flags it, so a match with no stored hand can show different wings on the season than on its report.
2. `SEASON_HAND_ASSUMED_NOTE` and `FLOOR_LOOSENED_LABEL` copy strings from the client-only `viz-lightbox.tsx`; a shared pure module would remove the copies.
3. The season lightbox has no Points list, so `approachDetail` wording does not appear there.

## T14 · Map match hands to seats, not the viewer — done

**gate:** mechanical pass · completion pass
**changed:** `transformDbMatchToMatch` (`match-detail-server.ts`) reads `player_hand` / `player_backhand` for seat one and `opponent_hand` / `opponent_backhand` for seat two whichever seat the report is turned to, each falling back to that seat's own profile; `playerHands` doc comment updated (and a stale comment in `tests/player-hands.spec.ts`). New `tests/match-hands-seat.spec.ts` covers seat one, seat two, neither seat and `pinnedSeat: "player2"`. `player-season-server.ts` and `labels-server.ts` untouched.
**follow-ups:**

1. The four legacy rows with only `player2_id` set now read differently on the report (by seat) and in the label console (`enteredHandsFor`, creator's hand on seat two); decide which is right and backfill or align. Stale comments: `labels-server.ts` ~123 and ~722, `services/labels/session.ts` ~481, `tests/label-entered-hands.spec.ts`.
2. Reports turned to seat two now show the hands the other way round from before (the intended fix); worth an eyes-on of Approaches wings and Direction inside-out on such a report.

## T15 · Open Approaches on its baseline without the card — done

**gate:** mechanical pass · completion pass
**changed:** A bare `cut=approaches` now reads `entry: ["approach"]` on the report and the season page (`parseVizState` fills the floor only when its `match` argument is passed, so the saved-view validator's read is unchanged); "every way in" is spelled `ventry=any`. New `filtersForCut` (carryFilters plus the floor only when the cut changes) drives `cut-menu.tsx` `selectCut`. The stage's `hasFilters` no longer counts a held floor (`viz-lightbox.tsx`, `player-season-viz.ts`), so an empty Approaches court reads "No approaches recorded for … yet". Specs in `viz-url.spec.ts`, `player-season-viz.spec.ts` and the filters harness (new `?net=never`).
**follow-ups:**

1. The View menu has no Approaches item; `filtersForCut` lands it on the floor if one is added.
2. With `ventry=any` and no net points, the stage reads "none recorded" while the strip says "How you came in: any", with no Clear link on the stage.
3. The Unforced errors card has filters but no `floor`, so an empty one opened from the wall still reads "No errors match these filters".
4. Check MCP `open_visualization` and any other `cut=approaches` link builder now that a bare cut means approaches only.

## T16 · Frame the opened Approaches court on its full length — done

**gate:** mechanical pass · completion pass
**changed:** `viewerInitialTransform("approaches")` fits a new `VIEWER_APPROACH_FRAME` (both baselines plus 32 units of apron, centred both ways) before the landing-cut branch; other cuts unchanged. `glideToMark` glides a selected pair to the midpoint of its contact and placement, with the zoom capped (new optional `maxZ` on `use-pan-zoom.ts` `glideTo`) so both marks fit; `pairContactPoint` exported from `lightbox-court.tsx`. New specs in `court-geometry.spec.ts` (three stage sizes) and the approach lightbox harness (all marks on stage at open; both marks after selecting each pair, including from a zoomed-in court).
**follow-ups:**

1. `viewerLandingHalf("approaches")` still returns `"far"`; return `null` or document the exception.
2. Contacts more than about 1.9 m behind the baseline start just off the stage; the apron can grow to 43 units before it equals "Full court".

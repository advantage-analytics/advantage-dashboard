# Tasks — claude/approach-heatmap-design-1ef8c8

> Scope: Approaches card on the match and season Visualizations tabs (feature pipeline `work/approach-heatmap/`).

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

## T1 · Add the approach classifier

- **status:** done
- **model:** opus
- **files:** (guess) new `src/components/dashboard/matches/match-detail/match-filters/approach.ts`; new `tests/approach.spec.ts`; reads `match-filters/net-game.ts` and `shots/viz-model.ts` (`rallyLandingMetrics`) without changing them
- **done when:**
  - [ ] `approach.ts` exports a pure `approachOf(point, isPlayer1, lobKeys, opponentHand)` (no React import), and `net-game.ts` is not modified
  - [ ] `tests/approach.spec.ts` asserts `approachOf` is `null` exactly where `cameToNet` is false, and that its `entry` and ending equal `netEntryOf` / `netEndingOf` on the same fixture points
  - [ ] The spec asserts the same lane gives the opposite `wing` for a left-handed opponent, and that a `null` hand is treated as right-handed with `handAssumed: true`
  - [ ] The spec asserts a serve-and-volley approach has `direction: null`
  - [ ] The spec asserts the ending buckets: passed down the line, passed crosscourt, lobbed, won at the net (winner and opponent error together), your error; and with `lobKeys` null nothing is lobbed and the two passed buckets are the "passed or lobbed" pair
- **notes:** Plan step 1 (`work/approach-heatmap/03_plan/output/plan.md`); design in `02_design/output/design.md` under "New: …/approach.ts". `lane` is geometric thirds of the opponent's singles court seen from the hitter; use `rallyLandingMetrics`' orientation so end changes are handled. Right-handed opponent facing the hitter: their forehand is the hitter's left. `direction` is the approach shot's `zone`. Do not change any Net game rule.

## T2 · Add the approaches cut to the viz model

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-model.ts`; `tests/viz-model.spec.ts`; one-line entries in the `Record<Cut, …>` maps (`shots/viz-labels.tsx`, `shots/viz-analytics.ts`, `shots/court-art.tsx`, `src/lib/data/player-season-viz.ts`)
- **done when:**
  - [ ] `Cut` includes `"approaches"`; `chartsFor("approaches")` is scatter only; `VizFilters` and `EMPTY_VIZ_FILTERS` carry empty `entry`, `approachTo` and `approachDir`; `filterKeysFor("approaches")` includes the three and no other cut's key list changes
  - [ ] `tests/viz-model.spec.ts` asserts each of `entry`, `approachTo` and `approachDir` narrows `computeViz(…, "approaches", …)`'s count
  - [ ] The spec asserts a net point with no approach landing is counted in `count` and `total` but yields no dot; a point with contact and landing yields one dot whose `lateralM`/`depthM` are the placement and whose `pair` is the contact; a landing with no contact yields a dot with no `pair`
  - [ ] The spec asserts that with the opponent as subject the wing follows the player's hand (it flips when the player is left-handed)
  - [ ] An agreement spec asserts, for the existing fixture points and both seats, that the cut with all three entries equals `netGameTally` in count and in each ending, with `matchCtx.lobKeys` null and with it set
- **notes:** Plan step 2. `computeApproachViz` is dispatched from `computeViz` like the rally and errors cuts and reads the subject seat, filters, `matchFilterPass`, `matchCtx.lobKeys` and `matchCtx.hands`. The subject seat comes only from the caller's `subjectIsPlayer1` (`docs/ui-revamp-guardrails.md` §4). `VizDotMeta` gains `entry`, `wing`, `direction`, `ending`, `handAssumed`. Adding to `Cut` breaks `npm run typecheck` at every `Record<Cut, …>` map until each has an entry: add the minimal entry ("Approaches") here; T5 and T13 own the rest of the wording. No existing viz-model spec case may change.

## T3 · Compute the Approaches statistics

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-model.ts` (`computeVizStats`); `tests/viz-model.spec.ts`; `shots/lightbox-stats.tsx` only if its group renderer needs a new row kind
- **done when:**
  - [ ] `tests/viz-model.spec.ts` asserts the approaches KPI tiles on a fixture: the count, labelled "of N approaches" only when a filter narrows it, and Won %
  - [ ] The spec asserts an "Approach to" group with their backhand, middle and their forehand rows, each with Won x of n and %
  - [ ] The spec asserts the "Direction" group is absent when no pooled point has a direction (a serve-and-volley-only pool) and present otherwise
  - [ ] The spec asserts "How it ended" has the five rows with count and share, the counts summing to the KPI count; with lob keys unknown the rows read "Passed or lobbed down the line" / "Passed or lobbed crosscourt" and there is no Lobbed row
  - [ ] The spec asserts each group ignores its own filter and follows the others (with `approachTo` set, the Approach to rows keep all three wings' counts while Direction and How it ended narrow)
- **notes:** Plan step 3. Rows are picks like every existing stat row; reuse the existing row type.

## T4 · Let saved views store the approaches cut

- **status:** done
- **model:** fable
- **files:** (guess) new `supabase/migrations/<timestamp>_saved_views_approaches.sql`
- **done when:**
  - [ ] A new migration under `supabase/migrations/` re-creates `saved_views_cut_check` on `public.saved_views` allowing `'approaches'` plus the six existing cuts (`serve`, `returnPlacement`, `returnContact`, `rallyPosition`, `rallyPlacement`, `errors`)
  - [ ] The file's header comment records the date the live constraint was read and what it held, as `20261006120000_saved_views_errors_cut.sql` does
  - [ ] The migration changes nothing else: no other constraint, column, policy or grant (the `chart` check stays, since `scatter` is already allowed)
- **notes:** Plan step 4. Before writing, read the live constraint (Supabase MCP `execute_sql` on `pg_constraint`); it allowed six cuts on 2026-11-17. If it holds anything else, stop and report rather than guess. Apply through the Supabase MCP (`apply_migration`) and name the file with the version live records. `apply_migration` has declined DROP statements before: if it is declined, do not retry or route around it; leave the file and say so in the report so the author can apply it. Never hand-format the migration. The saved-views spec case lives in T5, because `validateVizInput` goes through `parseVizState`.

## T5 · Add approaches labels, cut kind and URL state

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-labels.tsx`, `shots/cut-kinds.ts`, `shots/viz-url.ts`; `tests/viz-url.spec.ts`, `tests/viz-labels.spec.ts`, `tests/saved-views-logic.spec.ts`
- **done when:**
  - [ ] `tests/viz-url.spec.ts` round-trips (`vizStateQuery` → `parseVizState`) a state with `cut: "approaches"` and every value of `entry`, `approachTo` and `approachDir`
  - [ ] The spec asserts a URL with none of the new params parses as before, and no existing viz-url assertion is edited
  - [ ] `legendItemsFor("approaches", "scatter")` returns Won, Lost, Forehand and Backhand, asserted in `tests/viz-labels.spec.ts`
  - [ ] `isPlacementCut("approaches")` is true in `shots/cut-kinds.ts`
  - [ ] `tests/saved-views-logic.spec.ts` asserts `validateVizInput` accepts `cut: "approaches"` with `chart: "scatter"` and filters using the three new groups
- **notes:** Plan step 5, plus step 4's spec case. `CUT_LABEL` / `CUT_NOUN` get their minimal entries in T2; finish their wording here if needed. `viz-url.ts` `OPTIONS` holds the option labels the Filters panel and sentence read (T10 builds on them). `viz-analytics.ts` quotes `cut` values from its typed `CUTS` map, so the new cut is covered once T2 lists it.

## T6 · Add the full vertical court frame and pair projection

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/court-geometry.ts`; `tests/court-geometry.spec.ts`
- **done when:**
  - [ ] `court-geometry.ts` exports `FULL_COURT_VERTICAL`: the `RETURN_COURT` geometry rotated -90°, full length, the subject's baseline at the bottom, with apron beyond both baselines; asserted in `tests/court-geometry.spec.ts`
  - [ ] The spec asserts `projectApproachPair` puts the contact in the near (bottom) half and the placement in the far (top) half
  - [ ] The spec asserts the lane thirds map to the three wing label positions (a placement in the hitter's left third projects under the left label)
  - [ ] The spec asserts a backhand triangle on this frame has its apex as the topmost point
  - [ ] No existing frame's exported values change and no existing court-geometry assertion is edited
- **notes:** Plan step 6, split: this is the pure half; T7 draws with it. Marks are drawn in screen space, so use `trianglePointsFor("serve", …)` for the apex-up triangle.

## T7 · Draw approach pairs and labels in CourtArt

- **status:** done
- **model:** opus
- **needs:** T6
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/court-art.tsx`; a harness spec in the pattern of `tests/viz-rally-placement-browser.spec.ts` with its fixture under `tests/fixtures/`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A committed harness spec renders `CourtArt` for the approaches cut and asserts a dot with `pair` draws two marks (contact and placement) carrying the same dot id with no line joining them, and a dot without `pair` draws its placement alone
  - [ ] The spec asserts "Contact", "Placement" and the three wing names appear when `labels` is set and are absent when it is not
  - [ ] The spec asserts the wall-card art uses a tighter viewBox than the labelled opened view
  - [ ] Label ink and marks use existing design-system tokens; the diff adds no raw hex colour
  - [ ] No existing browser spec assertion for the other five cuts is edited or removed
- **notes:** Plan step 6, split: the drawing half. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. The look to match is `work/approach-heatmap/02_design/references/approach-map-v9.html`; that comparison is the eyes-on stage's (see `routes:`), not a criterion. Labels are dark ink on the apron only, never on the court.

## T8 · Make a pair one interactive mark in the opened court

- **status:** done
- **model:** opus
- **needs:** T7
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx`, `shots/viz-readout.ts`, `shots/viz-mark-roving.ts`; `tests/viz-readout.spec.ts`, `tests/viz-mark-roving.spec.ts`, a harness spec in the pattern of `tests/viz-lightbox-shell-browser.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A committed harness spec asserts hovering either mark of a pair rings both, and the readout names the hovered mark ("Contact" or "Placement")
  - [ ] The spec asserts selecting a pair rings both marks, draws the pair last among the marks, and dims every other mark to `UNSELECTED_OPACITY`
  - [ ] A spec asserts keyboard roving treats a pair as one stop and Enter/Space selects it, as for a single mark
  - [ ] `tests/viz-readout.spec.ts` asserts the readout on this frame opens outward into the apron, then the other side, then above
  - [ ] No existing assertion for single-mark cuts (Rally shots selected and dimmed states included) is edited or removed
- **notes:** Plan step 7. One interactive group per pair dot. If the shell harness cannot take an approaches result from plain props, build the fixture result by hand rather than depending on later tasks.

## T9 · Add the Approaches wall card

- **status:** done
- **model:** opus
- **needs:** T3, T4, T7
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/default-cuts.ts`, `shots/default-tiles.ts`, `shots/wall-summary.ts`; `tests/wall-summary.spec.ts`; card-count assertions in `tests/player-season-viz.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] `DEFAULT_CUTS` gains `{ cut: "approaches", chart: "scatter", name: "Approaches", filters: { entry: ["approach"] } }` after the Rally shots entry, in the judged and unjudged lists alike, and `tests/wall-summary.spec.ts` asserts six cuts in order and twelve tiles, six per player
  - [ ] The spec asserts `wallSummaryFor("approaches", …)` gives the segments To backhand / Middle / To forehand, summing to the card's count, with `keyLead` "Won x of n"
  - [ ] The spec asserts the count line reads "n not drawn: no landing recorded" when points lack a placement and carries no such line when all are drawn
  - [ ] The spec asserts a subject with no net points gets an approaches tile with a count of 0
- **notes:** Plan step 8. `buildSeasonCards` reads `defaultCutsFor`, so the season gains a sixth card with this change: update the season spec's "five cards" counts (`tests/player-season-viz.spec.ts`) and leave the rest of the season to T13. T4 comes first so the cut can be saved once the card exists. On-screen checks for the eyes-on stage: six cards for You and the opponent, and the wall's existing empty state for a subject with no net points.

## T10 · Add approach filters to the panel and sentence

- **status:** done
- **model:** opus
- **needs:** T5, T9
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/lightbox-filters.tsx`, `shots/viz-url.ts` (`activeFilterEntries`), `shots/viz-lightbox.tsx`; `tests/viz-url.spec.ts`, `tests/viz-lightbox-browser.spec.ts` or `tests/viz-lightbox-shell-browser.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A committed harness spec asserts the Filters panel on the approaches cut shows three checklist sections, "How you came in", "Approach to" and "Direction", and that none of them appears on another cut
  - [ ] `tests/viz-url.spec.ts` asserts `activeFilterEntries` returns one labelled entry per ticked value of `entry`, `approachTo` and `approachDir`
  - [ ] A spec asserts the card's baseline `entry: ["approach"]` is not listed as an applied filter, ticking Serve and volley is, and Clear returns to approaches only
  - [ ] A spec asserts the applied-filter sentence says "assumes right-handed" when any shown point has `handAssumed` and omits it otherwise
- **notes:** Plan step 9. Checklists, not segmented controls (plan decision Q7). Reuse the panel's existing section types and the existing baseline rule in `viz-lightbox.tsx` (a card's own filters are not repeated in the strip). Read the design skill first. `match-filters/applied-words.ts` is the Video tab's sentence; the viz sentence is built from `activeFilterEntries`.

## T11 · Word the point list for approaches

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/lightbox-point-list.tsx`, `match-filters/approach.ts` or `film/film-shots.ts`; `tests/approach.spec.ts` or `tests/film-shots.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A pure function returns the approaches detail line, and a spec asserts "Forehand down the line, to their backhand" for an approach fixture
  - [ ] The spec asserts the line starts "Serve and volley · " or "Drawn in · " for those entries and has no prefix for an approach
  - [ ] The spec asserts a point with no direction yields a line with no direction word and no dangling separator
  - [ ] `lightbox-point-list.tsx` uses the new line only on the approaches cut; `pointDetail`'s signature and output are unchanged and no existing spec of it is edited
- **notes:** Plan step 10. `pointDetail(point, hands)` is shared with the Video tab's list and the admin label rows, so add beside it rather than changing it. Clip behaviour is unchanged: a second click on a lit row still opens the clip, which the eyes-on stage checks.

## T12 · Pass lob keys to the Visualizations tab

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/use-viz-view.ts` (`useVizFilterContext`), `shots/viz-wall.tsx`, `shots/saved-views-band.tsx`; reuses `film/use-ball-paths.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] The Visualizations tab's filter context carries `lobKeys` read with `useLobShotKeys` and `useBallPathsRoute` (the hooks the Statistics and Video tabs use); the diff adds no new fetch or endpoint
  - [ ] The fetch is enabled only for an Advantage Intelligence match whose route is allowed; on a read-only mount (share link, sample) and before the file loads, `lobKeys` stays null
  - [ ] The wall cards and the opened view read the same lob-aware context, so a card and its lightbox cannot disagree
- **notes:** Plan step 11. Pattern to copy: `film/use-film-filter-context.ts`. The count agreement with the Net game card when lob keys are known is asserted by T2's agreement spec. `viz-wall.tsx` and `saved-views-band.tsx` read `useMatchFilters().context` directly today. Use the `trace-route` skill before editing.

## T13 · Carry approaches through the season card

- **status:** done
- **model:** fable
- **needs:** T3, T7, T9
- **files:** (guess) `src/lib/data/player-season-viz.ts`, `src/components/dashboard/team/player-profile/season-viz-lightbox.tsx`; `tests/player-season-viz.spec.ts`
- **routes:** `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] `tests/player-season-viz.spec.ts` asserts a two-match season with a right-handed and a left-handed opponent puts each approach in the correct wing after `mergeVizResults`
  - [ ] The spec asserts a pair dot's contact survives the season lightbox's server-to-client data (through any encode and decode helpers) and that `dotPoints` stays one per dot in order
  - [ ] The spec asserts the season approaches endings read "Passed or lobbed …" with no Lobbed row
  - [ ] `SEASON_CUT_LABEL` and `cutNoun` have their approaches entries, and the spec asserts `buildSeasonCards` returns the Approaches card
  - [ ] No existing season card's assertions are edited beyond the card count
- **notes:** Plan step 12. Each match is computed with its own `seasonMatchContext` (that match's hands) before merging. The season loads no lob files (plan decision Q8). Clips use the season lightbox's existing "open that match's Video tab" behaviour, which the eyes-on stage checks. The plan says `SeasonDotPoint` should carry the contact, but that tuple is a point reference (`[match, pointNumber, set, game, server]`) and positions travel in `result.dots`; pick whichever encoding meets the second criterion and say which in the report.

## T14 · Map match hands to seats, not the viewer

- **status:** done
- **model:** fable
- **files:** (guess) `src/lib/data/match-detail-server.ts` (`transformDbMatchToMatch`, the hand block near line 263); doc comment in `src/components/dashboard/matches/player-hands.ts`; new `tests/match-hands-seat.spec.ts` (or cases beside the seat tests in `tests/insight-voice.spec.ts`, which already imports the transform)
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A committed spec calls `transformDbMatchToMatch` on one row (`player_hand: "left"`, `opponent_hand: "right"`, both seat ids set) and asserts `player1.hand` is left and `player2.hand` is right for a viewer in seat one, a viewer in seat two, a viewer in neither seat with seat two on the roster, and `pinnedSeat: "player2"`
  - [ ] The spec asserts the same for the backhands: `player_backhand` on `player1.backhand` and `opponent_backhand` on `player2.backhand`, whichever seat the report is turned to
  - [ ] The spec asserts a null row column still falls back to that seat's own profile (the `profiles` entry for that seat's id) in both orientations
  - [ ] The spec asserts `playerHands()` of the report turned to seat two gives `{ player1: "left", player2: "right" }` for that row, and the doc comment on `playerHands` no longer describes an `isUserPlayer1` swap
  - [ ] `player-season-server.ts` and `labels-server.ts` (`enteredHandsFor`) are not modified
- **notes:** From /pr-check receipt 4ca777c. Guardrails §4: read `docs/ui-revamp-guardrails.md` first. The wizard writes `player_hand` for seat one (`new-match-wizard/utils.ts` `buildMatchData`: `player1_name = formData.playerName`, `player_hand = formData.playerHand`); the edit dialog, `label-overview-server.ts` and the season loader (`player-season-server.ts` ~431) already read by seat. Today the transform swaps on `isUserPlayer1`, so the same row gives different hands to different viewers, and the Approaches wings, Direction inside-out and the point-list wording mirror on a report turned to seat two. Everything reads these through `playerHands` → `ctx.hands`; the share link uses the same transform. No existing spec pins the old mapping. Known disagreement left alone on purpose: `enteredHandsFor` reads `player_*` as seat two's on a row with only `player2_id` set (four live legacy imports, one with differing hands); do not change it here, and say in the report that those rows now read differently on the report and in the label console.

## T15 · Open Approaches on its baseline without the card

- **status:** done
- **model:** fable
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-url.ts` (`parseVizState`, `vizStateQuery`), `shots/cut-menu.tsx` (`selectCut`), `shots/default-cuts.ts` (`floor`); `src/lib/data/player-season-viz.ts` (`parseSeasonVizState`); `tests/viz-url.spec.ts`, `tests/viz-approach-filters-browser.spec.ts` + `tests/fixtures/viz-approach-filters-harness.tsx`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] A committed spec asserts the state the report reads from a query of `cut=approaches` with no How-you-came-in param has `entry: ["approach"]`, that `parseSeasonVizState` gives the same, and that a query carrying a `ventry` value is read as written
  - [ ] The harness spec opens the Approaches cut by URL with no `ventry` and asserts no filter strip, the Filters button not engaged and the Approach checkbox ticked
  - [ ] A committed spec asserts that picking Approaches from the View menu on another cut lands on `entry: ["approach"]` with no "How you came in: any" in the strip
  - [ ] The existing "Approach unticked (every way in)" assertions in `tests/viz-approach-filters-browser.spec.ts` are not edited, and a spec asserts a state with `cut: "approaches"` and an empty `entry` survives `vizStateQuery` → the same read as an empty `entry`; `validateVizInput` still accepts a view with an empty `entry` as written
  - [ ] The harness spec opens the cut by URL for a player with no approaches and asserts the stage reads "No approaches recorded for … yet", not "No approaches match these filters"
- **notes:** From /pr-check receipt 4ca777c. The baseline is `DefaultCut.floor` (`{ entry: ["approach"] }`, added by T10); `viz-lightbox.tsx` and `buildSeasonLightbox` already treat a held floor as no filter, so the fix is where the state is made, not in the strip. Do not put the floor in `carryFilters` unconditionally: `chart-menu.tsx` and `lightbox-advanced-panel.tsx` call it with the cut unchanged, which would undo a reader's untick. The season lightbox is rebuilt on the server from the URL on every change, so if a bare `cut=approaches` now means approaches only, "every way in" needs its own spelling in the URL (fourth criterion). `parseVizState` without its `match` argument is the saved-view validator's read and must not rewrite a stored view. An existing `viz-url.spec.ts` assertion that pins `cut=approaches` to an empty `entry` may change; no other may. Not in scope: `save-view-dialog.tsx` and the cut menu counting the floor as a filter (T10 follow-up 2).

## T16 · Frame the opened Approaches court on its full length

- **status:** done
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/court-geometry.ts` (`viewerInitialTransform`), `shots/viz-lightbox-shell.tsx` (`glideToMark`); `tests/court-geometry.spec.ts`, `tests/viz-approach-lightbox-browser.spec.ts` + `tests/fixtures/viz-approach-lightbox-harness.tsx`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] `tests/court-geometry.spec.ts` asserts that under `viewerInitialTransform("approaches", stage)`, for the stage sizes the suite already uses, both of `VIEWER_COURT`'s baselines fall inside the stage and the court is centred horizontally
  - [ ] The harness spec asserts that on open, before any click, every contact mark and every placement mark lies inside the stage's box
  - [ ] The harness spec asserts that after a pair is selected, both of its marks lie inside the stage's box
  - [ ] No existing `viewerInitialTransform`, `viewerFullCourtTransform` or framing assertion for another cut is edited, and the other cuts' transforms are unchanged
- **notes:** From /pr-check receipt 4ca777c (T8 follow-up 1). `viewerInitialTransform` has no approaches case: `isLandingCut` sends it down the far-half branch, so contacts start below the stage, and `glideToMark` centres on the placement at 150% of that frame, which can push the contact off. The zoom readout's 100% and the `0` key follow `viewerInitialTransform`, so they move with it. How the selection keeps both marks in view (no glide, a glide to the pair's midpoint, a capped zoom) is the runner's call; say which in the report. The season lightbox uses the same shell.

## T17 · Draw the apron labels in the opened Approaches court

- **status:** done
- **model:** opus
- **needs:** T16
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx`; `shots/court-art.tsx` only to share the label constants; `tests/viz-approach-lightbox-browser.spec.ts` + `tests/fixtures/viz-approach-lightbox-harness.tsx`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] The harness spec asserts the opened Approaches court shows "Placement", "Contact" and, left to right, "Their FH", "Middle", "Their BH" when the opponent's hand is right or unknown
  - [ ] The spec asserts a known left-handed opponent swaps the outer two to "Their BH" … "Their FH"
  - [ ] The spec asserts all five labels lie inside the stage's box at the opening frame
  - [ ] The spec asserts the labels are absent from another cut's opened court, and no existing label assertion (serve zones, court sides, the wall card's "no text") is edited
  - [ ] The labels use `--font-mono` and an existing colour token; the diff adds no raw hex colour
- **notes:** From /pr-check receipt 4ca777c (T8 follow-up 2). T7 put these labels in `CourtArt` (`labels` prop, `ApproachCourtArt`), but the lightbox draws its own court on `VIEWER_COURT` and nothing passes `labels`, so they ship nowhere. Wording and look: `court-art.tsx`'s `APPROACH_LABEL_*` constants and `work/approach-heatmap/02_design/references/approach-map-v9.html`; labels sit on the apron only, never on the court. Read `.skills/advantage-analytics-design/SKILL.md` first. `CourtArt` infers the opponent's hand from the dots (`leftLaneIsForehand`), which falls back to right-handed when a filter leaves no dot with a known hand (T7 follow-up 1); the lightbox has the match's hands in its filter context, so prefer those. Needs T16 so the opening frame includes the apron the labels sit on.

## T18 · Read legacy seat-two rows' hands for seat two

- **status:** done
- **model:** fable
- **files:** (guess) `src/lib/data/match-detail-server.ts` (`transformDbMatchToMatch`, hand block ~262-272); `src/lib/data/player-season-server.ts` (~431-441); a small pure helper both call (beside `enteredSeats` in `src/lib/data/labels-server.ts`, or in `src/components/dashboard/matches/player-hands.ts`); `tests/match-hands-seat.spec.ts`, `tests/player-season-loader.spec.ts`; `tests/label-entered-hands.spec.ts` read only
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] `tests/match-hands-seat.spec.ts` calls `transformDbMatchToMatch` on a row with `player1_id: null`, `player2_id` set, `player_hand: "left"`, `opponent_hand: "right"` and differing backhands, and asserts `player2` carries the `player_*` values and `player1` the `opponent_*` values, for a viewer in seat two, a viewer in neither seat and `pinnedSeat: "player1"`
  - [ ] A spec asserts that for that legacy row and for a wizard row (both seat ids set) the transform's `player1.hand` / `player2.hand` equal `enteredHandsFor`'s `p1` / `p2` on the same row
  - [ ] A spec asserts rows with both seat ids set, with only `player1_id` set, and with neither set still read `player_*` as seat one; no existing case in `tests/match-hands-seat.spec.ts` or `tests/label-entered-hands.spec.ts` is edited
  - [ ] `tests/player-season-loader.spec.ts` asserts a season match built from the legacy row has `playerHand` from `player_hand` and `opponentHand` from `opponent_hand`, and that a row with both seat ids set and the player in seat two still has `opponentHand` from `player_hand`
  - [ ] The comment above the transform's hand block names the legacy exception, and the transform and the season loader take the seat mapping from one shared function rather than two copies of the guard
- **notes:** From /pr-check receipt 1cc5edf (T14 follow-up 1). Read `docs/ui-revamp-guardrails.md` §4 first. T14 made the transform read `player_*` as seat one. Four live rows (old SwingVision imports) have `player1_id` null and `player2_id` set; on those `player_*` is the account holder's, who sits in seat two. `enteredSeats` / `enteredHandsFor` (`labels-server.ts` ~740-775) already read them that way and `tests/label-entered-hands.spec.ts` pins it. One of the four has differing hands, so its report now shows them swapped. The season loader maps by `isPlayer1` with the wizard's meaning, so it is wrong on the same rows. The guard is `enteredSeats`' own (`!player1_id && !!player2_id`). Before relying on it, check that no current writer (the wizard, a coach recording for a roster player, the MCP draft) can produce that shape with `player_*` meaning seat one; if one can, narrow the guard (for example by `source_provider`) and say so in the report. Do not change `enteredHandsFor`'s output. Not in scope: `edit-match-dialog.tsx` ~437 and `label-overview-server.ts` ~246 also read by seat; name them in the report as still disagreeing on these four rows.

## T19 · Say how many approaches the opened court does not draw

- **status:** done
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx` (the stage's `StageCard` block ~1196); `shots/wall-summary.ts` (share the "n not drawn: no landing recorded" wording); `tests/viz-approach-filters-browser.spec.ts` + `tests/fixtures/viz-approach-filters-harness.tsx` + `tests/fixtures/approach-points.ts`; `tests/season-viz-browser.spec.ts` + `tests/fixtures/season-viz-harness.tsx`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] The harness spec opens Approaches on a fixture whose approaches all lack a landing and asserts the stage reads "N not drawn: no landing recorded", N being the Statistics KPI count, and reads neither "No approaches recorded for" nor "match these filters"
  - [ ] The spec asserts that with some approaches drawn and some not, the opened view shows the same line with the undrawn number while the drawn marks are on the court, and that the line is absent when every counted approach is drawn
  - [ ] The spec asserts the line is absent from another cut's opened court, and no existing stage empty-state assertion is edited
  - [ ] A committed spec asserts the season's opened Approaches court shows the line when a season approach has no landing
  - [ ] The wall card and the opened court take the sentence from one shared function; the diff adds no raw hex colour
- **notes:** From /pr-check receipt 1cc5edf. Real match 9e4d293e has 7 approaches and no contact or landing coordinates anywhere. The wall card says "7 not drawn: no landing recorded" (`wallSummaryFor`'s `countNote`), but the opened view is a blank court with legend "Won 0 / Lost 0" and no explanation, which is the guardrails' empty chart that reads as "nothing happened". The stage card shows only when `result.count === 0`; here count is 7 and dots are 0. `result.count - result.dots.length` is the undrawn number on this cut (use `result.dots`, not the legend-narrowed `dots`). The shell serves the season page too (`season-viz-lightbox.tsx`). Where the line sits when some marks are drawn (a quiet line by the legend, a stage chip) is the runner's call; say which in the report. Read `.skills/advantage-analytics-design/SKILL.md` and its `empty-and-loading` reference first. The existing fixture gives every approach a landing; add a query option for none and for some.

## T20 · List every counted approach in the Points pane

- **status:** done
- **model:** opus
- **needs:** T19
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-model.ts` (`computeApproachViz`, `VizResult`), `shots/lightbox-points.ts` (`pointsBehind`), `shots/viz-lightbox-shell.tsx` (`matched` ~876, strip count ~1085, pane count ~1317), `shots/viz-lightbox.tsx` (`allPointsBehind`), `shots/lightbox-filter-strip.tsx`; `tests/lightbox-points.spec.ts`, `tests/viz-model.spec.ts`, `tests/viz-approach-filters-browser.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] A committed spec asserts the Approaches cut's matched points include the point of an approach with no landing, in match order, and that no other cut's `pointsBehind` output changes (existing `tests/lightbox-points.spec.ts` cases unedited)
  - [ ] The harness spec opens Approaches on the all-undrawn fixture and asserts the Points pane has one row per counted approach, its count reads N / N with N the KPI count, and "No points to play" is absent
  - [ ] The spec asserts that with an Approach to wing ticked, and with a legend pick (Won), the Points pane's first number still equals the count the court and KPI show for that narrowing
  - [ ] A committed spec asserts the second click (or Enter) on the row of an approach with no landing hands that point's number to the watch callback when the point has a clip
  - [ ] The spec asserts that with `ventry=any` the strip's count equals the KPI count and reads "… of … times at the net", that on the approaches cut the strip never says "points", and that another cut's strip still reads "N of M points"
- **notes:** From /pr-check receipt 1cc5edf. `matched` and the list's denominator both come from `pointsBehind(cut, dots, points)`, and `computeApproachViz` counts an approach with no landing but pushes no dot. So on match 9e4d293e the pane says "No points to play / No approaches match these filters · 0 / 0" and the strip says "How you came in: any · 0 of 0 points" beside a KPI of "7 times at the net". The result needs to carry the undrawn approaches' point ids (with outcome, so a legend pick still narrows them); how is the runner's call. An undrawn approach has no wing, so the wing filter already drops it from `count`. A Statistics row pick (`statPickDotIds`) may need the same care; say in the report what a "How it ended" row pick does to undrawn rows. Selecting an undrawn row has no mark to ring; it must still light the row and take the second click. The strip's noun is `approachNoun` (`viz-model.ts`) through `draftCountLine`'s `noun` argument. The denominator can be wider than the KPI's "of N" when an entry choice is off the card's floor; only the first number must agree. The pane count's `aria-label` says "points" too. The season lightbox has no Points list; leave it. Reuses T19's no-landing fixture option.

## T21 · Stop the empty Approaches view claiming a filter

- **status:** done
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-lightbox.tsx` (`stageHasFilters` ~297), `src/lib/data/player-season-viz.ts` (`hasFilters` ~1365), `shots/lightbox-stats.tsx` (empty line ~168), `shots/viz-lightbox-shell.tsx` (passes the stage's `hasFilters`, noun and subject to `LightboxStats`); `tests/viz-approach-filters-browser.spec.ts` + its fixture, `tests/player-season-viz.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] The harness spec opens Approaches for a player who has approaches, switches to the opponent (who has none) with the player chip and no filter ticked, and asserts the stage reads "No approaches recorded for … yet" with no "Clear" button on it and no filter strip
  - [ ] The spec asserts that with a filter ticked that nothing matches, the stage still reads "No approaches match these filters" with its Clear button, on your court and on the opponent's
  - [ ] The spec asserts the Statistics pane for a player with no approaches and no filter does not contain "match these filters" and reads the stage's "No approaches recorded for … yet"; with a filter ticked and nothing matching it still reads "No … match these filters"
  - [ ] `tests/player-season-viz.spec.ts` asserts `buildSeasonLightbox` on the approaches cut for the opponent, with no other filter and no approaches, returns `hasFilters: false`
  - [ ] No existing empty-state assertion in `tests/viz-approach-filters-browser.spec.ts`, `tests/report-empty-states.spec.ts` or `tests/viz-lightbox-browser.spec.ts` is edited
- **notes:** From /pr-check receipt 1cc5edf; T15 fixed only the URL-opened case. Cause of (a): `activeFilterEntries` returns a `player` entry whenever the court is the opponent's, and `stageHasFilters` (and the season's `hasFilters`) count every entry that is not a held floor, so the player switch alone reads as a filter that Clear cannot remove (`clearTarget` keeps the player). Leaving the `player` key out there fixes every cut, which is fine; `useVizView().hasFilters` has other readers, so do not change it without checking them. Cause of (b): `LightboxStats` prints "No points match these filters" whenever `statsAreEmpty`, with no knowledge of filters. The existing fixture has an opponent approach (`OPP_APPROACH`), so it needs an option where only you came in. Related and left alone: with `ventry=any` and no net points the stage reads "none recorded" while the strip names the loosened floor (T15 follow-up 2).

## T22 · Stop the Approaches card drawing wings as zeroes

- **status:** done
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/wall-summary.ts` (`wallSummaryFor`'s `approaches` branch, `WallSummary`); `shots/wall-card.tsx` (the `SplitBar` and the key row under it, ~225-250); `tests/wall-summary.spec.ts` (`approachSummary`, ~379-470); a rendered-markup case in `tests/viz-gallery-browser.spec.ts` or the approach harness, with `withoutLanding()` from `tests/fixtures/approach-points.ts`
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] `tests/wall-summary.spec.ts` asserts that for a fixture where approaches are counted and none has a landing, the summary carries no wing segments (no "To backhand" / "Middle" / "To forehand" entry with count 0), while `countLabel` still reads "N approaches", `countNote` reads "N not drawn: no landing recorded" and `keyLead` still reads "Won x of N"
  - [ ] The spec asserts that with some approaches drawn and some not, the three wing segments are present, their counts sum to the drawn number only, and `countNote` names the rest
  - [ ] A committed spec renders the Approaches wall card on the all-undrawn fixture and asserts the card's markup contains the count and the note and none of "To backhand", "Middle", "To forehand", and no split bar element
  - [ ] The same spec asserts the card's accessible label still carries the count and the note, and that a card with every approach drawn still renders the bar and all three wing keys
  - [ ] No other cut's `wallSummaryFor` output changes: existing non-approaches cases in `tests/wall-summary.spec.ts` are unedited
- **notes:** From /pr-check eyes-on (receipt 9d9c045 not-ready). A wing is only known from a landing, so on a match with no coordinates the card shows "7 approaches" beside "To backhand 0 / Middle 0 / To forehand 0" and an empty grey bar, which is the guardrails' "zeroes read as you hit none" (`docs/ui-revamp-guardrails.md`). The condition is `drawnCount === 0 && total > 0`. The "Won x of n" lead comes from the KPI and stays. A card with no approaches at all (`total === 0`) is out of scope; leave it as it is. How the summary says "no segments" (an empty array, a flag) is the runner's call, but `SplitBar` must not draw an empty track for it. `wallSummaryFor` also feeds the season card (`player-season-viz.ts`, `profile-visualizations-view.tsx`) and saved-view tiles; they get the same behaviour through the shared function, so check `tests/player-season-viz.spec.ts` still passes. Read `.skills/advantage-analytics-design/SKILL.md` and its `empty-and-loading` reference first.

## T23 · Size the opened Approaches court's labels like Returns

- **status:** done
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx` (`ApproachApronLabels` ~763, the `APPROACH_*_LABEL_Y` constants ~141, the `VizBandsOverlay` call ~595); `shots/viz-bands-overlay.tsx` (`BAND_LABEL_SIZE` and the other band type sizes); `shots/court-geometry.ts` (`VIEWER_APPROACH_FRAME`, `VIEWER_LANDING_FRAME`, `frameFitZ`); `shots/court-art.tsx` (`APPROACH_SIDE_LABEL_SIZE`, `APPROACH_LANE_LABEL_SIZE`); `tests/viz-approach-lightbox-browser.spec.ts` + `tests/fixtures/viz-approach-lightbox-harness.tsx`; `tests/court-geometry.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] The approach lightbox harness spec measures a depth band label's rendered height at the opening frame on `cut=approaches` and on `cut=returnPlacement` at the same viewport, and asserts the two are within 0.5px
  - [ ] The spec asserts each apron word (Placement, Contact, the three wing names) renders at the opening frame no smaller than that Returns band label, at two viewport sizes
  - [ ] The spec asserts no two apron words' boxes overlap and none overlaps a band label, and the existing "every apron word lies inside the stage at the opening frame" case passes unedited
  - [ ] The existing cases that pin every contact and placement on the stage at open (`tests/viz-approach-lightbox-browser.spec.ts`, `tests/court-geometry.spec.ts`) pass unedited, or the diff changes only their expected frame numbers and the report says why
  - [ ] The label sizes on every other cut's opened court are unchanged: no existing assertion in `tests/viz-lightbox-browser.spec.ts` or `tests/viz-lightbox-framing.spec.ts` is edited, and the wall card's `ApproachCourtArt` label sizes are not changed
- **notes:** From /pr-check eyes-on (receipt 9d9c045 not-ready). The labels are SVG `font-size` attributes in viewBox units, so their on-screen size is size × the opening zoom. `VIEWER_APPROACH_FRAME` (both baselines plus 32 units of apron) is about twice as tall as `VIEWER_LANDING_FRAME`, so `frameFitZ` opens Approaches at roughly half the Returns zoom and the 5.6 to 7.4 unit text lands at about 6px. `frameFitZ` takes the smaller of the width fit and the height fit, so the ratio between the two cuts depends on the stage's shape; derive the scale from the two frames' fit on the actual stage, not one hard-coded multiplier. At the larger size the wing line (baseline − 8) and "Placement" (baseline − 20) no longer clear each other inside a 32-unit apron, so the label Ys, and possibly the apron, must move. Growing the apron lowers the zoom again, and T16's follow-up says the apron reaches "Full court" at 43 units. Whether the labels keep scaling with zoom after the opening frame, as on every other cut, is the runner's call; say which in the report. Before writing the band-label case, check how the bands come to be drawn on the Approaches court (`bandOverlay` in `viz-lightbox-shell.tsx` ~653) and give the harness an option that turns them on for both cuts. `court-art.tsx`'s `APPROACH_*_SIZE` constants are shared with the wall card, which must not change. The shell serves the season page too (`season-viz-lightbox.tsx`).

## T24 · Show the assumed-hand caveat beside the opened Approaches legend

- **status:** todo
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx` (the strip's `sentenceNote && phrases.length > 0` ~1136; the legend row's `data-viz-not-drawn` line ~1355); `shots/viz-lightbox.tsx` (`sentenceNote` ~539) and `src/lib/data/player-season-viz.ts` (~1379) only if the condition changes; `tests/viz-approach-filters-browser.spec.ts` (~209) + `tests/fixtures/viz-approach-filters-harness.tsx`; `tests/season-viz-browser.spec.ts` + `tests/fixtures/season-viz-harness.tsx`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] The filters harness spec opens Approaches with the opponent's hand unknown and no filter ticked (the card's floor only, no filter strip) and asserts a line in the legend row, carrying its own data attribute, reads "assumes right-handed"
  - [ ] The spec asserts the line is absent with `?hand=known`, absent on another cut's opened court, and absent with `?landing=none` (no drawn approach, so no wing was worked out)
  - [ ] The spec asserts that with a filter ticked and the hand unknown the dialog contains "assumes right-handed" exactly once, in the legend-row line and not in the filter strip
  - [ ] `tests/season-viz-browser.spec.ts` asserts the season's opened Approaches court shows the same line when a folded match has no opponent hand, with no filter ticked
  - [ ] The line's text comes from `HAND_ASSUMED_NOTE`; the only existing assertion edited is the "applied sentence says it assumes right-handed" case in `tests/viz-approach-filters-browser.spec.ts`; the diff adds no raw hex colour
- **notes:** From /pr-check receipt 38059d5 not-ready. The caveat reaches the shell as `sentenceNote` (match: `viz-lightbox.tsx`; season: `buildSeasonLightbox`), but the shell only appends it to the filter strip when another phrase is present, so on the default view (floor held, no phrases, no strip) it never shows. Draw it like T19's "N not drawn" line (`data-viz-not-drawn`): a quiet line in the legend row, which can sit beside that line when both apply. The line replaces the strip's appended phrase so the caveat is said once. `sentenceNote` is already `result.dots.some(handAssumed)`, drawn approaches only, which is right: an undrawn approach has no wing. The season harness's default season has no `opponentHand`; `?hands=1` has right, left and null. Read `.skills/advantage-analytics-design/SKILL.md` first.

## T25 · Say "assumes right-handed" on the Approaches wall card

- **status:** todo
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/wall-summary.ts` (`WallSummary`, `wallSummaryFor`'s `approaches` branch; its `result` argument is `Pick<VizResult, "count">` today); `shots/wall-card.tsx` (the `countNote` line ~214, the accessible label ~135); callers `shots/default-tiles.ts`, `shots/saved-views-band.tsx`, `src/lib/data/player-season-viz.ts` (~604); `tests/wall-summary.spec.ts`, `tests/wall-card-approaches.spec.ts`, `tests/player-season-viz.spec.ts`
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] `tests/wall-summary.spec.ts` asserts the approaches summary carries the hand note ("assumes right-handed") when a drawn approach's wing came from an assumed hand, and carries none when every hand is known, when no approach is drawn (no wing segments), and on every other cut
  - [ ] `tests/wall-card-approaches.spec.ts` renders the card on the unknown-hand fixture and asserts its markup contains "assumes right-handed" in an element with its own data attribute and that the card's accessible label carries it; with known hands neither does
  - [ ] `tests/player-season-viz.spec.ts` asserts the season's Approaches tile summary carries the note when a folded match has no opponent hand and a drawn approach, and not when every folded match's hand is known
  - [ ] The card's wording is `HAND_ASSUMED_NOTE` (`viz-model.ts`), the same constant the lightbox uses; the diff adds no raw hex colour
  - [ ] Existing non-approaches cases in `tests/wall-summary.spec.ts` and the two existing cases in `tests/wall-card-approaches.spec.ts` pass unedited
- **notes:** From /pr-check receipt 38059d5. The card names "To backhand / To forehand" wings worked out from a hand the match does not record and never says so. `wallSummaryFor` sees only the count and the stats rows today, so it cannot know a hand was assumed; how the flag reaches it (widen the `result` pick to the dots, a field on `VizStats`) is the runner's call, but the season card and saved-view tiles go through the same function and must get the same answer. The season's merged result keeps each dot's own `handAssumed`. An all-undrawn card (T22: no segments) shows no caveat. Place it as a quiet line like `countNote`; say where in the report. Read `.skills/advantage-analytics-design/SKILL.md` first.

## T26 · Label the apron lanes Left · Middle · Right when opponents' hands differ

- **status:** todo
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/court-art.tsx` (`leftLaneIsForehand` ~747, `approachLaneText` ~732, `ApproachCourtArt` ~803); `shots/lightbox-court.tsx` (the `opponentHand !== undefined ? … : leftLaneIsForehand(dots)` fallback ~656, `ApproachApronLabels` ~800); `tests/season-viz-browser.spec.ts` + `tests/fixtures/season-viz-harness.tsx` (`HANDS_SEASON`); `tests/viz-approach-court-browser.spec.ts` + `tests/fixtures/viz-approach-court-harness.tsx`; a unit spec for the lane decision (new, or in `tests/approach.spec.ts`)
- **routes:** `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] A committed unit spec asserts the lane words read off a court's dots: every dot from one known hand gives "Their FH · Middle · Their BH" for a right-hander and the reverse for a left-hander; dots from a known right-hander and a known left-hander together give "Left · Middle · Right"; any dot whose hand was assumed gives "Left · Middle · Right"
  - [ ] `tests/season-viz-browser.spec.ts` opens the season's Approaches court over opponents of different hands and asserts the three `data-approach-lane` words read "Left", "Middle", "Right", and over a season whose opponents all share one known hand asserts they read "Their FH" / "Their BH" on the sides that hand gives
  - [ ] The same spec asserts the mixed-hand season's Statistics pane still lists the "Their backhand" and "Their forehand" rows
  - [ ] The match lightbox is unchanged: every existing case in `tests/viz-approach-lightbox-browser.spec.ts` passes unedited (a court handed `opponentHand`, including `null`, keeps "Their FH" / "Their BH")
  - [ ] No label size, position or colour constant changes; any existing assertion edited is in `tests/viz-approach-court-browser.spec.ts` only, and the report says why
- **notes:** From /pr-check receipt 38059d5; T17 follow-up 1. The season court spans many opponents and passes no `opponentHand`, so `lightbox-court.tsx` falls back to `leftLaneIsForehand(dots)`, which stops at the first known-hand dot and labels the whole apron from that one opponent. Approved rule: where the hand is read off the dots and they do not share one known hand (mixed, or any assumed), name the lanes from the hitter's side as "Left · Middle · Right". Per-wing Statistics rows are computed per match and stay. A middle-lane dot says nothing about the hand, so the decision may need each dot's hand rather than lane against wing; how is the runner's call (the season builder could pass an explicit value instead). What an empty court shows is the runner's call; say which. The wall card's small court draws no lane words; `ApproachCourtArt` with `labels` uses the same fallback and takes the same rule, and its harness's default dots are `handAssumed: true`, so those lane-word cases will change. `HANDS_SEASON` (`?hands=1`) already has right, left and null opponents; a same-hand season needs a new option.

## T27 · Drop the Approach to group when no approach has a wing

- **status:** todo
- **model:** opus
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-model.ts` (`approachStats` ~2621, the `wingGroup` built unconditionally ~2661); `src/lib/data/player-season-viz.ts` (`mergeVizStats` ~406, group order); `tests/viz-model.spec.ts`, `tests/player-season-viz.spec.ts`, `tests/viz-approach-filters-browser.spec.ts` (the `?landing=none` option already exists)
- **routes:** `/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`
- **done when:**
  - [ ] `tests/viz-model.spec.ts` asserts that on a fixture whose approaches all lack a landing, `computeVizStats` for the approaches cut has no `approach-to` group, while the KPI count is N > 0 and the "How it ended" rows still sum to N
  - [ ] The spec asserts that with some approaches drawn and some not the Approach to group is present with its three rows, their counts summing to the drawn number, and that it keeps all three rows with an `approachTo` filter ticked (existing Approach to and Direction cases unedited)
  - [ ] `tests/player-season-viz.spec.ts` asserts `mergeVizStats` over one match with wings and one without lists Approach to before How it ended with the first match's wing counts, whichever match comes first, and that with no match having a wing the merged stats have no `approach-to` group
  - [ ] The filters harness spec opens Approaches with `?landing=none` and asserts the Statistics pane shows the KPI count and "How it ended" and contains none of "Approach to", "Their backhand", "Their forehand"
  - [ ] `tests/wall-summary.spec.ts` and `tests/wall-card-approaches.spec.ts` pass unedited
- **notes:** From /pr-check receipt 38059d5. On a match with no coordinates the opened Statistics pane shows Their backhand / Middle / Their forehand as "0 of 0 —" under a KPI of N approaches, while the wall card (T22) now hides the wings; same rule here. Decide from the pool, not the filtered rows, so the group still ignores its own filter. Direction already has this rule (`pool.some(direction !== null)`); leave it. `wallSummaryFor` reads the `approach-to` rows and falls to zero counts when the group is missing, which is T22's no-wings case already. `mergeVizStats` unites groups in first-seen order, so a season whose first match has no wings would put How it ended above Approach to unless the order is fixed (Direction has the same exposure today). The filter panel's "Approach to" options are out of scope. An empty pool (no approaches at all) shows the empty line either way.

## T28 · Give the Points pane the shared empty sentence

- **status:** todo
- **model:** sonnet
- **files:** (guess) `src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx` (the `emptyLine:` handed to `pointList.render` ~1417; the shared `emptyLine` ~920); `tests/viz-approach-filters-browser.spec.ts` (the `?net=you` option exists)
- **routes:** `/dashboard/matches/[matchId]`
- **done when:**
  - [ ] The Points pane's empty sentence is the shell's shared `emptyLine` (the one the stage and `LightboxStats` print) in every case except the serve cut's "serves went out" sentence, which is unchanged
  - [ ] The filters harness spec opens Approaches with `?net=you`, switches to the opponent with no filter ticked, opens the Points pane and asserts it reads "No approaches recorded for … yet" and does not contain "match these filters"
  - [ ] The spec asserts that with a filter ticked that nothing matches the Points pane reads "No approaches match these filters"
  - [ ] No existing assertion in `tests/viz-approach-filters-browser.spec.ts`, `tests/viz-lightbox-browser.spec.ts` or `tests/lightbox-points.spec.ts` is edited
- **notes:** From /pr-check receipt 38059d5; T21 follow-up 1. The pane builds its own `No ${result.noun} match these filters.` whatever the filter state, so a subject with no approaches reads "No points to play / No approaches match these filters." beside a stage and Statistics pane that say "No approaches recorded for … yet". The fix is in the shell, not `lightbox-point-list.tsx`, which only prints what it is handed. The "No points to play" heading stays. The shared line has no trailing full stop; the pane's had one. Model the two cases on T21's `?net=you` cases in the same spec.

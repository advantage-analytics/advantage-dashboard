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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

- **status:** todo
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

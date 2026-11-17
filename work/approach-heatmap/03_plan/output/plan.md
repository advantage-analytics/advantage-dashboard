# Plan — approach-heatmap

Builds design option A from `../02_design/output/design.md`: a new `approaches` cut on the match and season Visualizations tabs. The scope stays inside the brief: no change to the Net game rules, no prose summary, no ball speed, no new route.

**Taken as decided, since the design was approved without edits to its open questions:**
- **Q7:** the Filters panel's three new sections are checklists, which multi-select like the model.
- **Q8:** the season card reads "Passed or lobbed" rather than loading lob files.

Edit this paragraph to change either before stage 04.

Paths below are relative to `src/components/dashboard/matches/match-detail/` unless they start with `src/`, `tests/` or `supabase/`.

## Steps

### 1. Approach classifier

- **Files:** new `match-filters/approach.ts`; new `tests/approach.spec.ts`.
- **Change:**
  - **`approachOf(point, isPlayer1, lobKeys, opponentHand)`:** builds on `netEntryOf`, `netApproachShotOf` and `netEndingOf` without changing them. It returns `entry`, the approach `shot`, the opponent's `reply`, the geometric `lane`, the hand-aware `wing`, `handAssumed`, `direction` (from the approach shot's `zone`, null for a serve) and the ending bucket.
  - **Ending buckets:** passed down the line, passed crosscourt, lobbed, won at the net, your error, plus the "passed or lobbed" pair when `lobKeys` is null.
  - **Purity:** pure, with no React.
- **Verify:** `npx playwright test tests/approach.spec.ts`.
  - **Agreement with Net game:** `null` exactly where `cameToNet` is false, and entry and ending equal `net-game.ts`'s on fixture points.
  - **Hand:** the wing flips for a left-handed opponent, and an unknown hand sets `handAssumed`.
  - **Serve:** a serve has no direction.
  - **Lobs:** with `lobKeys` null, nothing is lobbed and the passed buckets read "or lobbed".

### 2. The cut in the model

- **Files:** `shots/viz-model.ts`; `tests/viz-model.spec.ts`.
- **Change:**
  - **Cut:** `Cut` gains `"approaches"`, and `chartsFor` allows scatter only for it.
  - **Filters:** `VizFilters` gains `entry`, `approachTo` and `approachDir`, with empty defaults in `EMPTY_VIZ_FILTERS`. `filterKeysFor("approaches")` adds them.
  - **Dots:** `VizDot` gains optional `pair` (contact); `VizDotMeta` gains `entry`, `wing`, `direction`, `ending` and `handAssumed`.
  - **`computeApproachViz`:** dispatched from `computeViz`. It reads the subject seat, filters, `matchFilterPass`, `matchCtx.lobKeys` and `matchCtx.hands`; on the opponent's court the hand is the player's. Points with no placement are counted in `count`/`total` but produce no dot.
  - **Other cuts:** no other cut's output changes.
- **Verify:** extend `tests/viz-model.spec.ts`.
  - **Filters:** each new filter group narrows.
  - **Undrawable points:** they are counted but not drawn.
  - **Opponent subject:** it uses the player's hand.
  - **Agreement spec:** over the existing fixture matches, `computeViz("approaches")` with all three entries equals `netGameTally` for both seats, in count and in endings.
  - **Regression:** the existing viz-model cases are unchanged.
  - **Checks:** `npm run typecheck` passes.

### 3. Approaches statistics

- **Files:** `shots/viz-model.ts` (`computeVizStats`); `shots/lightbox-stats.tsx` only if its group renderer needs a new row kind; `tests/viz-model.spec.ts`.
- **Change:**
  - **KPI tiles:** count, labelled "of N approaches" only when filtered, and Won %.
  - **Approach to:** wing rows, Won x of n and %.
  - **Direction:** rows hidden when no pooled point has a direction.
  - **How it ended:** five rows, count and share, with the "or lobbed" wording when lobs are unknown.
  - **Picks:** each group ignores its own filter and follows the others. Rows are picks like existing stat rows.
- **Verify:**
  - **Spec cases:** the counts on a fixture; the Direction group absent for a serve-and-volley-only pool; ending shares sum to the KPI count.
  - **Checks:** `npm run typecheck`.

### 4. Saved views accept the cut

- **Files:** new `supabase/migrations/<timestamp>_saved_views_approaches.sql`; `tests/saved-views-logic.spec.ts`.
- **Change:**
  - **Constraint:** drop and re-add `saved_views_cut_check` with `'approaches'` added, following `20260923210000_saved_views_rally_placement.sql`.
  - **Before writing:** re-check the live constraint, since it allowed six cuts on 2026-11-17.
  - **Apply:** through the Supabase MCP (`apply_migration`).
- **Verify:**
  - **Live constraint:** a query of `pg_constraint` shows seven cuts.
  - **Spec:** the saved-views logic spec accepts the cut.
  - **No other changes:** `chart` stays as is, since `scatter` is already allowed.

### 5. Labels and URL state

- **Files:** `shots/viz-labels.tsx`, `shots/cut-kinds.ts`, `shots/viz-url.ts`; `tests/viz-url.spec.ts`.
- **Change:**
  - **Labels:** `CUT_LABEL`, `CUT_NOUN` and the legend items for the cut (Won, Lost, Forehand, Backhand).
  - **Placement:** the cut counts as placement in `cut-kinds`.
  - **URL:** a short URL code for the cut and the three new filter groups.
- **Verify:**
  - **Round-trip:** `viz-url.spec.ts` round-trips a state with the cut and every new filter value.
  - **Old links:** an old URL without them still parses.
  - **Checks:** `npm run typecheck`.

### 6. Full vertical court frame

- **Files:** `shots/court-geometry.ts`, `shots/court-art.tsx`; `tests/court-geometry.spec.ts`.
- **Change:**
  - **Frame:** `FULL_COURT_VERTICAL`, which is `RETURN_COURT` geometry rotated -90°: subject at the bottom, apron beyond both baselines.
  - **Projection:** `projectApproachPair`.
  - **Drawing:** `CourtArt` draws the frame and both marks of a pair dot in screen space, with backhand triangles apex-up.
  - **Labels:** when `labels` is set, "Contact" / "Placement" and the wing names appear in dark ink on the apron only.
  - **Wall card art:** a tighter viewBox.
- **Verify:**
  - **Geometry spec:** contact lands in the near half and placement in the far half; the lane thirds map to the wing label positions; the triangle apex is topmost.
  - **Visual:** a one-off screenshot of the wall card and the opened court against `02_design/references/approach-map-v9.html`.

### 7. Pair interaction in the opened court

- **Files:** `shots/lightbox-court.tsx`.
- **Change:**
  - **One group:** a pair dot is one interactive group with two marks.
  - **Hover:** hovering either mark rings both; the readout names the hovered mark (Contact / Placement).
  - **Select:** selecting rings both, raises the pair to the top, and dims the rest to `UNSELECTED_OPACITY`.
  - **Readout:** it opens outward into the apron, then the other side, then above.
  - **Keyboard:** roving and Enter/Space work as for single marks today.
- **Verify:**
  - **Checks:** `npm run typecheck` and `npm run lint`.
  - **Browser:** a local check of hover, select and keyboard roving on a seeded match.
  - **Regression:** existing single-mark cuts behave as before (Rally shots selected and dimmed states).

### 8. The wall card

- **Files:** `shots/default-cuts.ts`, `shots/default-tiles.ts`, `shots/wall-summary.ts`; `tests/wall-summary.spec.ts`.
- **Change:**
  - **Default cut:** a sixth default cut after Rally shots, `{ cut: "approaches", filters: { entry: ["approach"] } }`. Its `entry: ["approach"]` is the baseline, not an applied filter.
  - **Wall summary:** `wallSummaryFor("approaches")` gives segments To backhand / Middle / To forehand, `keyLead` "Won x of n", and an "n not drawn" line when points lack a placement.
- **Verify:**
  - **Spec:** `wall-summary.spec.ts` covers the segments and the not-drawn line.
  - **Wall:** shows six cards for both You and the opponent.
  - **Empty state:** a subject with no net points gets the existing empty state.

### 9. Filters panel and applied-filter sentence

- **Files:** `shots/lightbox-filters.tsx` and its phrases (`match-filters/applied-words.ts` if the sentence is built there).
- **Change:**
  - **Sections:** three checklist sections for this cut: How you came in, Approach to, Direction.
  - **Phrases:** phrases for each, omitting the baseline `entry: ["approach"]`.
  - **Hand note:** "assumes right-handed" when any shown point has `handAssumed`.
- **Verify:**
  - **Checks:** `npm run typecheck`.
  - **Browser:** a local check that ticking Serve and volley shows the strip, Clear returns to approaches only, and the counts in the panel footer match the court.

### 10. Point list wording

- **Files:** `film/film-shots.ts` (`pointDetail`) or `shots/lightbox-point-list.tsx`, whichever owns the detail line.
- **Change:**
  - **Detail line:** for this cut it reads "Forehand down the line, to their backhand", prefixed "Serve and volley · " / "Drawn in · " when the entry is not an approach.
  - **Clips:** behaviour is unchanged.
- **Verify:**
  - **Spec:** a pure-function case if `pointDetail` is pure.
  - **Browser:** a local check that a second click on a lit row opens the clip.

### 11. Lob data on the match Visualizations tab

- **Files:** the Visualizations tab's filter context (`shots/shots-tab.tsx` or `match-filters/provider.tsx`, found by trace-route), reusing `film/use-ball-paths.ts` `useLobShotKeys`.
- **Change:** pass the match's lob keys into `MatchFilterContext.lobKeys` for the Visualizations tab, through the same cached fetch the Statistics and Video tabs share.
  - **Unknown lobs:** until loaded, or with no file, it stays null, and the rows read "or lobbed".
  - **Read-only views:** nothing new is fetched on read-only mounts; share links and the sample keep `null`.
- **Verify:**
  - **Agreement:** on an Advantage Intelligence match, the card's Lobbed count equals the Net game card's Lobbed count.
  - **Single fetch:** the network panel shows one ball-paths request shared across tabs.

### 12. Season card

- **Files:** `src/lib/data/player-season-viz.ts`, `src/components/dashboard/team/player-profile/season-viz-lightbox.tsx`; `tests/player-season-viz.spec.ts`.
- **Change:**
  - **Label:** `SEASON_CUT_LABEL` / `cutNoun` entries.
  - **Hand per match:** each match is computed with its own `seasonMatchContext`, so wings use that match's opponent hand before `mergeVizResults`.
  - **Dot encoding:** `SeasonDotPoint` carries the contact for pair dots, with encode and decode updated together.
  - **Lobs:** the season rows read "Passed or lobbed", since the courts loader has no lob files.
  - **Clips:** they use the existing season lightbox's "open that match's Video tab" behaviour.
- **Verify:**
  - **Spec:** a two-match season with a right- and a left-handed opponent puts each approach in the right wing; pair dots round-trip through encode/decode.
  - **Regression:** the existing season cards are unchanged.

### 13. Gate and eyes-on

- **Files:** none new; `MAP.md` only if `npm run map` changes it (no new route is expected).
- **Change:** none; this is the branch gate.
- **Verify:**
  - **Commands:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`.
  - **Gate:** `/pr-check`, with Stage 3b opening the match Visualizations tab and a team player's profile Visualizations tab as the verifier account (team viz seed).
  - **Guardrails:** the `pipeline-guardrails-reviewer` agent on the diff (guardrails §4 attribution).

## Order and dependencies

- **1 → 2 → 3** is the spine: the classifier, the cut, then its statistics.
- **4 (saved views)** has no code dependency. Run it before anything can save the cut, at the latest before step 8 ships the card.
- **5, 6, 9, 10, 11 and 12** each depend on step 2 only, and can be built in any order after it.
- **7** depends on **6**, since the pair marks must exist before their interaction.
- **8** depends on **3** (its summary reads the stats) and **6** (its court art).
- **12** also depends on **3** and **6**, since the season card renders the same stats and court.
- **13** runs last.

## Test strategy

- **Pure modules carry the logic, tested offline:** `approach.ts`, `viz-model.ts`, `wall-summary.ts`, `viz-url.ts`, `court-geometry.ts` and `player-season-viz.ts`. These are Playwright specs that import pure TypeScript, the pattern `net-game.spec.ts` and `viz-model.spec.ts` already use. No live-database spec is needed; the only database change is the constraint in step 4, checked by query.
- **One agreement spec guards the brief's main constraint:** for every fixture match and both seats, the Approaches cut's count and endings equal `netGameTally`. This proves success criterion 1 and fails the build if either side drifts.
- **Hand handling is tested at both levels:** single match (step 1) and merged season (step 12), including a left-handed opponent and a missing hand.
- **UI behaviour is checked in a real browser:**
  - **Locally:** after steps 7, 9 and 10.
  - **At the gate:** `/pr-check` Stage 3b's verifier on both routes.
  - **Visual reference:** `02_design/references/approach-map-v9.html`.
- **Regression:** every existing viz, season and saved-views spec must pass unchanged, so the five shipped cards and their season versions are untouched.

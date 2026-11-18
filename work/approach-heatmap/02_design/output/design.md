# Design — approach-heatmap

The approved look is `references/approach-map-v9.html`. This document is how to build it, on both pages the brief names: the match report's Visualizations tab, and the team player profile's Visualizations tab (season). The human confirmed in chat that both ship in this feature.

## Approaches considered

### A. A new cut, `approaches`, inside the existing Visualizations model (recommended)

Add `"approaches"` to `Cut` in `shots/viz-model.ts`. Its default card, filters, URL state, saved views, lightbox, point list and season card then all come from the machinery every other cut already uses. The season tab builds its cards from the same `defaultCutsFor` list (`lib/data/player-season-viz.ts`) and opens them in the same `VizLightboxShell`, so the season card costs little extra.

- **Cost:** two new things.
  1. **Pairs:** a dot that is a *pair* of positions, contact plus placement, so the court draws, rings and raises both marks as one.
  2. **Court frame:** a full-length vertical court. The shipped frames are half courts.
- **Other work:** a migration for `saved_views_cut_check`, and a wider season dot encoding.

### B. Reuse the Rally shots cut with the existing Net filter

The Video tab's advanced filters already have a Net group (`MatchFilters.netCameIn`, `netHow`), and the Rally shots cut already draws the approach shot under it (`netRallyShotOf`).

- **Cost:** almost no new code.
- **Why not:**
  - **Separate shots:** contact and placement are separate dots on separate cuts, with no link between them.
  - **Half court:** the court shows only one half.
  - **Missing statistics:** nothing groups approaches by where they went or how they ended.
  - **Fails the brief:** success criterion 2 (read "passed down the line 3 of 7" off the screen) is not met.

### C. A standalone Approaches card and lightbox outside the model

- **Gain:** full freedom to draw pairs.
- **Cost:**
  - **Duplication:** it would reimplement filters, URL state, saved views, the point list, clips and the whole season path.
  - **Drift:** it would start drifting from the five existing cards on day one.

**Recommendation: A.** It is the only option that meets every success criterion without a second copy of the Visualizations machinery.

## Chosen design

### Architecture

The model stays pure TypeScript, like every cut today: no React, so Playwright specs import it directly. One new classifier module answers "what happened on this net point". The cut, its stats, its wall summary and its court frame are added beside the existing ones, and nothing existing changes behaviour.

```
net-game.ts (unchanged rules)
  └─ approach.ts          approachOf(point, side, lobKeys, opponentHand) → Approach | null
       └─ viz-model.ts    computeApproachViz → VizResult (pair dots)
            ├─ wall-summary.ts      Approaches footer: To backhand / Middle / To forehand, "Won x of n"
            ├─ computeVizStats      KPI + Approach to · Direction · How it ended rows
            ├─ court-geometry.ts    FULL_COURT_VERTICAL frame + projectApproachPair
            └─ court-art.tsx / lightbox-court.tsx   pair marks, labels in the opened view
match page:   shots-tab → viz-wall (defaultCutsFor) → WallCard / VizLightboxShell
season page:  roster/[playerId] → ProfileVisualizationsView → buildSeasonCards (defaultCutsFor) → SeasonVizLightbox → VizLightboxShell
```

### Components and modules

**New: `src/components/dashboard/matches/match-detail/match-filters/approach.ts`**
- `approachOf(point, isPlayer1, lobKeys, opponentHand)` returns `null` exactly where `cameToNet` is false. Otherwise it returns:
  - `entry`: from `netEntryOf`.
  - `shot`: from `netApproachShotOf`: the approach shot, the serve on serve and volley, or the short ball on drawn in.
  - `ending`: from `netEndingOf`.
  - `reply`: the opponent's deciding shot when the point was lost to a pass or lob.
  - `lane`, `wing` and `direction`: defined in the next three bullets.
- `lane` is geometric: `left | middle | right` thirds of the opponent's singles court, seen from the hitter. It comes from the approach shot's landing in the hitter's frame, using `rallyLandingMetrics`' orientation so end changes are handled.
- `wing` comes from `lane` plus the opponent's hand (`forehand | middle | backhand`).
  - **Right-handed opponent facing the hitter:** their forehand is the hitter's left.
  - **Left-handed:** the mapping flips.
  - **Hand unknown:** treated as right-handed, with `handAssumed: true`.
- `direction` is the approach shot's `zone` (Crosscourt / Middle / Down the Line). It is `null` for a serve, since a serve has no rally direction.
- The "How it ended" bucket maps `netEndingOf` five ways:
  - `passed`, split by the reply's `zone` into **Passed down the line** and **Passed crosscourt**;
  - `lobbed`;
  - `winner` and `opponent-error`, together **Won at the net**;
  - `own-error`, **Your error**.
  - With `lobKeys` null, lobs cannot be told apart. The rows then read "Passed or lobbed down the line" and "Passed or lobbed crosscourt", and there is no Lobbed row, the same convention as the Net game card.

**`shots/viz-model.ts`**
- `Cut` gains `"approaches"`. `chartsFor("approaches")` is scatter only, since zones and heat have no meaning for a pair.
- `VizFilters` gains three multi-select groups, all used by this cut only:
  - `entry: NetEntry[]`;
  - `approachTo: Wing[]`;
  - `approachDir: Direction[]`.
- `filterKeysFor("approaches")` is `[...BASE_KEYS, "entry", "approachTo", "approachDir", "match"]`.
- `VizDot` gains an optional `pair?: { lateralM, depthM }`, which is the contact position. The dot's own `lateralM` and `depthM` stay the placement, so code that reads one position per dot is unaffected. `VizDotMeta` gains `entry`, `wing`, `direction`, `ending` and `handAssumed`.
- `computeApproachViz` is dispatched from `computeViz` like the rally and errors cuts. It applies the subject seat, the filters and `matchFilterPass`. It reads lob keys from `matchCtx.lobKeys` and the opponent's hand from `matchCtx.hands`.

**`shots/default-cuts.ts`:** a sixth default cut after Rally shots:
- `{ cut: "approaches", chart: "scatter", name: "Approaches", filters: { entry: ["approach"] } }`.

`entry: ["approach"]` is the card's baseline, so it is not shown as an applied filter. Ticking Serve and volley or Drawn in is.

**`shots/court-geometry.ts` + `court-art.tsx`:** a `fullVertical` frame for this cut.
- **Geometry:** the landscape `RETURN_COURT` geometry rotated -90°, the subject at the bottom, the full length, with apron beyond both baselines.
- **Projection:** `projectApproachPair` maps the contact into the near half and the placement into the far half.
- **Marks:** drawn in screen space, so a backhand triangle keeps its apex up (`trianglePointsFor("serve", …)`).
- **Labels:** `labels` adds "Contact" and "Placement", and the three wing names, as dark ink on the apron. Only the opened view passes it; wall cards stay label-free.
- **Wall card art:** it uses a tighter viewBox, so the court fills the art box's height.

**`shots/lightbox-court.tsx` (mark layer):** a dot with `pair` draws two marks that share one id, one interactive group.
- **Hovering either mark** rings both. The readout names the mark under the pointer, "Contact" or "Placement".
- **Selecting a dot** rings both marks, draws the pair last so it sits on top, and dims the rest to `UNSELECTED_OPACITY`, the way a selected mark behaves today.
- **The readout** (`ChartTooltip`) opens outward into the apron, falling back to the other side, then above, so it never covers marks.

**`computeVizStats` + `lightbox-stats.tsx`:** for this cut, the KPI tiles are:
- `n` with "of N approaches", shown only when filtered;
- Won %.

Then three groups of the existing stat rows:
- **Approach to:** their backhand, middle, their forehand. Won x of n and %.
- **Direction:** crosscourt, middle, down the line. Hidden when nothing in the pool has a direction, for example serve and volley only.
- **How it ended:** the five rows above, with count and share.

Each group ignores its own filter and follows the others, so you can compare and switch. All rows are picks, like every other stat row.

**`shots/wall-summary.ts`:** `wallSummaryFor("approaches", …)`. The segments are To backhand / Middle / To forehand, with `keyLead` "Won x of n".

**Filters panel (`lightbox-filters.tsx`):** three new sections for this cut:
- How you came in (`entry`);
- Approach to (`approachTo`);
- Direction (`approachDir`).

They use the panel's existing section types (see Open questions). The applied-filter sentence gets phrases for each, plus "assumes right-handed" when any shown point has `handAssumed`.

**Point list (`lightbox-point-list.tsx` / `film/film-shots.ts` `pointDetail`):**
- **Detail line:** for this cut it reads "Forehand down the line, to their backhand". It starts with "Serve and volley · " or "Drawn in · " when that applies.
- **Clips:** they work as today, opening on the second click of a lit row.

**Labels and URL:** `CUT_LABEL`, `CUT_NOUN`, `SEASON_CUT_LABEL` and `cutNoun` gain entries. `viz-url.ts` gets a short code for the cut and the three new filter groups.

**Saved views:** a migration adds `'approaches'` to `saved_views_cut_check`. The live check, verified 2026-11-17, allows six cuts. `drop constraint` + `add constraint` follows the precedent of `20260923210000_saved_views_rally_placement.sql`.

**Season (`lib/data/player-season-viz.ts`):**
- **The card:** it appears with no new loader code, because `buildSeasonCards` reads `defaultCutsFor`.
- **Hand per match:** each match is computed with its own `matchCtx`, built by `seasonMatchContext` with that match's hands, before `mergeVizResults`. So the backhand side is right on every match, left-handed opponents included.
- **Dot encoding:** `SeasonDotPoint`, the 5-number tuple the season lightbox ships, gains two numbers for the contact, or a parallel array for pair dots only. Its encode/decode helpers and their spec change together.
- **Lobs:** the season courts loader (`loadPlayerSeasonCourts`) deliberately loads no lob files, so season rows read "Passed or lobbed …". This matches the season Net game card when lobs are unknown.
- **Clips:** they come from the existing season lightbox. A second click on a selected mark opens that match's Video tab at that point.
- **Season filters:** the season lightbox's existing Matches sheet and "Opponent plays" filter cover the brief's opponent and date question.

### Data flow

1. **Match page:** `getMatchDetailData()` supplies the points. The report's `MatchFilterContext` carries `hands` and, once loaded, `lobKeys` (the same provider the Statistics tab uses: `StatisticsLobKeysProvider` / `useLobShotKeys`).
   - The Visualizations tab must receive `lobKeys` too.
   - Until the ball-paths file loads, or on a SwingVision match, `lobKeys` is null and the rows read "Passed or lobbed".
2. **Computation:** `buildDefaultTiles` and the lightbox call `computeViz(points, "approaches", filters, subjectIsPlayer1, "scatter", matchCtx)`.
   - The subject seat comes only from `sides.you` / `sides.opp` (guardrails §4), as the other tiles do.
   - On the opponent's court, "their" is the player, and the hand is the player's (`hands` of the other seat).
3. **Season page:** the courts loader supplies the points, seat and `opponentHand` per match. Each match is computed with its own context, then merged.

### Error handling and honest gaps

- **No landing point:** the point is counted in every number and listed in Points, but not drawn.
- **Contact but no landing:** placement is the drawn position, so no mark is drawn; counted and listed as above.
- **Landing but no contact:** the placement mark is drawn alone, with no partner.
- **Undrawn points:** the card's count line says how many are not drawn ("2 not drawn: no landing recorded") rather than letting the court disagree with the KPI. Counts always equal the Net game card's, success criterion 1.
- **Hand unknown:** wing words are kept, and the applied-filter sentence and the readout say "assumes right-handed".
- **No video:** SwingVision, or no playable file. `canWatch` is false, so the row has no clip line. This is existing behaviour.
- **No net points:** the card shows the wall's honest empty state for a subject with nothing to draw (`EmptySubjectRow` / `EmptyWall` rules), never an empty court that reads as data.

### Testing

All offline Playwright specs over pure modules, the repo's pattern for `net-game.ts` and `viz-model.ts`. No live-DB spec is needed.

- **`tests/approach.spec.ts`:**
  - `approachOf` matches `netEntryOf` / `netEndingOf` on fixture points.
  - Lane → wing flips for a left-handed opponent.
  - Hand-unknown sets `handAssumed`.
  - A serve has no direction.
  - The five ending buckets, including "Passed or lobbed" with `lobKeys` null.
- **Agreement spec:** for fixture matches, `computeViz("approaches", entry: all three)` counts and endings equal `netGameTally` for both seats. This is success criterion 1, run in both directions.
- **`viz-model` spec:**
  - The filters (`entry`, `approachTo`, `approachDir`) narrow as expected.
  - Undrawable points are counted but not drawn.
  - The opponent subject uses the player's hand.
- **Season spec:** a two-match season with opposite-handed opponents puts each approach in the right wing after `mergeVizResults`. The `SeasonDotPoint` encode/decode round-trips a pair.
- **Saved views:** the existing saved-views spec gains the new cut. The migration is checked against the live constraint before applying.
- **UI:** `/pr-check` Stage 3b's eyes-on pass covers both routes. `match-detail` uses the verifier's analysed matches; the team profile uses the "Eyes-on team viz seed".

## Open questions

The brief's six, as resolved here or carried forward:

1. **Season clips:** resolved. The existing season lightbox already opens the point's own match Video tab on a second click.
2. **Season in the first release:** resolved by the human in chat. Both pages ship in this feature.
3. **Opponent's hand:** resolved, and the brief's constraint was wrong.
   - `matches.opponent_hand` is stored. It is set on 93 of the 110 matches with points (live database, 2026-11-17), and the match filter context already reads both seats' hands.
   - Wings use the real hand. Only the remaining matches assume right-handed, and they say so.
4. **Missing fields:** resolved as in Error handling. Counted and listed, drawn only where a placement exists.
5. **Season filters by opponent or date:** resolved. The season lightbox's existing Matches sheet and "Opponent plays" filter already do this.
6. **Flagging the three players:** resolved. Out of scope; the card works for every player.

New, for the human:

7. **Control type in the Filters panel.** The approved design draws "Approach to" and "Direction" as segmented controls (pick one). The viz model's filter groups are multi-select lists, and the panel draws other multi-select groups (for example Zone) as checklists. Recommendation: checklists, to match the model and the rest of the panel. The look changes only in that panel.
8. **Lobs on the season card.** Accept "Passed or lobbed" on the season (recommended: it matches the season Net game card and avoids a service-role file read per Advantage Intelligence match on every Visualizations click)? Or have the season courts loader fetch lob files too?

## Also consulted

- `src/components/dashboard/matches/match-detail/shots/viz-model.ts`: `Cut`, `VizFilters`, `computeViz` dispatch, `filterKeysFor`, `contactMetrics`, `rallyLandingMetrics`.
- `src/components/dashboard/matches/match-detail/match-filters/net-game.ts`: the classifiers this design builds on.
- `src/components/dashboard/matches/match-detail/match-filters/model.ts`: `netCameIn` / `netHow` and `hands` in `MatchFilterContext`.
- `src/components/dashboard/matches/match-detail/statistics-lob-keys.tsx`: how lob keys reach the Statistics tab.
- `src/components/dashboard/matches/match-detail/shots/court-geometry.ts`: `RETURN_COURT` geometry and `trianglePointsFor`.
- `src/components/dashboard/matches/match-detail/shots/court-art.tsx` and `lightbox-court.tsx`: mark drawing and the selected / dimmed states.
- `src/components/dashboard/matches/match-detail/shots/default-cuts.ts`, `default-tiles.ts`, `viz-wall.tsx`, `wall-card.tsx`: the wall and its default cuts.
- `src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx`, `lightbox-filters.tsx`, `lightbox-stats.tsx`, `lightbox-point-list.tsx`: the opened view.
- `src/lib/data/player-season-viz.ts`, `src/lib/data/player-season-server.ts`, `src/components/dashboard/team/player-profile/profile-visualizations-view.tsx`, `season-viz-lightbox.tsx`, `season-net-game-card.tsx`: the season tab, its two loaders, opponent hand and clips.
- `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` and `src/app/dashboard/team/roster/[playerId]/page.tsx`: route traces to `ShotsTab` and `ProfileVisualizationsView`.
- `supabase/migrations/20260923210000_saved_views_rally_placement.sql`: precedent for the cut-check migration.
- Live database (Supabase MCP): `saved_views` check constraints; `matches.opponent_hand` / `player_hand` coverage.

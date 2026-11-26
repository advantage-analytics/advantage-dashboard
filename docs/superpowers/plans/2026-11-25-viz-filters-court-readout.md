# Viz filters, court labels, view switch and readout — build plan (2026-11-25)

## Goal

Ship the decisions made on the "Viz filters + saved views" canvas
(https://claude.ai/artifact/UYKWAqg8z8cMN2v8pGfKqf, page **Final**) so the
court visualizations read the way the Final boards do:

- every chart's Filters menu carries the filters people actually change, with
  one definition of "pressure" across Viz, the Video tab and Ask;
- the court names its parts and leaves every number to the Statistics panel;
- every chart except Serves can show where a shot was hit, where it landed, or
  both, linked;
- a hovered mark says what it is in one line and shows when it can be watched;
- the player page scopes its Statistics and Visualizations to chosen matches.

**Done when** every task below is merged into `splitstep-integration`, each
with its own gate run, and the lightbox on a real match matches the Final
boards named in each task (checked with `/pr-check` Stage 3b screenshots).

Each task is a layout change the user has already approved on the canvas — the
board named in the task is its before/after (AGENTS.md "A layout change is the
user's call"). Anything not on a board is out of scope.

Code map: `shots/` = `src/components/dashboard/matches/match-detail/shots/`,
`match-filters/` = `src/components/dashboard/matches/match-detail/match-filters/`.

## Tasks, in order

### 1. One definition of pressure points

Pressure points = 30–30, 30–40, 40–30, deuce and every ad point (not set/match
points at other scores).

- `match-filters/model.ts` `matchesScoreType("pressure")` (today 30–30, 40–40,
  break/set/match points) → the new rule. This changes the Video tab filter.
- `shots/viz-model.ts` `PressureValue` gains `"pressure"`; `viz-url.ts`
  `OPTIONS.pressure` reads Pressure points · Break points · Set & match points;
  predicate (`viz-model.ts:965`) and advanced fold (`:1149`).
- MCP: `src/lib/services/mcp/links.ts` enum, `server.ts:1590` description
  ("pressure is any break, set or match point" is already wrong); Ask
  `actions.ts`, `compare.ts`; `player-season-viz.ts:748`.
- Tests: `match-filters-model.spec:291`, `viz-model.spec:2356`,
  `mcp-route.spec:2151`, `ask-actions.spec:166`, `player-season-viz.spec:1168`.

### 2. Filters menu sections per chart (boards Final-03…07, Final-08, Final-09)

In `shots/lightbox-filters.tsx` (`filterKeysFor`, `viz-model.ts:1000`):

- **Serves:** Zone (Any · Wide · Body · T) first, then Rally length, Pressure,
  Court, Set.
- **Every other chart:** Rally length, Pressure, Court, Set (+ its own lead
  sections, e.g. Approaches' three groups, Errors' type).
- **Rally length** = segmented Any · Short · Medium · Long (`rally` is already a
  key with no section). Hover tooltips: Short "1–4 shots", Medium "5–8 shots",
  Long "9 or more shots". Pressure points' tooltip lists its scores.
- Segment buttons show no counts (they don't today; keep it).
- Advanced filters row stays last.

### 3. Returns lead chips (board Final-04)

Returns keeps **All · vs 1st serve · vs 2nd serve** as toolbar chips (the
`ball` facet, read as the serve being returned, `viz-model.ts:937`). The Serve
segmented row leaves the Returns Filters menu. The "Serve returned moves into
Filters" proposal board is superseded.

### 4. Chart menu split (boards Returns-split, Returns-split-bands)

`shots/chart-menu.tsx` keeps Scatter · Heat · Zones only. Bands
(`viz-bands-menu.tsx` rows) move to their own menu beside the legend. The
Return Placement/Contact rows leave the chart menu (task 6 replaces them).

### 5. Court labels: names only, today's style refined (boards Court-labels-11, -12, -8)

- Remove every figure from the lightbox court: `ServeBoxLabels` zone % and
  count (`lightbox-court.tsx:1523-1619`), `BandRate` (`viz-bands-overlay.tsx:139`).
  The Statistics panel owns the numbers; its row hover outline stays.
- Names: mono caps, 11px equivalent, even tracking (1.4px), 78–90% white;
  band range on its own line under the name ("DEEP" / "0–9 FT").
- Approaches keeps Placement + wing names over the far baseline and Contact
  under the near one, in the same type.
- Band washes stay edge to edge (`BAND_BLEED`).
- Wall court art (`court-art.tsx`) is out of scope.

### 6. Placement · Contact · Both view (boards Errors-both-2-zoom, Errors-contact-marks A)

- **State:** new viz param (not `view`, which is the saved-view id) for
  `placement | contact | both`, in `VIZ_KEYS`, parse/serialize, `sameView`;
  saved with a view (inside the filters JSON via `EMPTY_VIZ_FILTERS`, so no
  migration). Defaults: Placement for Errors, Returns, Rally shots; Both for
  Approaches; Serves has no switch.
- **Returns:** `returnPlacement` and `returnContact` become one chart with this
  view; the wall's "Return contact" card opens Returns in Contact.
- **Drawing:** generalise the Approaches pair (`pairContactPoint`, `MarkLayer`)
  to every chart with contact data. Landing = solid dot; contact = red ring with
  a white middle. Hover/select links the pair with a dashed white line; other
  landings fade to 40%, other contact rings to 60%.
- **Switch:** three court-glyph icon buttons beside the zoom control
  (`ZoomControls`, `viz-lightbox-shell.tsx:1549`), each with a tooltip
  ("Placement · where it landed", "Contact · where it was hit", "Both · where it
  was hit and where it landed").
- **Court words:** PLACEMENT over the far baseline, CONTACT under the near one.
- **Missing contact** (~1% of shots since Oct 2026, up to ~50% in summer 2026):
  a shot without contact shows its landing only; the readout says "Contact not
  recorded"; a "Contact recorded for X of Y" line shows only when some are
  missing.

### 7. Mark readout, polished C (board Readout-C)

`viz-readout.ts` / `lightbox-court.tsx:728-807`:

- **Hover:** one-line dark pill beside the mark — title with the shot and call
  ("Forehand unforced error") and the score — ending in a small white play
  badge when `canWatchMark`; no badge otherwise.
- **Click (select):** pinned dark card — title + score, where in the match,
  then rows "Hit from …" (ring glyph) and "Landed …" (dot glyph) when both ends
  exist, then a quiet white "▶ Watch point" text action under a hairline, or
  "No video for this point". Clicking Watch point (or the mark again) watches.
- Replaces `markClickHint`'s "Click to focus · Click again to watch"
  (`viz-readout.spec:409`).

### 8. Pin bands and approach lanes

Clicking a depth/contact band or an approach lane pins it (outline + its
Statistics row highlighted) until the next press, as serve zones do today
(`setPinnedZone`). It never filters.

### 9. Player page match scope, C4 (board Final-01, Final-12)

An "N of M matches" picker beside Ask and ⋯ on
`src/app/dashboard/team/roster/[playerId]/page.tsx` (`ProfileActions`), using
the Matches glyph. It scopes both Statistics and Visualizations; the lightbox's
Matches row inherits it. Reuse `SeasonFilters` / `lightbox-matches-sheet.tsx`.

### 10. Saved views polish (boards Final-10, -11, -13, -14, -15, -17, -18, -19)

Save popover with the "keeps" summary (Chart, Shots, Matches, Opens on);
rename stays a popover under the name; share/unshare and the shared-name clash
copy as on the boards. Default | Saved switch stays.

## Not doing

Page-level Set picker on the match report; "Your views" row on the wall;
in-place rename; a number row on the court; bands on Serves.

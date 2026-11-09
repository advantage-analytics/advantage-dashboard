# Visualizations tab redesign: build plan

Date: 2026-11-08. Design source: the Claude Design canvas "Visualizations Overhaul
Directions" (https://claude.ai/artifact/VUXQTLKggCKVQMXCt4d5EX), pages **Wall
variations** (W5 + card D3), **Final flow**, **Flow states** (S01–S17) and
**Statistics bar variations** (A2 + the open "Compare with" board, SVA3). Every
number on the canvas is a placeholder; nothing here may copy one.

Target: `src/components/dashboard/matches/match-detail/shots/` (the report's
Visualizations view, `REPORT_VIEWS` value `shots`). Branch off
`splitstep-integration`; every PR targets `splitstep-integration`.

## Ground rules (from the original brief, still binding)

- **No change to the data, the queries, the counts or the filter logic.** Every
  figure on screen comes from `computeViz` / `VizStats` / `buildDefaultTiles`
  over the same points the dots draw, under the same filters. The Statistics
  rows, the split bar on a card and the court's zone highlight all read the
  same `StatRow`s (`viz-model.ts`). No new aggregate is invented in a
  component.
- **Attribution:** "you" resolves only through `useMatchSides()`; won/lost stays
  relative to the card's subject (`docs/ui-revamp-guardrails.md` §4).
- **DS first:** read `.skills/advantage-analytics-design/SKILL.md`, then
  `reference/chrome.md` (Dialog v3, Dropdown/Menu, Dark Tooltip),
  `reference/tables.md` rule 6 (filter panel + applied strip),
  `reference/components.md` (Data Tooltip). Primary buttons from
  `advButton()`; menus from `ui/float-menu.tsx`; the dark readout from
  `match-detail/chart-tooltip.tsx`; the applied strip copies
  `film/film-filter-strip.tsx`; the point list reuses `film/point-list.tsx`'s
  `PointRow` (light tone).
- **Before editing, trace the route** (`trace-route` skill). `court-tile.tsx`,
  `viz-focused.tsx` and `viz-fullscreen.tsx` all draw courts.
- **After building, list the counts you checked** against today's page for the
  same match and filters (see Verification).

## What exists today (splitstep-integration)

| Piece                                 | File                                                                                         | Fate                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Wall of 10 tiles (5 cuts × 2 players) | `viz-wall.tsx`, `default-tiles.ts`, `default-cuts.ts`, `court-tile.tsx`                      | Rework to 4 court-first cards, one player at a time     |
| Focused view (page)                   | `viz-focused.tsx`, `viz-toolbar.tsx`, `stats-card.tsx`                                       | Replaced by the lightbox                                |
| Fullscreen viewer                     | `viz-fullscreen.tsx`, `viz-fullscreen-court.tsx`, `use-fullscreen-reveal.ts`                 | **Dropped**; its pan/zoom moves into the lightbox       |
| Court drawing, active ring            | `court-art.tsx`, `court-geometry.ts`                                                         | Kept; line weight and readout adjustments               |
| Chart / cut / filter menus            | `chart-menu.tsx`, `cut-menu.tsx`, `filters-popover.tsx`, `viz-labels.tsx` (`VizMenuTrigger`) | Restyled to the Matches trigger grammar and `FloatMenu` |
| Applied tokens strip                  | `applied-strip.tsx`                                                                          | Replaced by the one-sentence strip (rule 6)             |
| URL state                             | `viz-url.ts` (`VizState.cut === null` = wall)                                                | Kept: `?cut=` now opens the lightbox over the wall      |
| Pan/zoom                              | `use-pan-zoom.ts`, `pan-zoom.ts`                                                             | Reused in the lightbox                                  |
| Saved views                           | `saved-views-band.tsx`, `save-view-dialog.tsx`, bands                                        | Unchanged ("Saved" tab)                                 |

This worktree also has older, **uncommitted** experiments (colour-blind mark
tokens in `colors.css`, `mark-paint.ts`, `viz-legend.tsx`,
`density-toggle.tsx`) that the settled design supersedes (codebase mark
colours, no Dots/Zones/Heat toggle on the card). Park them in a WIP commit on
this branch; build on a fresh branch from `splitstep-integration` (this
worktree is 83 commits behind it).

## Phases

Each phase is one PR-sized change with its own tests, in this order. Later
phases depend on earlier ones.

### 1. Wall: four court-first cards (W5 + D3)

- `default-cuts.ts`: four questions, in order: **First serves**, **Returns**
  (placement; contact becomes a chart in the lightbox), **Rally shots**,
  **Unforced errors**. Keep the errors-judged rule (`errorsJudgedIn`).
- `viz-wall.tsx`: toolbar strip `Default | Saved` · `You | Opponent` (one player
  at a time, URL-backed) · legend. 2×2 grid.
- `court-tile.tsx`: court runs to the card's edges; footer = 16px/400 title
  (heading-md, `<h3>`), count with its unit ("27 of 31 in", "64 in",
  "14 total"), a 6px split bar of the card's `StatRow`s, and its key with a
  lead word (Landed / Went / Missed). Hover a segment → dark readout
  (`ChartTooltip`): "T · 12 in play / 8 won · 67% / Average 63% across all 27".
- Card hover: border-medium + a slightly stronger shadow. The whole card is
  one link (keyboard: Enter).
- Tests: update `viz-gallery-browser`, `viz-labels*`; new offline spec for the
  four-cut list and the split-bar counts summing to the card's count.

### 2. Lightbox shell (replaces focused view and fullscreen)

- New `viz-lightbox.tsx` on the Radix Dialog in Dialog v3 geometry: scrim
  `rgba(13,13,13,.4)`, 14px radius, dropdown shadow, 24/24/20 padding, close
  28px. On a 1512×982 viewport: 1212px wide, top 96px, court 800px.
- Header: title = the card's own title ("First serves", 16/500); one 12px line:
  "Serve placement · You · 27 of 31 in, 17 of those 27 won".
- Body: court column (control row → applied strip when filtered → court →
  legend, 12px rhythm) + 340px right column (Points / Statistics).
- Footer: quiet blue "Save as view" left; `advButton("primary","sm")`
  "Watch these N points" right (N follows filters; disabled when 0). No Cancel:
  ✕, Esc and the scrim close it.
- `?cut=…` opens it over the wall; close restores the wall's scroll and card
  focus. Filters made inside do not leak onto the wall.
- Delete `viz-fullscreen*.tsx`, `use-fullscreen-reveal.ts`, and the focused
  page once parity is proven; port `viz-fullscreen-filters-browser` to the
  lightbox.

### 3. Court in the lightbox

- `court-art.tsx`: line weight ×1.3 at lightbox size (lines scale with the drawn
  size, not fixed px).
- Selection: the shipped active treatment only, mark at its own size, 1.5px
  white ring at radius + 3, siblings fade to 40%. Hover = readout only; click
  (mark or list row) = selected, both lit; Esc deselects.
- Readout: dark `ChartTooltip`, 8px clear of the ring, min 168px: legend glyph +
  result + score (right, tabular) / shot / "Set 2 · Game 5 · You serving".
  No controls inside.
- Zoom: + / − / Fit control (bottom-right), ⌘-scroll / pinch, drag to pan,
  "180% · drag to move around" while zoomed; readout hidden while moving;
  reset on close. Reuse `use-pan-zoom.ts` (`viz-pan-zoom.spec.ts` follows).

### 4. Points column

- Reuse `PointRow` (light tone): 52px full-bleed rows, 14px sides, winner mark
  (workspace mark / initials), 12/500 title, 11px detail, 11px mono score that
  slides for the bookmark. No 2px progress rule and no shot well here.
- Game headers as the Video tab. Header count "matched / total".
- Out-only filter: "No points to play" empty line, Watch disabled.

### 5. Filtering

- **Legend as filter**: Won · Lost · Out · Ace with counts; one at a time
  (Won includes aces); chosen key full ink, others 35%; click again clears.
  Filters `VizDot`s by existing outcome fields; no new data.
- **Filters panel**: the Matches panel layout in `FloatMenu`: segmented
  Serve / Court / Set, checklists with counts (Serve type, Score), Clear +
  live count footer. Uses the existing `VizFilters` keys only.
- **Applied strip** (rule 6, copy of `FilmFilterStrip`): under the control
  row; filter icon · sentence in middot-joined capitalised phrases
  ("Aces · To the T") · "12 of 52 points" · "Back to all points" (a
  Statistics cut alone) or "Clear filter". The Filters trigger wears the
  engaged wash while any cut is on.
- Triggers: Matches grammar (no fill at rest, wash when open/engaged,
  ink-700 → ink-900, 13px icon). Align `VizMenuTrigger` so the tab matches.

### 6. Statistics column

- Rows from `VizStats` (`stats-card.tsx` logic, displayed per the canvas):
  label · count · %, then a 4px bar with the benchmark tick (variant A2).
  Best row 13/500 ink-900. Groups 24px apart.
- Group header: eyebrow + right-aligned tick sample and benchmark name.
- Hover a row → court outlines that zone (dashed white) and fades the rest;
  click → court and Points keep only that zone, applied strip names it, you
  stay in Statistics.
- **Compare with** (FloatMenu, default **All matches**): All matches · This
  season (since Aug 1, `academicSeason()`) · Last 10 matches · This match.
  Until phase 7 lands, ship **This match** only (the tick at the match
  average) and hide the picker.

### 7. Cross-match benchmarks (needs a data decision first)

- New server loader (`src/lib/data/viz-benchmarks-server.ts`): per player, per
  split (serve zone, side, depth; return direction; rally depth), won / count
  over all matches, this season, last 10, using the same classification
  functions as `computeViz` so a match's own rows reproduce exactly.
- RLS-scoped to what the viewer can already read (own matches; a team's
  matches for members). An opponent with no other matches → no tick.
- Stop and agree: which matches count (practice? unfinished?), minimum sample
  for a tick, and team vs personal scope. Verify against the live DB
  (`list_tables` / `execute_sql`), not `supabase/migrations/`.

### 8. Cleanup and verification

- Remove dead code (fullscreen, focused page, applied tokens), update
  `MAP.md` only if routes changed (`npm run map`), run
  `node scripts/check-design-drift.mjs`.
- Run `npm run typecheck`, `npm run lint`, `npm run test` (offline specs; live
  specs only against a non-production project).
- **Counts checked**, for at least two real matches (one SwingVision, one
  Advantage Intelligence), You and Opponent, unfiltered and with one legend and
  one Statistics cut: card count, split-bar segment counts, lightbox subtitle,
  list "matched / total", Statistics rows, applied-strip "N of M", Watch N.
  Each must equal today's focused-view numbers for the same filters.
- `/pr-check` is user-invoked; the eyes-on stage checks the wall, the lightbox
  and S04/S06/S10/S11-equivalent states.

## Open decisions

1. Benchmark scope and minimum sample (phase 7).
2. Whether "Returns" opens on placement with Contact in the chart menu (as
   designed) or keeps two cards.
3. Align the shipped `VizMenuTrigger` (filled at rest) with the Matches
   grammar tab-wide, or only inside the lightbox.

# Tasks — claude/filter-ui-saved-viz-d88b5f

> Scope: viz filters, court labels, Placement/Contact/Both view, mark readout, player-page match scope and saved-views polish — docs/superpowers/plans/2026-11-25-viz-filters-court-readout.md

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

## T1 · Unify the pressure-points definition

- **status:** done
- **model:** fable
- **files:** (guess) src/components/dashboard/matches/match-detail/match-filters/model.ts (`matchesScoreType`, ~:704), src/components/dashboard/matches/match-detail/shots/{viz-model.ts,viz-url.ts}, src/lib/services/mcp/{links.ts,server.ts}, src/lib/services/ask/{actions.ts,compare.ts}, src/lib/data/player-season-viz.ts, tests/{match-filters-model,viz-model,mcp-route,ask-actions,player-season-viz}.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `matchesScoreType(point, "pressure")` is true at 30–30, 30–40, 40–30, deuce and every ad point, and false for a set or match point at any other score; `tests/match-filters-model.spec.ts` pins both directions
  - [ ] `PressureValue` in `viz-model.ts` includes `"pressure"`, the viz predicate and the advanced fold apply the same rule, and `OPTIONS.pressure` in `viz-url.ts` reads "Pressure points", "Break points", "Set & match points" in that order; `tests/viz-model.spec.ts` covers the new value
  - [ ] The MCP enum in `links.ts` accepts the new value and the `server.ts` tool description no longer says pressure is "any break, set or match point" and states the new rule; `tests/mcp-route.spec.ts` updated
  - [ ] Ask (`actions.ts`, `compare.ts`) and `player-season-viz.ts` accept and apply the new value; `tests/ask-actions.spec.ts` and `tests/player-season-viz.spec.ts` updated
- **notes:** Plan: docs/superpowers/plans/2026-11-25-viz-filters-court-readout.md §1. This changes what the Video tab's pressure filter returns — intended. No board: a definition change, not a layout change. Board Final-08 shows the resulting option labels (canvas https://claude.ai/artifact/UYKWAqg8z8cMN2v8pGfKqf, page Final).

## T2 · Reorder Filters menu sections per chart

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/lightbox-filters.tsx (`LightboxFilterPanel`), src/components/dashboard/matches/match-detail/shots/viz-model.ts (`filterKeysFor`, ~:1000), src/components/dashboard/matches/matches-filter-panel.tsx (`Segmented`), tests/viz-lightbox-browser.spec.ts, tests/viz-approach-filters-browser.spec.ts
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] On Serves the Filters menu sections render in this order: Zone (Any · Wide · Body · T), Rally length, Pressure, Court, Set, with the Advanced filters row last; a spec asserts the order
  - [ ] On Returns, Errors and Approaches the menu renders the chart's own lead sections first (Approaches' three groups, Errors' type), then Rally length, Pressure, Court, Set, with Advanced filters last; Rally shots' menu carries Pressure, Court, Set and Advanced filters last
  - [ ] Rally length is a single-choice segmented row Any · Short · Medium · Long that writes the existing `rally` filter key, with hover tooltips "1–4 shots", "5–8 shots", "9 or more shots"
  - [ ] The "Pressure points" option carries a tooltip listing its scores ("30–30, 30–40, 40–30, deuce and ad points")
  - [ ] Segmented buttons render no counts
- **notes:** Plan §2. Approved before/after: boards Final-03…07, Final-08, Final-09. DECIDED (author, 2026-11-25): on Rally shots, Rally length is toolbar chips (board Final-07), not a Filters section. Read .skills/advantage-analytics-design/SKILL.md and docs/ui-revamp-guardrails.md first.

## T3 · Add Returns serve-returned toolbar chips

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/{viz-lightbox-shell.tsx,lightbox-filters.tsx,viz-model.ts} (`ball` facet ~:937), tests/viz-lightbox-browser.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] The Returns lightbox toolbar renders a chip group labelled "Serve returned" with All · vs 1st serve · vs 2nd serve, and `aria-pressed` follows the current `ball` filter
  - [ ] Pressing "vs 2nd serve" sets the `ball` filter to second serves and the court count narrows; a browser spec asserts it
  - [ ] The Returns Filters menu no longer renders a Serve segmented row
- **notes:** Plan §3. Approved before/after: board Final-04. `ball` on return cuts already means the serve being returned — no model change. The "Serve returned moves into Filters" board (Returns-split-filters) is superseded; do not build it.

## T4 · Split Bands out of the chart menu

- **status:** done
- **model:** opus
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/{chart-menu.tsx,viz-bands-menu.tsx,viz-lightbox-shell.tsx}, tests/viz-lightbox-browser.spec.ts, tests/viz-bands.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `ChartMenu` renders exactly Scatter, Heat and Zones — no bands rows and no Return Placement/Contact rows (`RETURN_CUTS` is gone from `chart-menu.tsx`)
  - [ ] A separate menu trigger beside the legend (labelled "Bands · <current choice>", menu `aria-label` "Depth bands") carries the rows `VizBandsMenuRows` drew before, including "Edit bands…"
  - [ ] Choosing a band option from the new menu changes the drawn bands exactly as the old rows did; a spec opens the new menu and asserts it
  - [ ] Charts that had no bands rows before show no Bands trigger
- **notes:** Plan §4. Approved before/after: boards Returns-split, Returns-split-bands. The return rows are replaced by T7's view switch; until T7 lands, Return contact is reachable only from its wall card — accepted by the author (same branch). Bands on Serves is explicitly not doing.

## T5 · Show names only on the lightbox court

- **status:** done
- **model:** opus
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx (`ServeBoxLabels` ~:1523, `ApproachApronLabels` ~:820), src/components/dashboard/matches/match-detail/shots/viz-bands-overlay.tsx (`BandRate` ~~:139), tests/viz-approach-lightbox-browser.spec.ts (~~:328-376, :435-451), tests/viz-all-zones-browser.spec.ts, tests/viz-serve-zones-browser.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `ServeBoxLabels` draws zone names only — no percentage and no count text on the lightbox court; a spec asserts the zone labels hold no figures
  - [ ] `BandRate` is removed from `viz-bands-overlay.tsx`; each band label is its name with the range on its own line beneath it ("DEEP" / "0–9 FT")
  - [ ] Court names are set in mono caps at the 11px-equivalent size with 1.4px tracking and white at 78–90% opacity, expressed as constants in the diff
  - [ ] Approaches keeps Placement plus the wing names over the far baseline and Contact under the near one, using the same type constants
  - [ ] `BAND_BLEED` is unchanged and `court-art.tsx` is not modified
- **notes:** Plan §5. Approved before/after: boards Court-labels-11, Court-labels-12, Court-labels-8. The Statistics panel owns the numbers and its row-hover outline stays. Wall court art is out of scope; "a number row on the court" is not doing.

## T6 · Add the Placement/Contact/Both view state

- **status:** done
- **model:** fable
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/viz-url.ts (`VizState` ~:189, `VIZ_KEYS` ~:569, `parseVizState` ~:746, `vizStateQuery` ~:830, `sameView`/`viewIdentityKey` ~:58), src/components/dashboard/matches/match-detail/shots/viz-model.ts (`EMPTY_VIZ_FILTERS`, `KNOWN_FILTER_KEYS`), src/lib/data/saved-views-logic.ts, tests/viz-url.spec.ts, tests/saved-views-logic.spec.ts
- **done when:**
  - [ ] A new viz URL param — not `view`, which stays the saved-view id — carries `placement | contact | both`; it is listed in `VIZ_KEYS` and round-trips through `parseVizState` and `vizStateQuery` (`tests/viz-url.spec.ts`)
  - [ ] `sameView` / `viewIdentityKey` treat two states that differ only in this value as different views
  - [ ] The value is saved with a view inside the filters JSON (via `EMPTY_VIZ_FILTERS` / `KNOWN_FILTER_KEYS`), with no migration file in the diff; `tests/saved-views-logic.spec.ts` shows it surviving save and load
  - [ ] An absent value resolves to Placement for Errors, Returns and Rally shots and to Both for Approaches; Serves carries no value and never serialises one
- **notes:** Plan §6 "State". Approved before/after: boards Errors-both-2-zoom, Errors-contact-marks A (this task is the state under them; no UI here). `tests/viz-url.spec.ts` uses `toEqual` on `VizState`, so existing expectations need the new field. Old saved rows without the key must load at the default.

## T7 · Merge the two Returns charts into one

- **status:** done
- **model:** fable
- **needs:** T4, T6
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/{default-cuts.ts,cut-menu.tsx,cut-kinds.ts,default-tiles.ts,viz-wall.tsx,wall-card.tsx,viz-url.ts}, tests/viz-url.spec.ts, tests/viz-gallery-browser.spec.ts
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] The lightbox offers one Returns chart whose Placement / Contact view (T6's state) replaces choosing between `returnPlacement` and `returnContact`; `cut-menu.tsx` no longer lists them as two charts
  - [ ] The wall's "Return contact" card opens Returns with the view set to Contact; a spec asserts the resulting state
  - [ ] The wall's Return placement card opens Returns in Placement, its default
- **notes:** Plan §6 "Returns". Approved before/after: boards Returns-split, Errors-both-2-zoom. DECIDED (author, 2026-11-25): `returnContact` stays a loadable id — saved views, MCP links (src/lib/services/mcp/links.ts) and Ask actions (src/lib/services/ask/actions.ts) that carry it open Returns in Contact; no migration. The cut ids appear in ~25 files; change only what the three criteria need.

## T8 · Draw contact–landing pairs on every chart

- **status:** done
- **model:** fable
- **needs:** T5, T6
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx (`pairContactPoint` ~:251, `MarkLayer` ~~:1259, `UNSELECTED_OPACITY` ~~:214), src/components/dashboard/matches/match-detail/shots/{viz-points.ts,viz-model.ts,viz-readout.ts}, src/lib/data/player-season-viz.ts, tests/viz-approach-lightbox-browser.spec.ts (~~:41, :83, :122), tests/viz-lightbox-browser.spec.ts (~~:130)
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] Errors, Returns and Rally shots draw from T6's view like Approaches: Placement draws landings only, Contact draws contact marks only, Both draws both; a browser spec covers one non-Approaches chart in Both
  - [ ] A landing is a solid dot and a contact mark is a red ring with a white middle
  - [ ] Hovering or selecting a mark links its pair with a dashed white line, fades other landings to 40% and other contact rings to 60% opacity (both as named constants)
  - [ ] In Both, a shot with no recorded contact draws its landing only, with no ring and no line
  - [ ] The court reads PLACEMENT over the far baseline and CONTACT under the near one, in T5's label type
- **notes:** Plan §6 "Drawing", "Court words", "Missing contact". Approved before/after: boards Errors-both-2-zoom, Errors-contact-marks A. Only Approaches draws pairs today; other cuts may not carry contact coordinates into the lightbox yet (the season lightbox computes on the server in player-season-viz.ts) — plumbing them is in scope. Contact is missing for ~1% of shots since Oct 2026 and up to ~50% in summer 2026. Serves is untouched.

## T9 · Add the view switch and missing-contact copy

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx (`ZoomControls` ~~:1549, mounted ~~:1305), src/components/dashboard/matches/match-detail/shots/{viz-readout.ts,lightbox-court.tsx}, tests/viz-lightbox-browser.spec.ts (~~:161), tests/season-viz-browser.spec.ts (~~:984), tests/viz-readout.spec.ts
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] Three court-glyph icon buttons labelled Placement, Contact and Both sit beside the zoom control as one radio group; pressing one writes T6's view param and marks it checked; a browser spec asserts it
  - [ ] Their tooltips read "Placement · where it landed", "Contact · where it was hit", "Both · where it was hit and where it landed"
  - [ ] Serves shows no switch
  - [ ] A "Contact recorded for X of Y" line renders only when at least one shown shot has no contact, and is absent when all have it
  - [ ] The readout of a shot with no contact says "Contact not recorded" (`tests/viz-readout.spec.ts`)
- **notes:** Plan §6 "Switch", "Missing contact". Approved before/after: board Errors-both-2-zoom (variant B, icons beside zoom — the on-court, menu and toolbar variants on Errors-both-1/3/4 were not chosen). Read .skills/advantage-analytics-design/SKILL.md first.

## T10 · Rebuild the mark readout as pill and card

- **status:** todo
- **model:** opus
- **needs:** T8
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/viz-readout.ts (`buildMarkReadout` ~:179, `markClickHint` ~~:172), src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx (~~:728-807), src/components/dashboard/matches/match-detail/shots/viz-lightbox-shell.tsx (clicks ~:569, `canWatch` ~~:610), tests/viz-readout.spec.ts (~~:317, :409)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] Hovering a mark shows a one-line dark pill beside it: a title naming the shot and call (e.g. "Forehand unforced error") and the score, ending in a white play badge when `canWatchMark` and with no badge otherwise
  - [ ] Selecting a mark pins a dark card: title and score, a where-in-the-match line, then a "Hit from …" row (ring glyph) and a "Landed …" row (dot glyph) when both ends exist
  - [ ] The card ends, under a hairline, in a "Watch point" text action when the point can be watched and in "No video for this point" otherwise
  - [ ] Clicking "Watch point", or the selected mark again, watches the point
  - [ ] `markClickHint`'s "Click to focus · Click again to watch" is gone and `tests/viz-readout.spec.ts` asserts the new strings
- **notes:** Plan §7. Approved before/after: board Readout-C (four states: hover/clicked × video/no video). Board sample copy: "Set 2 · Game 5 · You serving", "3 ft behind the baseline", "2 ft long". Readout-options / Readout-more / Readout-final are earlier rounds, not the spec.

## T11 · Pin bands and approach lanes on click

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/viz-bands-overlay.tsx (inert today, `pointer-events: none` ~:225, :324), src/components/dashboard/matches/match-detail/shots/lightbox-court.tsx (`setPinnedZone` ~:474, `ApproachApronLabels`), src/components/dashboard/matches/match-detail/shots/{viz-lightbox-shell.tsx,lightbox-stats.tsx}, tests/viz-all-zones-browser.spec.ts, tests/viz-approach-lightbox-browser.spec.ts
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] Clicking a depth or contact band pins it: its outline stays after the pointer leaves and clears on the next press; a browser spec asserts both
  - [ ] Clicking an approach lane pins it the same way
  - [ ] While a band or lane is pinned, its Statistics row is highlighted
  - [ ] Pinning changes no filter: the viz URL query is identical before and after the click (asserted in the spec)
- **notes:** Plan §8. No board — the author approved building it as a behaviour change mirroring how serve zones pin today (`setPinnedZone` + `useDismissOnNextPress`). The bands overlay is deliberately inert today, so the band editor's handles must keep working once bands take clicks.

## T12 · Scope the player page to chosen matches

- **status:** todo
- **model:** fable
- **files:** (guess) src/app/dashboard/team/roster/[playerId]/page.tsx, src/lib/data/player-season-viz.ts, src/lib/data/player-season-server.ts, src/components/dashboard/team/player-profile/{profile-statistics-view.tsx,profile-visualizations-view.tsx,season-viz-lightbox.tsx}, src/components/dashboard/matches/match-detail/shots/viz-url.ts (`SeasonFilters` ~:245), tests/{player-season,profile-statistics-view,player-season-viz,season-viz-browser}.spec.ts
- **routes:** /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] The player page reads a match scope (the existing `SeasonFilters` shape: result, opponent hand, surface, picked matches) from its URL and the Statistics body is computed only from the scoped matches; a spec shows an unpicked match's points leaving a Statistics figure
  - [ ] The Visualizations wall and its cards are computed from the same scope, and the scope survives switching between the Statistics and Visualizations tabs
  - [ ] Opening a card's lightbox starts its Matches row at the page's scope
  - [ ] With no scope in the URL, both bodies render exactly as before (existing season specs pass unchanged)
- **notes:** Plan §9 (decision C4; variants A, B, C, C2, C3 were rejected). Approved before/after: boards Final-01, Final-12. Today `SeasonFilters` lives in the viz state (`vopp`/`vres`/`vsurf`/`vm`) and scopes only the lightbox; this task lifts it to the page. The season is computed on the server — points are megabytes, never filter in the browser. The picker UI is T13.

## T13 · Add the "N of M matches" picker

- **status:** todo
- **model:** opus
- **needs:** T12
- **files:** (guess) src/components/dashboard/team/player-profile/profile-actions.tsx, src/app/dashboard/team/roster/[playerId]/page.tsx (title row ~:296-341), src/components/dashboard/matches/match-detail/shots/lightbox-matches-sheet.tsx (`draftFrom`, `seasonFiltersFrom`, `countedMatches`), tests/player-profile.spec.ts, tests/season-viz-browser.spec.ts
- **routes:** /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] `ProfileActions` renders, before Ask and ⋯, a button with the Matches glyph reading "N of M matches" that opens a dialog
  - [ ] The dialog (label "Which matches") is headed "Matches" with "For Statistics and Visualizations", offers Won · Opponent plays · Surface menus, and lists matches as checkboxes grouped by month ("vs <opponent>", score, date), reusing `lightbox-matches-sheet.tsx`'s draft logic rather than a second copy
  - [ ] Its footer holds "Clear all", the scoped counts, and a primary "Show N matches" that writes T12's scope to the URL and closes
  - [ ] When a scope is applied, the title row's facts line reads "Showing N of M analyzed matches" followed by the applied filter words, with a "Show all" action that clears the scope
- **notes:** Plan §9. Approved before/after: boards Final-01 (picker open, 3-match season) and Final-12 (24-match season: adds "Search opponents", "8 picked · 14 won of 24" and "Use all shown" — the existing sheet already has these; the board does not state the season length at which they appear, so keep the sheet's own rule). Dashboard mockups are 1280 laptop only. Read .skills/advantage-analytics-design/SKILL.md first.

## T14 · Add the keeps summary to Save this view

- **status:** todo
- **model:** opus
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/save-view-dialog.tsx (Share with team ~:383-427), src/components/dashboard/matches/match-detail/shots/save-as-view-button.tsx, src/components/dashboard/team/player-profile/use-season-saved-views.ts, tests/saved-views-logic.spec.ts
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] The "Save this view" popover shows a summary list labelled "What this view keeps" with rows Chart, Shots, Matches and Opens on
  - [ ] The Chart row reads the chart and its kind (e.g. "Serve placement · Scatter"), the Shots row reads the applied-filter sentence (e.g. "1st serves · Break points"), and Opens on reads "Every match and player profile"
  - [ ] In a team workspace the "Share with team" row carries the hint "Everyone in <program name> can open it"
  - [ ] A spec asserts the summary's rows and values for one saved state
- **notes:** Plan §10. Approved before/after: board Final-11 (also Final-10 for the footer it opens from). DECIDED (author, 2026-11-25): the Matches row reads "Won · from this page" (or the page's scope words) on the player page and "This match" on a match report. Final-10's edited-view state already works today and is out of scope. Saved views store cut, chart and filters only.

## T15 · Polish rename, share and name-clash states

- **status:** todo
- **model:** opus
- **files:** (guess) src/components/dashboard/matches/match-detail/shots/{rename-view-dialog.tsx,saved-view-title-menu.tsx,manage-tile-menu.tsx,saved-views-band.tsx (`handleShare` ~:512),viz-lightbox.tsx}, src/components/dashboard/team/player-profile/use-season-saved-views.ts, src/lib/data/saved-views-logic.ts (`manageMenuRows` ~:506), tests/saved-views-logic.spec.ts
- **routes:** /dashboard/matches/[matchId], /dashboard/team/roster/[playerId]
- **done when:**
  - [ ] Rename stays a popover anchored under the view's name, with the note "Changes the name on every match and player profile."; when the name is taken the note reads "You already have a view called “<name>”.", the field is `aria-invalid` and Rename is disabled
  - [ ] An open shared view shows a "Shared with team" tag beside its title for its owner and "Shared by <name>" for a teammate; a teammate who cannot manage it (`canManageSavedView`) sees no ⋯ menu
  - [ ] The ⋯ menu offers "Share with team" on a private view and "Make private" on a shared one, with Delete view last after a divider
  - [ ] Sharing a view whose name a shared view already uses shows, under the title, an alert reading "A shared view is already called “<name>”. Rename yours first." with a Rename action that opens the rename popover
  - [ ] `lifecycle-chip.tsx` (the Default | Saved switch) is not modified
- **notes:** Plan §10. Approved before/after: boards Final-13 (menu), Final-14 (rename), Final-15 (name taken), Final-17 (a view you shared), Final-18 (share clash), Final-19 (teammate's view). In-place rename is explicitly not doing. The clash copy exists today with straight quotes in two places (saved-views-band.tsx ~:524, use-season-saved-views.ts ~:152); the boards use curly quotes. DECIDED (author, 2026-11-25): the menu row keeps the code's "Rename…" (it opens a popover).

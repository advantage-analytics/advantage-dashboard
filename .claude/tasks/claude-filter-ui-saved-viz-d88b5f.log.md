# Run log — claude/filter-ui-saved-viz-d88b5f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Unify the pressure-points definition — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** "Pressure points" now means the score alone — 30–30, 30–40, 40–30, deuce and every ad point (no-ad deciding point counts as deuce; tiebreak and unrecorded-score points never count) — via one `isPressurePoint` in match-filters/model.ts, used by the Video tab filter, the viz `PressureValue` "pressure" (labels Pressure points · Break points · Set & match points), MCP `pressure_points` with one rule string in both tool descriptions, and season option counts. Break and set & match points unchanged.
**follow-ups:**

1. The lightbox Filters menu does not offer "Pressure points" yet (lightbox-filters.tsx ~:294) — T2 rebuilds that section.
2. Ask's planner still treats pressure as break/set/match points (ask/prompts.ts ~:828, :1499; ask.ts `ignoresBigPoints` ~:2737); `SCORE_FLAG.pressure` in ask/show.ts maps to `is_pressure_point`, never true. Populating `ask.points.is_pressure_point` with this rule would fix both; needs prompt work and live sampling.
3. The Video tab's option still reads "Pressure" (model.ts ~:339) while Viz says "Pressure points".

## T2 · Reorder Filters menu sections per chart — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** lightbox-filters.tsx rebuilt the menu order: Serves = Zone (single-choice Any · Wide · Body · T over the existing list key) → Rally length → Pressure → Court → Set; Errors/Approaches lead with their own sections, then the shared run; Rally shots skip Rally length (chips later). New Rally length segmented row (tooltips "1–4 shots", "5–8 shots", "9 or more shots"), Pressure section renamed from Score with a Pressure points tooltip. matches-filter-panel.tsx gained optional option/row tooltips via ChromeTooltip. The 1st/2nd Serve row stays as a trailing section until the toolbar chips land. Specs in viz-lightbox-browser, viz-approach-filters-browser, season-viz-browser. Widget-states: no loader or Suspense region touched.
**follow-ups:**

1. Rally shots has no rally-length control until its toolbar chips land (it had none before either).
2. `OPTIONS.rally.long` reads "9+ shots" while the tooltip says "9 or more shots" — align.
3. Decide where 1st/2nd serve lives on Serves, Errors, Approaches and Rally shots once Returns gets its chips (T3).

## T3 · Add Returns serve-returned toolbar chips — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Both return cuts get a "Serve returned" chip group (All · vs 1st serve · vs 2nd serve, LifecycleChip, aria-pressed from `ball`) in the lightbox toolbar after the player chips (viz-lightbox-shell.tsx), wired through the Filters menu's onChange; the Returns Filters menu drops its Serve row (lightbox-filters.tsx). New browser spec on both return cuts; the lightbox harness gained an opt-in `?fixture=returns` with return marks. Widget-states: toolbar chips, no loader or Suspense region touched.
**follow-ups:**

1. Rally shots has no rally-length control at all since T2 (board Final-07 shows toolbar chips) — needs a task; reuse this chip-group pattern.
2. Board Final-04 shows lead chips on other charts too (Serves 1st/2nd, Errors type, Approaches way to the net); only Returns has them.
3. The chips hide while the lightbox is in draft state — check at /pr-check.

## T4 · Split Bands out of the chart menu — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** chart-menu.tsx is Scatter · Heat · Zones only (`RETURN_CUTS`, return rows and bands section removed). New `VizBandsMenu` (viz-bands-menu.tsx) — trigger "Bands · <choice>" (No bands / preset / Custom / contact positions) in a new `bandsMenu` slot beside the legend (viz-lightbox-shell.tsx), menu "Depth bands" or "Contact bands" with the unchanged `VizBandsMenuRows`; hidden on cuts without bands and on drafts (viz-lightbox.tsx). Four new specs in viz-lightbox-browser. Widget-states: menu trigger only, no loader or Suspense region touched.
**follow-ups:**

1. Until T7, Return contact is reachable only from its wall card (agreed).
2. The menu's label now repeats the heading row inside `VizBandsMenuRows`; drop the inner heading in a polish pass.

## T5 · Show names only on the lightbox court — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Lightbox court prints names only. `ServeBoxLabels` keeps WIDE/BODY/T and DEUCE COURT/AD COURT; the % and count row is gone and its hit strip became a transparent rect over each served cell (hover, tap-to-pin, readout and aria sentence kept; steps aside on the Zones chart). `BandRate` removed; band labels are name + range on two lines ("DEEP" / "0–9 FT"), one line for contact bands. Shared constants in viz-bands-overlay.tsx: COURT_LABEL_SIZE (11px ≈ 6.18 units), COURT_LABEL_TRACKING (1.4px ≈ 0.79), COURT_LABEL_OPACITY 0.86, COURT_SIDE_LABEL_OPACITY 0.78, used by ServeBoxLabels, band labels and ApproachApronLabels. court-art.tsx and BAND_BLEED untouched. Specs in viz-serve-zones-browser and viz-approach-lightbox-browser. Widget-states: SVG labels only, no loader or Suspense region touched.
**follow-ups:**

1. court-art.tsx comments (~:722) still describe band labels as "DEEP · 0–13 FT".
2. The `APPROACH_*` label constants in court-art.tsx may now be used only by the wall art — check for dead exports.

## T6 · Add the Placement/Contact/Both view state — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** viz-model.ts adds `CourtEnds = "placement" | "contact" | "both"`, `VizFilters.ends` (null = the cut's default), `defaultCourtEnds(cut)` (Both on Approaches, none on Serves, Placement elsewhere), `courtEndsFor`, `storedCourtEnds` and the setter `withCourtEnds`. viz-url.ts carries it as `?vends=` (in VIZ_KEYS; parse + serialise; the default is never written), and `sameView`/`viewIdentityKey` compare the resolved value. Saved inside a view's filters JSON via EMPTY_VIZ_FILTERS (saved-views-logic.ts `filtersToParams`), no migration; old rows load at the default. `ends` is not a filter token; `clearedFilters` keeps it, `carryFilters` re-reads it per cut. One-line exclusions in viz-lightbox.tsx and player-season-viz.ts keep it out of a saved view's baseline keys.
**follow-ups:**

1. T9: because `viewIdentityKey` changes with ends, toggling the switch will run the court morph, scroll and refocus — handle as an in-place toggle if unwanted.
2. T9: decide whether toggling ends on an open saved view counts as editing it (the baseline excludes ends while `sameView` says it differs).
3. T9: the lightbox "Clear filter" paths (viz-lightbox.tsx ~:321, season-viz-lightbox.tsx:242) rebuild from EMPTY_VIZ_FILTERS and reset ends, unlike `clearedFilters`.
4. T7: map old `cut=returnContact` links and saved rows to Returns with `ends: "contact"`.
5. MCP `open_visualization` has no ends parameter yet.

## T7 · Merge the two Returns charts into one — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Returns is one chart. Both cut ids stay internal: `chartView(cut, filters)` (viz-model.ts) rewrites `returnContact` to `returnPlacement` + `ends: "contact"`, and `drawnCut(cut, filters)` picks the court to compute and draw (Both on Returns draws placement until T8). `parseVizState` normalises old links; the match and season lightboxes draw via `drawnCut` (use-viz-view.ts, viz-lightbox.tsx, season-viz-lightbox.tsx, player-season-viz.ts). cut-menu.tsx has one "Returns" row; labels read "Returns". The wall's Return contact card opens Returns in Contact (`vends=contact`) and the Returns card in Placement (default-tiles.ts, seasonCard). Old saved rows with `returnContact` validate to Returns in Contact (saved-views-logic.ts, saved-views-band.tsx); new saves write `returnPlacement` + ends. MCP and Ask links untouched. Specs: wall-summary, viz-url, saved-views-logic, player-season-viz, viz-all-zones(+browser), viz-rally-placement (+harness), viz-lightbox-browser.
**follow-ups:**

1. Nothing on screen says Contact yet (title and subtitle read "Returns" in both views); T9's switch is the only way in besides cards and links.
2. T8: compute with `drawnCut`, read the view with `courtEndsFor(state.cut, filters)`; `useVizView().cut` and `SeasonLightboxData.cut` are now the drawn cut. Extend `drawnCut`/the court for Both on Returns.
3. T9: write `withCourtEnds(filters, state.cut, ends)` with the chart cut, not the drawn cut.
4. Tidy `defaultCourtEnds("returnContact")` (still "placement"; unreachable after normalisation) and `parseFilters` re-reading `params.get("cut")`.
5. The save-view dialog reads "Returns · Scatter · …" in both views — name the view once the switch exists.

## T8 · Draw contact–landing pairs on every chart — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Rally, Errors and Returns landings now carry `VizDot.pair` (viz-model.ts); the season payload already shipped it. `LightboxCourt` takes `ends`; `markEnds`/`marksDrawn` decide which ends each mark draws (Placement landings, Contact rings, Both both) and the Approaches pair path became the general one. Landing = solid dot; contact = ring with a white middle (CONTACT_RING_FILL 0.88, stroke in the outcome colour — red on Errors). Hover/select links a pair with PAIR_LINK_STROKE (dashed 4 3, 1.5px non-scaling) and fades others per end: UNSELECTED_OPACITY 0.4, UNSELECTED_CONTACT_OPACITY 0.6. Shots without contact draw their landing only (skipped in Contact, kept in Points list). `CourtEndLabels` (was ApproachApronLabels) prints PLACEMENT/CONTACT where contact marks are drawn. A placement chart showing contact opens on the whole-length frame. Specs: viz-approach-lightbox-browser (+harness `?ends=`), viz-errors, viz-model, viz-rally-placement. Widget-states: SVG marks only.
**follow-ups:**

1. Author to confirm: Approaches' contact marks are now rings and hover fades others; Returns-in-Contact and "Rally position" contact courts also draw rings; ring stroke follows outcome colour (green rings on won points outside Errors).
2. Rally shots in Contact stays on the placement court (bands and Statistics stay landing-based); mapping it to `rallyPosition` like Returns is one line in `drawnCut` + its spec.
3. T9: "Rally position" resolves to Placement by default though it's a contact court — hide the switch there or merge it into Rally shots; Heat and Zones ignore the view, so hide/disable the switch off Scatter; "Contact recorded for X of Y" = count of `dot.pair`; toggling re-seeds pan/zoom.
4. T10: pairs still get the "Contact"/"Placement" first line and apron-side card; contact-only marks have no part line; `ReadoutGlyph` is solid even for a ring; "Contact not recorded" copy unwritten.
5. Wall and saved-view cards still draw landings only.
6. A `court-options.spec.ts:94` ESM import failure appeared in the implementer's partial run but not in the gate — watch for flake.

## T9 · Add the view switch and missing-contact copy — done

**gate:** mechanical GATE FAIL (design-drift: lower-case middot segment in the three tooltip strings) → fixed in the same run → GATE PASS · completion VERDICT: pass (re-judged after the fix)
**changed:** `CourtEndsSwitch` in viz-lightbox-shell.tsx: a "Court view" radio group of three 28px court-glyph buttons (Placement, Contact, Both) in the zoom card, before the zoom group behind a hairline; arrow keys move the choice; presses call `withCourtEnds` on the chart cut (viz-lightbox.tsx, season-viz-lightbox.tsx) in place, keeping focus. Shown only on Scatter for Errors, Returns, Rally shots and Approaches. A press on an open saved view edits it like a filter (`view` → `vfrom`); lightbox Clear keeps the current ends. "Contact recorded for X of Y" (11px ink-500, in the legend row's notes group) only when a contact-drawing view has marks without contact. `buildMarkReadout` adds "Contact not recorded". Harness `?fixture=nocontact`. DEVIATION (recorded): the tooltips are the DS two-part tooltip — "Placement" / "Where it landed", "Contact" / "Where it was hit", "Both" / "Where it was hit and where it landed" — instead of the criterion's literal middot strings, which the design-drift rule rejects; content and the approved board's drawing match.
**follow-ups:**

1. T10: fold "Contact not recorded" (`data-viz-readout-contact`) into the "Hit from …" row; keep `MarkReadout.contact`.
2. Returns in Contact draws the separate contact cut, so a return without contact is absent there and the X-of-Y note can't count it.
3. Arrow keys on the season page fetch a new court per press — debounce if it feels laggy.
4. The harness has no error fixture, so the Errors switch spec runs on an empty court.
5. Season spec title typo "writes vends in place".

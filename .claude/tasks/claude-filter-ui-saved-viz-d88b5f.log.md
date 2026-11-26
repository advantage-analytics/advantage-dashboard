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

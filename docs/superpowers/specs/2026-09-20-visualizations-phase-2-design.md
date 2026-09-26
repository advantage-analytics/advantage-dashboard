# Visualizations tab — Phase 2: the fullscreen viewer (F4b handoff)

## Context

Phase 1 → 1.4 of the Visualizations tab is committed on `claude/visualizations-tab-design-aefa43`
(HEAD `3cfb34e6`, suite 2293 green, nothing pushed). The user has now drawn Phase 2 on its own
canvas, `F4b - Handoff - Visualizations - Phase 2.dc.html` (project `afde9116…`), frames **P2a–P2q**:
the door glyph, a fullscreen pan/zoom court viewer with dark-slab chrome, dark menus, Save-view and
Filters on dark, Heat + Rally in the viewer, a workspace-wide depth/contact **band editor**, and the
**Units** preference that every distance readout follows.

How the frames were read: `DesignSync get_file` truncates at 256 KiB (mid-P2i), so P2a–P2h come from
real markup and P2i–P2q from the rendered canvas in Chrome plus `design_handoff_visualizations/README.md`.
The full extraction is in the session scratchpad (`f4b-report.md`); the numbers that matter are below.

**User decisions this round (do not re-infer):**

1. Team workspaces: **only owner/coach/staff may change bands**; players see them read-only. Personal: always yours.
2. Tile glyph **is a real button** → opens that view straight in fullscreen. Tile click still focuses.
3. Contact-band defaults are **today's stats card**, not the design's: dividers at the baseline (0) and 5 ft
   behind — rows "Inside the baseline / 0–5 ft behind / 5 ft+ behind". (The user first picked the design's
   1.5 ft / 2 ft, then reversed it.) With no custom bands saved, the Return contact numbers must not move.

Carried decisions still bind: result string is the in/out authority; never select shots by `shot_number`
(SQL included); `serve-zones.ts` is shared and not edited; net balls = grey Miss at the net (`atNet`);
Heat stays the shipped **density-blob** heat (Phase 1.2 superseded P2i/P2j's binned cells — the rendered
P2i/P2j frames are themselves blurred blobs, so this matches); attribution resolved once via `useMatchSides()`.

Standing constraints: branch/PR target `splitstep-integration`; **live-DB changes need the user's explicit
go-ahead** (this plan has two — flagged below); no credentials entered by me; repo is public.

All paths are under `src/components/dashboard/matches/match-detail/shots/` unless noted.

---

## Shape of the work — three stages, each shippable on its own

| Stage           | Frames       | What ships                                                                                                      | DB                |
| --------------- | ------------ | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| **2A — Viewer** | P2a–P2j      | door, portal viewer, pan/zoom, slabs, dark menus, dark filters, dark save dialog, readout, heat/rally in viewer | none              |
| **2B — Bands**  | P2k–P2p      | workspace band settings, overlay, menu, editor (depth + contact), receipt; in-shell stats card follows bands    | new table (live)  |
| **2C — Units**  | P1i/P1j, P2q | `preferences.unit`, Settings row, `formatDistance`, every readout follows                                       | new column (live) |

2B renders in feet until 2C lands; `formatDistance(unit, ft)` is introduced in 2B with `unit` hard-wired
to `"ft"` so 2C is a one-line switch, not a sweep.

---

## Stage 2A — the viewer

### A1. URL: `fullscreen=1` — `viz-url.ts`

Add `fullscreen?: boolean` to `VizState` exactly as `draft` was added (omitted when false — the
`toEqual` fixtures depend on omit-not-false): add to `VIZ_KEYS`, parse only when `cut !== null`,
serialize after the `cut === null` early return. `applyVizUpdate` does **not** clear it (a filter change
inside the viewer must not eject you). Keep it **out of `viewIdentityKey`** — otherwise entering
fullscreen counts as a court change and steals focus/scroll. `draft` and `fullscreen` are mutually
exclusive (draft wins; a blank court has nothing to view). Specs in `tests/viz-url.spec.ts`.

### A2. The door — `viz-focused.tsx`, `court-tile.tsx`

- Focused court: 28×28, `top/right 12`, `rounded-[8px]` (radius-element), `rgba(13,13,13,.72)` → `.92`
  hover, `maximize-2` 13px stroke 1.6, `aria-label="Open {view} fullscreen"`, dark tooltip
  **"Fullscreen · F"** via the existing `ChromeTooltip` (`shared/chrome-tooltip.tsx`, `shortcut` prop).
  **F** on the focused view (ignored in form controls / when an overlay is open) does the same.
- Tiles: 24×24, `top/right 10`, icon 12px — a real `<button>` (decision 2) calling
  `setState({...tileState, fullscreen: true})`. Known trap (memory): a control inside a `<Link>` tile
  can't be rescued with `preventDefault`. `CourtTile` already has `as="static"`; add an `actionSlot`
  rendered as a **sibling** of the link inside the positioned card wrapper (not a child of the anchor),
  so default tiles stay `<Link>`s and the glyph sits above them. Not shown in Manage mode (the ⋯ owns that corner) or on the Create-view tile.

### A3. Viewer court geometry — `court-geometry.ts` (pure, spec'd first)

New `VIEWER_COURT`: `viewBox "93 -30 334 532"`, art layer 595×948. Same coordinate system as
`SERVE_COURT` extended to both halves: doubles `135,14 250×444`, singles `166.25…353.75`, baselines
`y=14` / `y=458`, service lines `116.5` / `355.5`, centre line `260`, centre marks, net `122→398 @ y=236`
stroke 3, lines 1.6. New `projectViewerDot(cut, dot)` from the metres `VizDot` already carries
(`lateralM`, `depthM`, `atNet`):

- **serve / returnPlacement** — landing, far half (top): reuse `SERVE_DEPTH/LATERAL_UNITS_PER_METER`; `atNet` → `y=236` at true lateral.
- **returnContact / rallyPosition** — hitter's contact, near half (bottom, baseline `y=458`), behind-baseline dots fall in the apron (`458…502`), clamped to the viewBox (this is also the clamp `task_906097a4` asks for).
- Lateral sign per cut must match the in-shell frames — assert with the same fixtures `tests/court-geometry.spec.ts` already uses for `projectReturnDot`.
  Also `viewerInitialTransform(cut)`: fit-to-stage for landing cuts; for contact/rally ~1.6× with the near baseline ≈500px into the frame (P2o) — and **Fit resets to that**, not to 1×.

### A4. Pan/zoom — new `use-pan-zoom.ts` (pure reducer + thin hook)

`{z, px, py}`; zoom clamp **0.55–3.2**; wheel `×1.12` about the cursor; buttons `×1.2` about stage
centre; pan clamped so the art never leaves the stage; arrows pan 40px; `0` fits; `+/−` zoom. Pointer
events (not HTML5 DnD), `touch-action:none`, `cursor: grab/grabbing`; any `[data-chrome]` ancestor
stops the gesture. Session state only — never URL. Reducer fully unit-tested (`tests/viz-pan-zoom.spec.ts`).

### A5. The viewer shell — new `viz-fullscreen.tsx` (+ `viz-fullscreen-court.tsx`)

Precedent `film/film-fullscreen.tsx`: `createPortal(document.body)`, `fixed inset-0 z-50`, `role="region"`
`aria-label`, body scroll lock, focus the root on mount, **restore focus to the door on exit**, one window
`keydown` listener that bails on form controls and when `overlayIsOpen()` (lift that helper to a shared
module rather than copy it). `dynamic(..., {ssr:false})`, mounted by `shots-tab.tsx` when
`state.fullscreen && state.cut`. Background `#86AC91` (heat charts: `#9FB3A5` / `#9DB4CE`, the constants
`court-art.tsx` already exports as `HEAT_APRON_FILL` etc.).

- Court layer: `transform: translate() scale()`, `transform-origin:0 0`; `vector-effect: non-scaling-stroke`
  on lines and marks; marks r 2.2 / 0.5px black; miss `#C9CBCE`; shapes reuse `trianglePointsFor` / `starPoints`.
  Serve cut: highlighted-box, WIDE/BODY/T + DEUCE/AD labels and per-zone `% / n` from `VizResult.zoneStats`.
  Heat: reuse `court-art.tsx`'s blob filter pipeline — extract the shared `<HeatLayer>` rather than fork it.
- **Scoreboard slab** top-left `14/18`: `rgba(13,13,13,.74)` blur 8, radius 12, min-w 236, pad `14 15 12`;
  Final + mono clock; two rows (you = 500 white + 6px blue dot, sets won white / lost 42%); hairline `.14`;
  22px initials + cut name + mono count (`188 pts` / `93 returns` / `412 balls`). Data from `useMatchData()`.
- **Top-right**: filter-summary pill 26px (`First serves · 96`) = the Filters trigger; 28px X, tooltip "Exit fullscreen · Esc".
- **Bottom slab** 48px, inset `20/16`, `.72` blur 8, inside the column wrapper (P2b variant): cut/view
  menu · chart menu · divider · tokens (removable; read-only when an unedited saved view is loaded) ·
  `stripSlot` (bands, 2B) · flex · legend (`legendItemsFor`, or the Fewer→More ramp on heat) · divider ·
  − · mono **38px-wide** % · + · fit ("Fit the court", `maximize` 14px).
- **Readout** = `match-detail/chart-tooltip.tsx` (`DARK_READOUT_*`), anchored to the mark inside the pan
  layer, hidden while panning, hover + keyboard focus. `VizDot` gains an optional `meta`
  (`pointId, setNumber, pointScore, wonBySubject, shotType, result, speed?`) filled in `computeViz`;
  lines are built only from fields that exist — **no fabricated speed**; unmeasured parts are omitted.
  Serve **heat** hover reads per zone: "Down the T · deuce / 23 of 76 serves landed here / 30% of serves · 78% won".
- Exit (Esc / X) → `setState({fullscreen: undefined})`, keeping whatever cut/chart/filters were set inside.

### A6. Dark tone — one implementation, two surfaces

`ui/float-menu.tsx`: add `tone?: "light" | "dark"` to `FloatMenu`, `FloatMenuItem`, `FloatMenuNote`,
`FloatMenuDivider` (+ a `FloatMenuLabel`), dark = `rgba(13,13,13,.88)` blur 10, 1px `white/10`, radius 10,
inset 5, rows hover/chosen `white/8`, blue check, second line 50%, note 45%. Then **fold
`film/film-dark-menu.tsx` into it** (the handoff says so explicitly) — its exports become thin re-exports or
are replaced at their call sites; verify the film room still renders. Thread `tone` + `side="top"` through
`CutMenu`, `ChartMenu`, `VizMenuTrigger`, `AppliedStrip`, `FiltersPopover`, `SaveViewDialog` — no forks.

- View menu (P2e, 312px): trigger shows the loaded view's name + `bookmark`; any edit afterwards keeps
  the name and drops the bookmark ("based on") — derive from `state.viewId` + `sameView()`.
- Save dialog (P2f/P2g, 332px, anchored above the slab): existing logic untouched; **validate on blur and
  on Save, never per keystroke**; duplicate copy with curly quotes; Save `aria-disabled` at 45%.
- Filters (P2h, 400px under the pill): pills `white/18` → active `white/55` border + `white/14` fill.
  Literals are rgba (not hex) and sizes stay on the type scale, so `check-design-drift` seeds don't move.

---

## Stage 2B — depth and contact bands

### B1. Data — **live-DB change, needs the user's go-ahead before applying**

New table `viz_band_settings` keyed like `saved_views` (`account_id` = `Workspace.id`, PK):
`depth_scheme text check in ('none','thirds','deepMidShort','inside','custom')` default `'thirds'`,
`depth_dividers_ft numeric[2]`, `contact_dividers_ft numeric[2]` default `{0, 5}` (decision 3), `updated_by`, `updated_at`.
Checks: ascending, within `0…39` (depth) / `-39…20` (contact). RLS: select = self or any program member
(`user_program_role`); insert/update = self **or `is_program_staff(account_id)`** (decision 1). No row = defaults.
Migration file + `tests/viz-bands-rls.spec.ts` (owner/coach/staff write, player read-only, stranger nothing).
`rls-boundary-reviewer` runs on this diff.

### B2. Pure logic — new `src/lib/data/viz-bands.ts`

`BandSettings`, `DEFAULT_BANDS`, `resolveDepthDividersFt(scheme, custom)` (thirds `13/26`, deepMidShort
`10/24`, inside = one divider at the baseline, none = `[]`), `bandIndexFor(valueFt, dividers)`,
`snap(valueFt, unit)` (half-foot / half-metre), `clampDividers` (min gap = 26 screen px → ft at current
scale, baseline→net), `bandsDirty(a,b)`, `bandRangeLabel`, `contactReadout` ("2.5 ft inside" · "at the
line" · "3 ft behind"). Depth bands measure **from the baseline** (DEEP = 0–N ft), so convert from
`VizDot.depthM` (from the net) once, here. Spec `tests/viz-bands.spec.ts`.

### B3. Stats follow the bands — `viz-model.ts`

`computeVizStats` takes `bands`; `depthKeyPlacement` and `contactDepthKey` stop using `DEPTH_THIRD_M` /
`FIVE_FEET_M` and bucket via `bandIndexFor`. Row labels come from `bandRangeLabel` / the contact labels
(default dividers `0 / 5 ft` render exactly today's "Inside the baseline / 0–5 ft behind / 5 ft+ behind" —
decision 3; a regression spec pins the default-bands output to today's numbers; custom dividers generate
"N ft inside" / "N–M ft behind" style labels). "Every return chart follows it" includes the in-shell
stats card and wall tiles. `scheme: none` → the Depth group is omitted, not zeroed.

### B4. UI

- Overlay in the viewer (P2k/P2o): three translucent white bands across the half + 10px mono label and
  range left, `% · n` right. Trigger in the slab `stripSlot`: `move-vertical` + "Depth bands" / "Contact
  bands" + mono scheme (`THIRDS · DEEP·MID·SHORT · INSIDE · CUSTOM`). Only on return cuts.
- Menu (P2l): No bands · Thirds · Deep · mid · short · Inside the baseline · **Edit bands…** · note
  "Bands are yours — they change every return chart in this workspace, not this match." Preset applies
  instantly (optimistic, server action, `revalidateMatchReport`). Players: rows disabled + note swaps to
  who can change them.
- Editor (P2m/P2p), one component with `kind: "depth" | "contact"`: pan off, art 35%, banner, slab
  crossfades to `Depth bands CUSTOM | range summary … Reset to thirds · Cancel · Save bands`. Handles
  `role="slider"`, `aria-valuetext` = readout, drag or ↑↓ (2px, ⇧ 10px), snap, min gap, 1px → 2px while
  held, 22px hit area, chip follows the line. Save dead until `bandsDirty` vs the saved record; Esc/Cancel restores.
- Receipt (P2n): the filter pill slot becomes `role="status"` "Bands saved · every return chart in {workspace}" for 4s.
  Server action `saveBandSettings` next to `saved-views-actions.ts`, same `requireContext()` + RLS pattern;
  loaded in `page.tsx` beside `getSavedViews` and passed through `MatchReportProvider` meta.

---

## Stage 2C — Units

**Live-DB change, needs go-ahead:** `alter table user_preferences add column unit text not null default 'ft' check (unit in ('ft','m'))`.
`lib/data/preferences-server.ts` (`Preferences.unit`, `DEFAULT_PREFERENCES` in step with the column default),
`settings/preferences-actions.ts` (whole-row upsert already), `settings/preferences-form.tsx`: a `MenuSelect`
row — "Units" / "Court distances, ball speed and contact depth"; Feet "Distances read 12 ft, speeds in mph" ·
Metres "Distances read 3.5 m, speeds in km/h"; note "Applies to every chart and readout in your workspaces.
Scores and set counts never change." New `src/lib/format/distance.ts`: `formatDistance(unit, ft)`,
`formatSpeed(unit, mph)`, `toUnit/fromUnit`; bands stay **stored in feet**, snap to the half-metre when
`unit === "m"`, baseline→net reads 11.9 m. Unit reaches the viz via the match layout's existing preferences
fetch → provider; swap the 2B hard-wire. Never a per-chart toggle.

---

## Tests and gates

Pure Playwright specs (the only kind this repo has): `viz-url` (fullscreen), `court-geometry`
(`projectViewerDot`, initial transforms), new `viz-pan-zoom`, `viz-bands`, `format-distance`, `viz-model`
(bands-driven stats, `meta`), `float-menu` tone smoke, `viz-bands-rls` (live). Per task:
`npm run typecheck && npm run lint && npx playwright test <spec>`; per stage: full `npm test`,
`node scripts/check-design-drift.mjs`, `pipeline-guardrails-reviewer`, and the widget-states gate
(`mark` and `git commit` in **separate** shell calls).

## Verification (live, by me, not from reports)

Browser pane → the user's dev server on `:3000`, match `79f1fdb0-49bf-427d-a561-5e46a2b4d692`, 1440×900:

- door + **F** open the viewer; reload with `&fullscreen=1` lands in it; Esc/X returns to Focused with the viewer's cut/chart/filters; focus returns to the door.
- every cut × scatter/heat(/zones): mark count in the viewer equals the focused court's count; net marks sit on the net line; serve zone labels match the stats card.
- wheel/±/0/arrows; zoom readout never reflows the slab; marks don't fatten at 320%; pan can't lose the court.
- dark menus open upward; Save duplicate-name state; filters live-apply updates pill, tokens and count together.
- 2B: preset change moves the in-shell stats card and a wall tile too; editor drag + keyboard; Save dead until dirty; receipt; a second (player) account sees bands but can't change them — needs the user to sign that account in.
- 2C: flip Units in Settings → band labels, readouts, stats rows all change; scores don't.
- Film room still works after the dark-menu fold.
  Known blind spot: the pane is a hidden document, so pointer-drag feel and transitions can't be watched there — I'll drive drags via synthetic pointer events and say plainly what was not eyeballed.

## Execution

`superpowers:subagent-driven-development`, same branch, nothing pushed. Spec first
(`docs/superpowers/specs/2026-09-20-visualizations-phase-2-design.md`), then a task plan under
`docs/superpowers/plans/`, ledger at `.superpowers/sdd/<plan>/progress.md`. Sonnet implements, Opus reviews;
geometry/reducer/bands tasks are TDD with the spec written before the component. Stage order 2A → 2B → 2C;
I stop **only** before each live-DB apply to get the go-ahead. Branch integration
(now 69 ahead / 25 behind `origin/splitstep-integration`) stays the user's open decision and is not part of this plan.

---

## Appendix — frames P2i–P2q as rendered (read from the canvas in Chrome, 2026-09-20)

The markup for these frames is past DesignSync's 256 KiB cap; these notes are from the rendered frames
and their Handoff-notes cards.

- **P2i Heat** — full court, heat drawn as soft blue blobs over the two far service boxes on a white-ish
  wash; zone `% / n` sit under the net in the near half. Hover readout: "Down the T · deuce / 23 of 76
  serves landed here / 30% of serves · 78% won". Slab legend: "Fewer ▭▭▭▭ More". Chart trigger glyph `flame`.
- **P2j Rally position** — desaturated court (`#9FB3A5` / `#9DB4CE`), blobs in the near half, a ringed white
  "AVERAGE POSITION" marker, caption under the baseline "REID · RALLY BALLS 3+", scoreboard count "412 balls",
  legend "Fewer ▭▭▭▭▭▭ More balls struck". Chart trigger reads "Heatmap" with a grid glyph.
- **P2k Bands resting** — bands span wider than the doubles court (into the apron both sides); left label
  mono caps "DEEP · 0–12 FT", right "58% · 34". DEEP starts at the FAR baseline (0 ft = baseline).
  Slab: `move-vertical` "Depth bands" + mono "THIRDS" + chevron, after the tokens.
- **P2l Bands menu** — section label "Depth bands"; "No bands / Just the landing points, no shading";
  "Thirds / Equal thirds of the court, baseline to net" ✓ (check right-aligned); "Deep · mid · short /
  Coach default — 10 ft, 14 ft, then the rest"; "Inside the baseline / Two bands, split where the court
  ends"; blue `move-vertical` "Edit bands…"; note "Bands are yours — they change every return chart in
  this workspace, not this match." Picking a preset applies instantly, workspace-wide.
- **P2m Editor** — banner top-right under the pill row: blue `move-vertical` + "Editing depth bands — drag
  a divider, or focus one and use ↑↓." + 60% "Esc cancels."; filter pill reads "Editing bands". Dividers
  are blue 1px lines with a white square handle (blue border) at the left end and a blue chip ("12 ft") at
  the right end; band labels become "DEEP 0–12 ft" (caps name + lower-case range). Marks dim. Slab:
  "Depth bands" mono "CUSTOM" | mono "0–12 · 12–24 · 24–39 ft" … Reset to thirds · Cancel · Save bands.
- **P2n Receipt** — pill slot: `move-vertical` "Bands saved · every return chart in Meridian State", 4s,
  `role="status"`, then the filter summary returns. No toast, no green tick.
- **P2o Contact resting** — cropped ~1.6× to the near baseline; bands "INSIDE …", "ON BASELINE …",
  "BEHIND …" with `% · n` right. (Default dividers here are the user's decision 3 — 0 and 5 ft — not the
  frame's 1.5 / 2.)
- **P2p Contact editor** — same editor, `kind="contact"`; banner "Editing contact bands — drag a line, or
  focus one and use ↑↓. Esc cancels."; chips "1.5 ft inside" / "2 ft behind"; "at the line" at zero.
- **P2q Metres** — "DEEP 0–3.5 m", chips "3.5 m" / "7.5 m", "SHORT 7.5–11.9 m". Snap = half-metre. Never a per-chart toggle.

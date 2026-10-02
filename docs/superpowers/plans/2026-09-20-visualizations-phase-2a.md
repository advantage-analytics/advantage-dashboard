# Visualizations Phase 2A — Fullscreen Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A fullscreen pan/zoom court viewer opened from the focused court and from every tile, with dark-slab chrome, dark menus, dark filters, dark save dialog and a point readout (frames P2a–P2j).

**Architecture:** `fullscreen=1` is one more key in the existing URL-bound `VizState`. The viewer is a `document.body` portal (precedent `film/film-fullscreen.tsx`) that renders the SAME `computeViz` result on a new full-court frame, with a pure pan/zoom reducer. Dark chrome is a `tone` prop on the existing menu/popover components — never a second implementation.

**Tech Stack:** Next.js 16 App Router, React 19.1, Tailwind v4, Radix Popover (via `ui/float-menu.tsx`), Playwright pure-logic specs.

**Spec:** `docs/superpowers/specs/2026-09-20-visualizations-phase-2-design.md` (Stage 2A + Appendix). Frame markup numbers: `.superpowers/sdd/2026-09-20-visualizations-phase-2a/f4b-report.md` (git-ignored; read the section for your frame).

## Global Constraints

- Work only on branch `claude/visualizations-tab-design-aefa43`; never push; never touch `main`.
- Read `docs/ui-revamp-guardrails.md` and `.skills/advantage-analytics-design/SKILL.md` before UI work. Attribution §4: "you" is resolved once via `useMatchSides()`; below that everything takes `subjectIsPlayer1`.
- `src/lib/data/serve-zones.ts` is shared with three other surfaces — DO NOT EDIT IT.
- Never select shots by `shot_number`; use `src/lib/data/serve-return-shots.ts` role helpers.
- A shot's `result` string is the in/out authority; coordinates only say where to draw. `atNet` dots draw on the net line.
- Tokens only (`var(--*)`); allowed chart literals: `#86AC91`, `#6092CE`, `#9FB3A5`, `#9DB4CE`, `#C9CBCE`, and `rgba(13,13,13,…)` / `rgba(255,255,255,…)` slabs. No new off-scale `text-[Npx]`: `node scripts/check-design-drift.mjs` must stay at its seeds.
- Buttons `rounded-[6px]`; `rounded-full` only pills/avatars; radius-element = 8px; menus 10px; float 12px.
- Every dropdown is `ui/float-menu.tsx`; no native `<select>`. Motion 200ms `--ease-primary`; reduced motion keeps opacity, drops transforms.
- Pan/zoom and open menus are session state, NEVER URL state.
- Unmeasured values are omitted or `—`, never `0` and never invented (no fabricated serve speed).
- Turbopack drops a CSS rule block containing unicode — keep CSS ASCII.
- Per task: `npm run typecheck && npm run lint && npx playwright test <your specs>` must pass. Commit with `.claude/hooks/widget-states-gate.sh mark` in ITS OWN shell call, then `git add`, then `git commit` — each a separate command (a chained `mark && git commit` is denied).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

All component paths are under `src/components/dashboard/matches/match-detail/shots/` unless noted.

---

### Task 1: `fullscreen` URL key and the pan/zoom reducer

**Files:**

- Modify: `viz-url.ts`
- Create: `pan-zoom.ts` (pure, no React)
- Test: `tests/viz-url.spec.ts`, create `tests/viz-pan-zoom.spec.ts`

**Interfaces — Produces:**

- `VizState.fullscreen?: boolean` (omitted when false — follow exactly how `draft` is handled, including the omit-not-`false` convention the `toEqual` fixtures rely on).
- `pan-zoom.ts`:
  ```ts
  export interface PanZoom {
    z: number;
    px: number;
    py: number;
  }
  export interface Size {
    w: number;
    h: number;
  }
  export const ZOOM_MIN = 0.55;
  export const ZOOM_MAX = 3.2;
  export const WHEEL_STEP = 1.12;
  export const BUTTON_STEP = 1.2;
  export const KEY_PAN_PX = 40;
  export function clampPan(t: PanZoom, art: Size, stage: Size): PanZoom;
  export function zoomAbout(
    t: PanZoom,
    factor: number,
    anchor: { x: number; y: number },
    art: Size,
    stage: Size,
  ): PanZoom;
  export function panBy(
    t: PanZoom,
    dx: number,
    dy: number,
    art: Size,
    stage: Size,
  ): PanZoom;
  export function zoomPercentLabel(z: number): string; // "100%"
  ```

**Rules:**

- `fullscreen`: add to `VIZ_KEYS`; parse `fullscreen=1` only when `cut !== null` AND `draft` is not set (draft wins); serialize after the `cut === null` early return, deterministic position. `applyVizUpdate` must NOT clear it on a filter/cut/chart change, but setting `cut: null` (back to wall) drops it. It is NOT part of `viewIdentityKey` and `sameView` ignores it.
- `zoomAbout`: new z = clamp(z·factor); the art point under `anchor` (stage coords) stays under it; then `clampPan`.
- `clampPan`: scaled art (`art.w·z × art.h·z`). On an axis where the scaled art is smaller than the stage, the art may move only within the stage (never past an edge); where it is larger, the stage may never show past the art's edge by more than half the stage (so the court can't be lost). Write the exact rule in a doc comment and test both regimes.

- [ ] Write failing specs: fullscreen parse/serialize/round-trip, draft-wins, survives `applyVizUpdate({filters})`, dropped by `cut:null`, excluded from `viewIdentityKey`; pan-zoom clamp at both limits, anchor invariance (the art point under the cursor is unchanged to 1e-6), both clamp regimes, `zoomPercentLabel(2.2) === "220%"`.
- [ ] Run them, see them fail. Implement. Run `npx playwright test tests/viz-url.spec.ts tests/viz-pan-zoom.spec.ts` → pass.
- [ ] typecheck + lint, commit `feat(viz): fullscreen URL key and pan/zoom reducer`.

---

### Task 2: Viewer court frame, projection, and point metadata

**Files:**

- Modify: `court-geometry.ts`, `viz-model.ts`
- Test: `tests/court-geometry.spec.ts`, `tests/viz-model.spec.ts`

**Interfaces — Produces:**

```ts
// court-geometry.ts
export const VIEWER_COURT = {
  viewBox: { minX: 93, minY: -30, w: 334, h: 532 },
  artPx: { w: 595, h: 948 },
  doubles: { x: 135, y: 14, w: 250, h: 444 },
  singlesLeft: 166.25,
  singlesRight: 353.75,
  farBaselineY: 14,
  nearBaselineY: 458,
  farServiceY: 116.5,
  nearServiceY: 355.5,
  centreX: 260,
  netY: 236,
  netX1: 122,
  netX2: 398,
  lineWidth: 1.6,
  netWidth: 3,
  markRadius: 2.2,
  markStroke: 0.5,
} as const;
export function projectViewerDot(
  cut: Cut,
  dot: Pick<VizDot, "lateralM" | "depthM" | "atNet">,
): { x: number; y: number };
export function viewerInitialTransform(
  cut: Cut,
  stage: { w: number; h: number },
): { z: number; px: number; py: number };
// viz-model.ts
export interface VizDotMeta {
  pointId: string;
  setNumber: number;
  pointScore: string | null;
  gameScore: string | null;
  wonBySubject: boolean;
  shotType: string | null;
  result: string | null;
  speedMph: number | null;
}
// VizDot gains: meta?: VizDotMeta
```

**Rules:**

- Read how `projectServeMetricDot` and `projectReturnDot` interpret `lateralM`/`depthM` for each cut FIRST; `projectViewerDot` must agree with them on sign and origin. serve/returnPlacement are landings → FAR half (y from `netY` 236 up to `farBaselineY` 14 and beyond into the apron); `atNet` → `y = netY` at true lateral. returnContact/rallyPosition are the hitter's contact → NEAR half (net 236 down to `nearBaselineY` 458, behind-baseline into 458…502). Use `SERVE_DEPTH_UNITS_PER_METER` / `SERVE_LATERAL_UNITS_PER_METER` (the viewer shares the serve frame's scale). Clamp every result inside the viewBox by `markRadius`.
- Mirror invariant to test: for each cut, a dot the in-shell frame draws left-of-centre must be left-of-centre in the viewer unless the in-shell frame's own CSS `rotate(180deg)` inverts it — document which and why in the doc comment, and pin it with fixtures taken from the existing `court-geometry.spec.ts` cases.
- `viewerInitialTransform`: landing cuts → fit the 595×948 art inside the stage, centred. Contact/rally cuts → z ≈ 1.6× the fit scale with `nearBaselineY` placed ≈ 500/950 of the stage height, horizontally centred, then clamped with Task 1's `clampPan` (import from `./pan-zoom`).
- `meta`: fill in `computeViz` for every dot from the `MatchPoint` / shot already in hand. `speedMph` only if the shot row actually carries a speed field — check `MatchShot` in `src/lib/data/match-points-server.ts`; if it doesn't, set `null` and do NOT add a query. `wonBySubject` derives from `subjectIsPlayer1` (guardrail §4), never from "player1".

- [ ] Failing specs first (geometry fixtures for all four cuts incl. `atNet`, apron, clamp, initial transforms; `meta` present and attribution-correct for both subjects). Implement. Pass.
- [ ] typecheck + lint, commit `feat(viz): viewer court frame, projection and dot metadata`.

---

### Task 3: Dark tone — one menu implementation, two surfaces

**Files:**

- Modify: `src/components/ui/float-menu.tsx`, `src/components/dashboard/matches/match-detail/film/film-dark-menu.tsx` (+ its call sites), `cut-menu.tsx`, `chart-menu.tsx`, `viz-labels.tsx` (`VizMenuTrigger`), `applied-strip.tsx`, `filters-popover.tsx`, `save-view-dialog.tsx`, `viz-toolbar.tsx`
- Test: `tests/float-menu-selected-option.spec.ts` (extend) or a new `tests/float-menu-tone.spec.ts`

**Interfaces — Produces:** every component above accepts `tone?: "light" | "dark"` (default `"light"`, zero visual change on light) and, where it opens a surface, `side?: "top" | "bottom"` (default `"bottom"`). `FloatMenu` gains `tone`, `side`; new `FloatMenuLabel`. `CutMenu` gains `width?: number` (viewer uses 312) and shows the loaded saved view's name + `bookmark` glyph when `state.viewId` is set and the current state still `sameView`s that saved view; name without the bookmark once edited.

**Dark values (f4b-report P2d/P2e/P2f/P2g/P2h):** surface `rgba(13,13,13,.88)` (dialogs/popover `.9`), `backdrop-filter: blur(10px)`, 1px `rgba(255,255,255,.1)`, radius 10, inset 5, `--shadow-dropdown`; rows `padding 7px 9px`, radius 7, hover/chosen `rgba(255,255,255,.08)`, title 12px white, second line 11px 50% white, check `var(--blue)` 12px; divider `rgba(255,255,255,.12)`; note 11px 45% white; section label 11px 50% white. Triggers 28px `rgba(255,255,255,.1)` → `.18` (open: `.18` + `chevron-up`), icon 13px 70% white, label 12/500 white. Tokens 24px `rgba(255,255,255,.1)`, X 55% → white; `readOnly` variant has no X. Filter pills 26px: 1px `rgba(255,255,255,.18)`, 11px 80% white → active `.55` border + `.14` fill + white 500. Save dialog 332px pad 14 gap 12: field 32px `rgba(255,255,255,.08)` 1px `var(--blue)` focused / `var(--error)` invalid; "Saves" well `rgba(255,255,255,.06)` radius 8 (78% / 45% lines); Cancel text button; Save 32px blue, `aria-disabled` + 45% when dead.

**Rules:**

- Fold `film-dark-menu.tsx` into the tone: keep its exported names as thin wrappers over `FloatMenu tone="dark"` so film call sites don't churn, and delete its hand-built row markup. The film room's menus must look the same or closer to the spec values above — report any visible delta.
- Save dialog validation: duplicate check runs on blur and on Save, never per keystroke (if it currently runs per keystroke, change it for both tones). Dark copy uses curly quotes: `You already have a view called “{name}”. Pick another name, or open that one from the menu.` Add the "Saves" well to the dark tone only if the light dialog doesn't have one — read the light dialog first and keep its existing content.
- No hex literals; rgba only. Light tone renders byte-for-byte the same classes as before.

- [ ] Spec: render-free assertions aren't possible here — write a small pure helper `floatMenuToneClasses(tone)` in `float-menu.tsx` and test it returns the light classes unchanged and the dark set; plus the `cut-menu` "loaded view label" logic extracted as a pure function `loadedViewLabel(state, savedViews)` with tests (named view + bookmark / edited → name, no bookmark / none → cut label).
- [ ] Implement, typecheck, lint, `node scripts/check-design-drift.mjs`, commit `feat(ui): dark tone for FloatMenu and the viz controls`.

---

### Task 4: The viewer

**Files:**

- Create: `viz-fullscreen.tsx` (shell, keys, slabs), `viz-fullscreen-court.tsx` (SVG court + marks + readout), `use-pan-zoom.ts` (hook over Task 1's reducer)
- Create: `src/lib/ui/overlay-is-open.ts` (lift `overlayIsOpen()` out of `film/film-fullscreen.tsx`; film imports it)
- Modify: `shots-tab.tsx` (mount), `court-art.tsx` (extract the heat blob pipeline into an exported `HeatLayer` that both courts use — no fork)
- Test: `tests/viz-readout.spec.ts` for the pure readout builder

**Consumes:** Task 1 (`fullscreen`, pan-zoom), Task 2 (`VIEWER_COURT`, `projectViewerDot`, `viewerInitialTransform`, `VizDot.meta`), Task 3 (`tone="dark"`, `side="top"`).

**Rules (numbers: f4b-report P2b/P2c, spec A5 + Appendix P2i/P2j):**

- Read `film/film-fullscreen.tsx` first and follow it: `createPortal(document.body)`, `fixed inset-0 z-50 overflow-clip outline-none`, `role="region"` `aria-label="{cut label} fullscreen"`, `tabIndex={-1}`, save/restore `document.body.style.overflow`, focus root on mount. `dynamic(() => import(...), { ssr:false })` from `shots-tab.tsx`, rendered when `state.fullscreen && state.cut`. The focused view stays mounted underneath.
- Reuse the focused view's data path: the same `computeViz(points, cut, filters, subjectIsPlayer1)` call and the same `legendItemsFor`. Do not recompute differently — the viewer's mark count must equal the focused court's.
- Stage background `#86AC91`; on `chart === "heat"` the desaturated pair `#9FB3A5` / `#9DB4CE`. Court drawn from `VIEWER_COURT`; all lines/marks `vectorEffect="non-scaling-stroke"`. Marks: circle r 2.2 / triangle (`trianglePointsFor`) / star (`starPoints`), stroke `#000` 0.5, fills `var(--viz-good)` / `var(--viz-bad)` / `#C9CBCE`. Serve cut: service-box labels WIDE·BODY·T ×2, DEUCE COURT / AD COURT, and per-zone `% / n` from `VizResult.zoneStats` (the "points won" rate the stats card shows). Zones chart in the viewer = those labels with marks hidden.
- Pan layer `position:absolute; width:595px; height:948px; transform-origin:0 0; transform: translate(px,py) scale(z)`. Pointer events with `setPointerCapture`; ignore gestures starting inside `[data-chrome]`; `cursor-grab` / `active:cursor-grabbing`; `touch-action:none`. Wheel ×1.12 about the cursor (non-passive listener, `preventDefault`). Initial + Fit = `viewerInitialTransform(cut, stage)`; re-fit when the cut changes or the stage resizes.
- Keys (one window listener; bail on form controls and when `overlayIsOpen()`): `Escape` exit · `+`/`=` and `-` zoom about centre · `0` fit · arrows pan 40px.
- Exit = `setState({ fullscreen: undefined })` (cut/chart/filters kept) and focus returns to the element with `data-viz-fullscreen-door` if present.
- Slabs carry `data-chrome`. Scoreboard top-left; pill + X top-right; bottom slab per spec. Scoreboard data from `useMatchData()` / `useMatchSides()` — subject first with the 6px blue dot, set digits won = white / lost = 42% white; clock from match duration, omitted if unknown. Count noun: serve "N pts"→ use `VizResult.count` + noun (`serves`/`returns`/`shots`).
- Filter-summary pill text: the first active filter's label (or "All {noun}") + `·` + count; it is the `FiltersPopover` trigger (`tone="dark"`, opens below, right-aligned).
- Readout: pure `buildReadout(dot.meta, names, cut)` → `{ title, lines: string[] }`, e.g. title "Reid won the point" / "Reid lost the point"; line 1 from shotType/result ("Ace", "Out", "Into the net", "Forehand return"…) — only what the data says; line 2 mono `Set 3 · 40-15 · 118 mph`, each part omitted when missing. Rendered with `DARK_READOUT_CLASS/STYLE` from `match-detail/chart-tooltip.tsx`, positioned inside the pan layer at the mark, counter-scaled by `1/z` so the text never zooms, hidden while panning. Hovered mark: r 2.4, white 0.8 stroke + halo r 5.6 white 0.7 @ .55. Marks are focusable (`tabIndex=0`, `role="img"`, `aria-label` = title) so the readout is keyboard reachable.
- Widget states: no data → the same honest empty message the focused court uses, centred on the stage, chrome still usable (so filters can be cleared). No spinner.

- [ ] `tests/viz-readout.spec.ts` first (won/lost by subject for both sides, omitted parts, no "undefined"/"null"/"0 mph" ever in output). Implement. typecheck, lint, drift, commit `feat(viz): fullscreen court viewer`.

---

### Task 5: The door — focused glyph, tile glyph, F key

**Files:**

- Modify: `viz-focused.tsx`, `court-tile.tsx`, `viz-wall.tsx`, `saved-views-band.tsx`, `default-tiles.ts` (only if a tile needs to expose its state)
- Test: extend `tests/viz-url.spec.ts` if a new pure helper appears (`fullscreenHrefFor`)

**Rules (f4b-report P2a):**

- Focused court art: a `<button data-viz-fullscreen-door>` 28×28, `absolute top-3 right-3`, `rounded-[8px]`, `bg-[rgba(13,13,13,0.72)] hover:bg-[rgba(13,13,13,0.92)]`, white `Maximize2` 13px stroke 1.6, `aria-label="Open {view name} fullscreen"`, wrapped in `ChromeTooltip` (`src/components/dashboard/shared/chrome-tooltip.tsx`) label "Fullscreen", shortcut "F". Hidden in draft mode.
- `F` key on the focused view opens it (window listener in `viz-focused.tsx`; bail on form controls, modifier keys, `overlayIsOpen()`, draft mode, or when already fullscreen).
- Tiles: `CourtTile` gains `actionSlot?: ReactNode`, rendered as a SIBLING of the `<Link>` inside a `relative` wrapper (never inside the anchor — a control inside a Link can't be rescued with preventDefault). Glyph: 24×24 `top-[10px] right-[10px]`, icon 12px, same colours, `aria-label="Open {tile name} fullscreen"`, no tooltip. On click: `setState({ ...tileState, fullscreen: true })` via the shared `useVizState` (updater form). Present on wall default tiles, the focused "Views" grid and saved-view tiles; ABSENT in Manage mode and on the Create-view tile. The hover card styles of the tile must still trigger when hovering the glyph.
- The court-morph view transition must not run for a fullscreen open.

- [ ] Implement, typecheck, lint, drift, full `npm test`, commit `feat(viz): fullscreen door on the focused court and tiles`.

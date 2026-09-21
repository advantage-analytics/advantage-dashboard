# Visualizations Phase 2B — Depth and Contact Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** One depth/contact band record per workspace that every return chart follows — overlay, preset menu, drag editor and receipt in the fullscreen viewer; the in-shell stats card follows the same record (frames P2k–P2p).

**Architecture:** Pure band logic in `src/lib/data/viz-bands.ts`; the record is loaded server-side beside saved views and travels through `MatchReportProvider` meta; `computeVizStats` buckets by it; the viewer renders an overlay + editor from it. Storage is always FEET; display goes through `formatDistance(unit, ft)` with `unit` hard-wired to `"ft"` until Stage 2C.

**Tech Stack:** Next.js 16, React 19.1, Tailwind v4, Supabase (RLS), Playwright specs.

**Spec:** `docs/superpowers/specs/2026-09-20-visualizations-phase-2-design.md` (Stage 2B + Appendix P2k–P2p).

## Global Constraints

- Everything in `docs/superpowers/plans/2026-09-20-visualizations-phase-2a.md` → "Global Constraints" binds here too (branch, no push, tokens/literals, attribution §4, `serve-zones.ts` untouched, role-based shot selection, widget-states gate: `mark`, `git add`, `git commit` as three SEPARATE shell commands; commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- The live table `public.viz_band_settings` ALREADY EXISTS (migration `supabase/migrations/20260921090000_viz_band_settings.sql`, applied). Do not write DDL. Columns: `account_id` (pk = `Workspace.id`), `depth_scheme` (`none|thirds|deepMidShort|inside|custom`, default `thirds`), `depth_dividers_ft numeric[2]|null` (feet from the BASELINE toward the net, 0 < a < b < 39; required when `custom`), `contact_dividers_ft numeric[2]` default `{0,5}` (feet from the baseline, negative = inside, −39 ≤ a < b ≤ 30), `updated_by`/`updated_at` set by trigger. Members read; personal owner or team owner/coach/staff write; no DELETE; `account_id` immutable.
- USER DECISIONS: (1) team bands are editable by owner/coach/staff only — players see them read-only; (2) contact defaults are `0` and `5 ft` and MUST render today's exact rows "Inside the baseline" / "0–5 ft behind" / "5 ft+ behind" with today's exact numbers; (3) bands are never part of a saved view.
- Depth bands measure from the baseline: DEEP = `0–a`, MID = `a–b`, SHORT = `b–39` (39 ft = baseline→net, 11.885 m). `VizDot.depthM` for return placement is measured from the NET — convert once, in `viz-bands.ts`.
- With NO row and default bands, every number the stats card shows today must be unchanged (thirds = 13 / 26 ft ≡ today's `DEPTH_THIRD_M` buckets; contact 0 / 5 ft ≡ today's `FIVE_FEET_M`). A regression spec pins this.
- Cheap writes: a preset pick is one upsert; never write on drag, only on Save.

All component paths are under `src/components/dashboard/matches/match-detail/shots/` unless noted.

---

### Task 1: Band logic, loader, action, RLS spec

**Files:**

- Create: `src/lib/data/viz-bands.ts`, `src/lib/format/distance.ts`, `src/lib/data/viz-bands-server.ts`, `src/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions.ts`
- Test: `tests/viz-bands.spec.ts`, `tests/format-distance.spec.ts`, `tests/viz-bands-rls.spec.ts` (live; model it on `tests/saved-views-rls.spec.ts` incl. its retrying sign-in fixture)

**Interfaces — Produces:**

```ts
// src/lib/format/distance.ts
export type DistanceUnit = "ft" | "m";
export const FT_PER_M = 3.28084;
export function formatDistance(unit: DistanceUnit, ft: number): string; // "12 ft" | "2.5 ft" | "3.5 m" — no trailing ".0"
export function formatRange(unit: DistanceUnit, fromFt: number, toFt: number): string; // "0–12 ft" (en dash, unit once)
export function snapFt(unit: DistanceUnit, ft: number): number; // nearest half-foot, or nearest half-METRE expressed in ft

// src/lib/data/viz-bands.ts
export type DepthScheme = "none" | "thirds" | "deepMidShort" | "inside" | "custom";
export interface BandSettings { depthScheme: DepthScheme; depthDividersFt: [number, number] | null; contactDividersFt: [number, number] }
export const COURT_HALF_FT = 39; // baseline → net
export const DEFAULT_BANDS: BandSettings; // thirds, null, [0, 5]
export function resolveDepthDividersFt(b: BandSettings): number[]; // none→[], thirds→[13,26], deepMidShort→[10,24], inside→[0], custom→its pair
export function depthFromBaselineFt(depthFromNetM: number): number; // 39 − m·FT_PER_M
export function bandIndex(valueFt: number, dividers: number[]): number; // 0-based; value === divider belongs to the band AFTER it
export interface BandRow { key: string; label: string; rangeLabel: string; fromFt: number | null; toFt: number | null }
export function depthBandRows(b: BandSettings, unit: DistanceUnit): BandRow[]; // labels Deep/Mid/Short; "inside" scheme → "Inside the baseline" / "Beyond the baseline"; none → []
export function contactBandRows(b: BandSettings, unit: DistanceUnit): BandRow[]; // defaults → EXACTLY "Inside the baseline", "0–5 ft behind", "5 ft+ behind"
export function contactReadout(unit: DistanceUnit, ft: number): string; // "2.5 ft inside" | "at the line" | "3 ft behind"
export function schemeLabel(s: DepthScheme): string; // THIRDS | DEEP·MID·SHORT | INSIDE | CUSTOM | OFF
export function clampDividers(pair: [number, number], moved: 0 | 1, bounds: [number, number], minGapFt: number): [number, number];
export function bandsEqual(a: BandSettings, b: BandSettings): boolean;
export function validateBandInput(x: unknown): BandSettings | null; // mirrors the table's CHECKs
export function rowToBandSettings(row: {...} | null): BandSettings; // null → DEFAULT_BANDS
```

`viz-bands-server.ts`: `getBandSettings = cache(async (accountId: string) => BandSettings)` — cookie client, never throws, null/err → defaults. `viz-bands-actions.ts` (`"use server"`): `saveBandSettings(input): Promise<ActionResult<BandSettings>>` — copy `saved-views-actions.ts`'s `requireContext()` + `revalidateMatchReport()` pattern; upsert on `account_id` with ONLY the three writable columns; map an RLS refusal (0 rows / 42501) to `"forbidden"`.

**Rules:** custom contact labels, in order inside→behind: a band wholly inside → "{x} ft inside or deeper" / "{x}–{y} ft inside"; a band spanning the line → "{x} ft inside → {y} ft behind"; behind → "{x}–{y} ft behind" / "{y} ft+ behind"; a divider exactly at 0 yields "Inside the baseline" and "0–{y} ft behind". RLS spec cases: personal owner insert/update ok; team owner, coach, staff ok; team player select ok but insert AND update refused; stranger sees nothing; `account_id` update refused; a CHECK violation (descending pair, custom without dividers) refused; clean up rows it creates via the service role.

- [ ] Failing specs first → implement → `npx playwright test tests/viz-bands.spec.ts tests/format-distance.spec.ts tests/viz-bands-rls.spec.ts` → typecheck, lint → commit `feat(viz): band settings logic, loader, action and RLS spec`.

---

### Task 2: Stats and the in-shell views follow the bands

**Files:**

- Modify: `viz-model.ts`, `use-viz-view.ts`, `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` (load beside `getSavedViews`), the `MatchReportProvider` meta type + provider, `shots-tab.tsx`/`viz-wall.tsx`/`default-tiles.ts` only as needed to thread it
- Test: `tests/viz-model.spec.ts`

**Rules:** `computeVizStats(points, cut, filters, subjectIsPlayer1, precomputed?, bands = DEFAULT_BANDS, unit = "ft")`. `depthKeyPlacement` and `contactDepthKey` bucket through `bandIndex` + the resolved dividers; row labels/ordering come from `depthBandRows` / `contactBandRows`; `DEPTH_THIRD_M` / `FIVE_FEET_M` disappear from the bucketing path. `depthScheme: "none"` → the Depth group is OMITTED (never zero rows). The stats sentence must keep working with generated labels. Meta gains `bandSettings: BandSettings` and `canEditBands: boolean` (personal → true; team → role ∈ owner|coach|staff — reuse `isProgramStaff` from `src/lib/workspace/types.ts`). REGRESSION SPEC FIRST: snapshot today's `computeVizStats` output for returnPlacement and returnContact on the existing fixtures, then assert identical output with `DEFAULT_BANDS`.

- [ ] Regression spec (passes before AND after) + new specs for custom/none/inside → implement → targeted specs, typecheck, lint, full `npm test` → commit `feat(viz): return stats follow the workspace bands`.

---

### Task 3: Band overlay, trigger, preset menu, receipt (viewer)

**Files:**

- Create: `viz-bands-overlay.tsx`, `viz-bands-menu.tsx`
- Modify: `viz-fullscreen.tsx`, `viz-fullscreen-court.tsx`, `court-geometry.ts` (+ spec): `viewerBandY(kind: "depth" | "contact", ft: number): number`

**Rules (spec Appendix P2k/P2l/P2n/P2o):** only on `returnPlacement` (kind depth, FAR half: 0 ft = `farBaselineY` 14 → 39 ft = `netY` 236) and `returnContact`/`rallyPosition` (kind contact, NEAR half: 0 ft = `nearBaselineY` 458, behind = larger y, inside = smaller y). Overlay: translucent white band rects alternating `fill-opacity` .11 / .04 / .11 spanning x 93→427 (wider than the court), clipped to the half + apron; left label mono caps 6.2 units `fill-opacity .72` "DEEP · 0–12 FT" at x 97; right `58%` sans 6.4 + mono `· 34` .6 at x 423 — rate/count from the SAME `computeVizStats` rows (no second computation). Slab trigger in the `stripSlot` position: `move-vertical` 13px 70% white + "Depth bands"/"Contact bands" 12/500 + mono 10px 50% `schemeLabel` + chevron; `aria-haspopup="menu"`. Menu = `FloatMenu tone="dark" side="top"`: label "Depth bands"; "No bands / Just the landing points, no shading"; divider; "Thirds / Equal thirds of the court, baseline to net"; "Deep · mid · short / Coach default — 10 ft, 14 ft, then the rest"; "Inside the baseline / Two bands, split where the court ends"; divider; blue `move-vertical` "Edit bands…"; note "Bands are yours — they change every return chart in this workspace, not this match." Contact cuts have no presets: the menu is "No bands" (contact overlay hidden — session-only toggle, not stored), "Edit bands…", note. Preset pick = optimistic local state + `saveBandSettings`; on failure revert and show the error in the receipt slot. `canEditBands === false`: rows and Edit disabled, note reads "Only coaches and staff can change this team's bands." Receipt: the filter-pill slot shows `role="status"` `move-vertical` "Bands saved · every return chart in {workspaceName}" for 4s, then the pill returns; no toast. "Edit bands…" calls an `onEdit` prop (Task 4 implements the mode; until then it may be a no-op guarded by a prop).

- [ ] Geometry spec first → implement → typecheck, lint, drift, full `npm test` → commit `feat(viz): band overlay, preset menu and receipt in the viewer`.

---

### Task 4: The band editor

**Files:**

- Create: `viz-bands-editor.tsx`, `band-editor-state.ts` (pure reducer) + `tests/band-editor-state.spec.ts`
- Modify: `viz-fullscreen.tsx`, `viz-fullscreen-court.tsx`, `use-pan-zoom.ts` (a `locked` flag)

**Rules (spec Appendix P2m/P2p):** one component, `kind: "depth" | "contact"`. Entering: pan/zoom locked at the current transform, marks at 35% opacity and non-interactive, filter pill reads "Editing bands", banner under it (36px, `rgba(13,13,13,.82)`, blue `move-vertical`, 12px white "Editing depth bands — drag a divider, or focus one and use ↑↓." + 60% white "Esc cancels."; contact: "Editing contact bands — drag a line, or focus one and use ↑↓."). Slab crossfades (200ms opacity; none under reduced motion) to: "Depth bands" + mono "CUSTOM" | mono range summary ("0–12 · 12–24 · 24–39 ft") … "Reset to thirds" (contact: "Reset to default") · "Cancel" · "Save bands" (blue 32px, `aria-disabled` + 45% until dirty). Two handles, each `role="slider"` `aria-orientation="vertical"` `aria-valuemin/max/now` `aria-valuetext` = the chip text (`formatDistance` / `contactReadout`), `aria-label` "Divider between Deep and Mid": blue 1px line → 2px while held, 22px hit area, white square handle with blue border at the left end, blue chip at the right end following the line. Drag (pointer events + capture) or ↑/↓ = 2 screen px, ⇧ = 10 px, converted to ft at the current zoom; snap with `snapFt`; min gap = 26 screen px converted to ft; clamped baseline→net (depth) / −39…30 (contact). Dirty = `!bandsEqual(draft, saved)` so dragging back re-deadens Save. Save → `saveBandSettings({…, depthScheme: "custom"})` → exit edit mode → receipt. Esc / Cancel restores and exits edit mode (Esc must NOT exit the viewer while editing). The pure reducer owns move/snap/clamp/reset/dirty and is fully spec'd.

- [ ] Reducer spec first → implement → typecheck, lint, drift, full `npm test` → commit `feat(viz): depth and contact band editor`.

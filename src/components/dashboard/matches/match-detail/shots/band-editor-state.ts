/**
 * The band editor's pure reducer (Phase 2B, Task 4; spec Appendix P2m/P2p).
 * No React, no DOM — `viz-bands-editor.tsx` owns the pointer and the keys and
 * turns screen pixels into feet (`court-geometry.ts`'s
 * `viewerScreenPxToFt`); everything that decides WHERE a divider may go, and
 * what Save would write, lives here and is pinned by
 * `tests/band-editor-state.spec.ts`.
 *
 * ## One pair at a time
 *
 * The editor edits exactly one pair of dividers — the depth pair (return
 * landings, feet from the FAR baseline toward the net) or the contact pair
 * (feet from the NEAR baseline, negative = inside). The OTHER kind's values
 * are never touched: the payload is built on top of the CURRENT bands (fix
 * round 1), so a change to the other kind that landed while the editor was
 * open — an in-flight preset, another tab — is carried through, not
 * overwritten with the values captured at entry.
 *
 * ## Where a divider may go (fix round 1)
 *
 * The intersection of two ranges, per kind (`bandEditorBounds`):
 *
 * - the DATA range — the table's CHECK (contact −39…30), or for depth the
 *   baseline→net inset half a foot (so the payload always passes
 *   `0 < a < b < 39` after 2 dp rounding);
 * - the DRAWN range — where the viewer can actually draw a divider
 *   (`viewerBandDrawableFt`: contact is only ≈ −18…7.7 ft), rounded INWARD
 *   to the snap grid so a bound is always a position a drag can land on.
 *
 * Past the drawn range a handle would pin at the edge while its chip kept
 * counting, the two handles would stack and the 26 px gap would break.
 *
 * ## Where a move lands
 *
 * `setDivider` is the one path every move takes:
 *
 * 1. snap to the unit's grid (`snapFt` — half a foot, or half a metre);
 * 2. "home magnet": if that grid point is the one the START position (or the
 *    reset position) snaps to, land on the start position EXACTLY instead.
 *    Thirds start off the grid (12.998 ft); without this, dragging away and
 *    back would land on 13.0, never equal the saved record, and Save could
 *    never re-deaden;
 * 3. `clampDividers` — the moved divider has priority and pushes the other
 *    one to keep `minGapFt` between them, inside the bounds;
 * 4. a divider the clamp pushed or stopped is rounded OUTWARD (away from the
 *    other one) to the grid, so the gap only ever grows and every resting
 *    position the clamp produces is still a grid position.
 *
 * ## Dirty and the payload
 *
 * Dirty is `!bandsEqual(payload, current)` — "would Save change anything" —
 * and the payload is built so that returning to the start really is clean:
 *
 * - a draft still at its starting pair saves as the current record itself;
 * - a depth draft sitting exactly on the thirds pair (i.e. "Reset to thirds"
 *   left alone) saves as the `thirds` SCHEME, not as a custom pair that only
 *   approximates it after rounding;
 * - anything else saves as `depthScheme: "custom"` + the draft rounded to
 *   2 dp (the column's `numeric(5,2)`), or as the new contact pair.
 *
 * A saved pair that cannot be drawn (a contact pair of [−25, 20]) OPENS
 * clamped to the drawn range, and that clamped pair is the editor's start —
 * so opening the editor on it is not a change (Save stays dead) until the
 * user moves something; only then does the clamped pair get written.
 */

import {
  bandsEqual,
  clampDividers,
  DEFAULT_BANDS,
  resolveDepthDividersFt,
  type BandSettings,
  type DepthScheme,
} from "@/lib/data/viz-bands";
import { FT_PER_M, snapFt, type DistanceUnit } from "@/lib/format/distance";

import { viewerBandDrawableFt } from "./court-geometry";

export type BandEditorKind = "depth" | "contact";

export interface BandEditorState {
  kind: BandEditorKind;
  /** The workspace's record when editing began. The default "current"
   *  record for `bandEditorPayload`/`bandEditorDirty`; the viewer passes the
   *  live one. */
  saved: BandSettings;
  /** The pair the editor opened on (clamped into the drawn range):
   *  "untouched" means the draft equals it. */
  initial: [number, number];
  /** The pair being dragged, ascending, feet from the baseline. */
  draft: [number, number];
}

/** What a move needs from the screen: the display unit (for the snap grid)
 *  and the minimum gap, already converted from 26 screen px at the current
 *  zoom. */
export interface BandEditorContext {
  unit: DistanceUnit;
  minGapFt: number;
}

const DEFAULT_CTX: BandEditorContext = { unit: "ft", minGapFt: 0 };

/** Depth's DATA range: the FAR baseline to the net, inset half a foot at each
 *  end so a band can never collapse to nothing and the saved pair always
 *  passes `0 < a < b < 39`. */
export const DEPTH_EDIT_BOUNDS_FT: [number, number] = [0.5, 38.5];

/** Contact's DATA range: the table's own CHECK, `−39 ≤ a < b ≤ 30`. The
 *  editor's range is narrower — see `bandEditorBounds`. */
export const CONTACT_DATA_BOUNDS_FT: [number, number] = [-39, 30];

/** One snap step in feet — half a foot, or half a metre. */
export function snapStepFt(unit: DistanceUnit): number {
  return unit === "ft" ? 0.5 : 0.5 * FT_PER_M;
}

/** Grid position `k` (in half-units), in feet — computed the same way
 *  `snapFt` computes it, so a bound and a snapped drag compare equal. */
function gridFt(unit: DistanceUnit, k: number): number {
  return unit === "ft" ? k / 2 : (k / 2) * FT_PER_M;
}

function gridIndex(unit: DistanceUnit, ft: number): number {
  return ft / snapStepFt(unit);
}

/** The grid position at or below `ft` (a hair of tolerance, so a value that
 *  already IS a grid position never drops a whole step). */
function gridFloor(unit: DistanceUnit, ft: number): number {
  return gridFt(unit, Math.floor(gridIndex(unit, ft) + 1e-9));
}

function gridCeil(unit: DistanceUnit, ft: number): number {
  return gridFt(unit, Math.ceil(gridIndex(unit, ft) - 1e-9));
}

/**
 * Where a divider of `kind` may go in the editor: the data range intersected
 * with the drawn range, the latter rounded inward to `unit`'s grid (≈[−18,
 * 7.5] ft for contact; [0.5, 38.5] for depth, whose whole half is drawn).
 */
export function bandEditorBounds(
  kind: BandEditorKind,
  unit: DistanceUnit = "ft",
): [number, number] {
  const [dataLo, dataHi] =
    kind === "depth" ? DEPTH_EDIT_BOUNDS_FT : CONTACT_DATA_BOUNDS_FT;
  const [drawLo, drawHi] = viewerBandDrawableFt(kind);
  // Intersect first, THEN round inward — so both bounds are grid positions
  // in either unit (a metric depth bound of 0.5 ft would rest a drag at
  // "0.2 m", off the half-metre grid).
  return [
    gridCeil(unit, Math.max(dataLo, drawLo)),
    gridFloor(unit, Math.min(dataHi, drawHi)),
  ];
}

const THIRDS_PAIR = resolveDepthDividersFt(DEFAULT_BANDS) as [number, number];

/** "Reset to thirds" / "Reset to default". */
export function resetPairFor(kind: BandEditorKind): [number, number] {
  return kind === "depth"
    ? [THIRDS_PAIR[0], THIRDS_PAIR[1]]
    : [DEFAULT_BANDS.contactDividersFt[0], DEFAULT_BANDS.contactDividersFt[1]];
}

function pairEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * `clampDividers`, then round whichever divider it CHANGED outward to the
 * grid (the lower one down, the upper one up — away from each other, so the
 * gap never shrinks below `minGapFt`), re-clamped into the bounds.
 */
function clampPair(
  pair: [number, number],
  moved: 0 | 1,
  bounds: [number, number],
  ctx: BandEditorContext,
): [number, number] {
  const clamped = clampDividers(pair, moved, bounds, ctx.minGapFt);
  const [lo, hi] = bounds;
  const out: [number, number] = [clamped[0], clamped[1]];
  if (clamped[0] !== pair[0]) {
    out[0] = Math.max(lo, gridFloor(ctx.unit, clamped[0]));
  }
  if (clamped[1] !== pair[1]) {
    out[1] = Math.min(hi, gridCeil(ctx.unit, clamped[1]));
  }
  return out;
}

/**
 * Fit a pair into `kind`'s editor range with at least `minGapFt` between the
 * two: each divider clamped into the bounds, then — only if they are now too
 * close — the lower one pushed down (the upper one keeps its place unless the
 * lower hits the bound).
 */
function fitPair(
  pair: [number, number],
  kind: BandEditorKind,
  ctx: BandEditorContext,
): [number, number] {
  const bounds = bandEditorBounds(kind, ctx.unit);
  const [lo, hi] = bounds;
  const a = Math.min(hi, Math.max(lo, pair[0]));
  const b = Math.min(hi, Math.max(lo, pair[1]));
  if (b - a >= ctx.minGapFt && a < b) return [a, b];
  // A gap of at least one grid step even at a zero `minGapFt`, so a pair
  // clamped onto the same bound never collapses to one line.
  const gap = Math.max(ctx.minGapFt, snapStepFt(ctx.unit));
  return clampPair([a, b], 1, bounds, { ...ctx, minGapFt: gap });
}

/**
 * The pair an editor opens on. A custom record opens on its own pair and a
 * two-divider preset on the pair it resolves to; "none" and "inside" have no
 * pair of their own, so they open on thirds.
 */
function rawInitialPair(
  kind: BandEditorKind,
  saved: BandSettings,
): [number, number] {
  if (kind === "contact") {
    return [saved.contactDividersFt[0], saved.contactDividersFt[1]];
  }
  const resolved = resolveDepthDividersFt(saved);
  if (resolved.length === 2) return [resolved[0], resolved[1]];
  return resetPairFor("depth");
}

/**
 * Open the editor on `saved`. The starting pair is fitted into the drawn
 * range and the current zoom's minimum gap (`ctx`), and BOTH `initial` and
 * `draft` start there — so opening on an undrawable pair is not by itself a
 * change.
 */
export function initBandEditor(
  kind: BandEditorKind,
  saved: BandSettings,
  ctx: BandEditorContext = DEFAULT_CTX,
): BandEditorState {
  const initial = fitPair(rawInitialPair(kind, saved), kind, ctx);
  return { kind, saved, initial, draft: [initial[0], initial[1]] };
}

/**
 * The zoom changed under an open editor (a window resize re-fits the court),
 * so the 26 px gap is a different number of feet. Re-fit both the start and
 * the draft — together, so an untouched editor stays untouched. Returns the
 * same object when nothing moved.
 */
export function refitBandEditor(
  state: BandEditorState,
  ctx: BandEditorContext,
): BandEditorState {
  const initial = fitPair(state.initial, state.kind, ctx);
  const draft = fitPair(state.draft, state.kind, ctx);
  if (pairEqual(initial, state.initial) && pairEqual(draft, state.draft)) {
    return state;
  }
  return { ...state, initial, draft };
}

/**
 * Move divider `index` to `ft` (snap → home magnet → clamp → outward
 * rounding; see the module doc comment). Returns the SAME state object when
 * nothing moved, so a caller can tell a no-op apart without comparing pairs.
 */
export function setDivider(
  state: BandEditorState,
  index: 0 | 1,
  ft: number,
  ctx: BandEditorContext,
): BandEditorState {
  let target = snapFt(ctx.unit, ft);
  for (const home of [state.initial[index], resetPairFor(state.kind)[index]]) {
    if (snapFt(ctx.unit, home) === target) {
      target = home;
      break;
    }
  }
  const pair: [number, number] = [state.draft[0], state.draft[1]];
  pair[index] = target;
  const next = clampPair(
    pair,
    index,
    bandEditorBounds(state.kind, ctx.unit),
    ctx,
  );
  if (pairEqual(next, state.draft)) return state;
  return { ...state, draft: next };
}

/** Move divider `index` by `deltaFt` from where it is now. */
export function moveDivider(
  state: BandEditorState,
  index: 0 | 1,
  deltaFt: number,
  ctx: BandEditorContext,
): BandEditorState {
  return setDivider(state, index, state.draft[index] + deltaFt, ctx);
}

/**
 * A keyboard step. `deltaFt` is 2 (or, with Shift, 10) screen px converted
 * at the current zoom — which, zoomed out, can be under a quarter of a foot
 * and would snap straight back to where it started. A key press that moves
 * nothing is a broken key, so a nudge that the snap swallows moves one whole
 * grid step in its direction instead.
 */
export function nudgeDivider(
  state: BandEditorState,
  index: 0 | 1,
  deltaFt: number,
  ctx: BandEditorContext,
): BandEditorState {
  if (deltaFt === 0) return state;
  const next = moveDivider(state, index, deltaFt, ctx);
  if (next.draft[index] !== state.draft[index]) return next;
  const step = snapStepFt(ctx.unit) * Math.sign(deltaFt);
  return setDivider(
    state,
    index,
    snapFt(ctx.unit, state.draft[index]) + step,
    ctx,
  );
}

/** "Reset to thirds" (depth) / "Reset to default" (contact, `[0, 5]`). */
export function resetBandEditor(state: BandEditorState): BandEditorState {
  const pair = resetPairFor(state.kind);
  if (pairEqual(pair, state.draft)) return state;
  return { ...state, draft: pair };
}

/**
 * What Save would write, built on `current` — the LIVE effective bands (the
 * viewer passes them); only THIS kind's fields come from the draft. Defaults
 * to the record captured at entry.
 */
export function bandEditorPayload(
  state: BandEditorState,
  current: BandSettings = state.saved,
): BandSettings {
  const { kind, initial, draft } = state;
  if (pairEqual(draft, initial)) return current;
  if (kind === "contact") {
    return {
      ...current,
      contactDividersFt: [round2(draft[0]), round2(draft[1])],
    };
  }
  if (pairEqual(draft, THIRDS_PAIR)) {
    return { ...current, depthScheme: "thirds" };
  }
  return {
    ...current,
    depthScheme: "custom",
    depthDividersFt: [round2(draft[0]), round2(draft[1])],
  };
}

/** Save is live only when it would change the (current) record. */
export function bandEditorDirty(
  state: BandEditorState,
  current: BandSettings = state.saved,
): boolean {
  return !bandsEqual(bandEditorPayload(state, current), current);
}

/**
 * The bands the overlay draws WHILE editing: always the live draft pair,
 * unrounded, whatever the saved scheme is (a "none" record still shows the
 * three bands being edited).
 */
export function bandEditorPreview(state: BandEditorState): BandSettings {
  const { kind, saved, draft } = state;
  if (kind === "contact") {
    return { ...saved, contactDividersFt: [draft[0], draft[1]] };
  }
  return {
    ...saved,
    depthScheme: "custom",
    depthDividersFt: [draft[0], draft[1]],
  };
}

/**
 * The depth scheme the editor's slab names beside "Depth bands" — what the
 * DRAFT on screen is, not what the record was: the thirds pair reads THIRDS,
 * an untouched Deep · mid · short or custom record keeps its own name, and
 * anything else (including three bands being drawn over a "none" or
 * "inside" record) is CUSTOM.
 */
export function bandEditorDraftScheme(state: BandEditorState): DepthScheme {
  if (pairEqual(state.draft, THIRDS_PAIR)) return "thirds";
  if (
    pairEqual(state.draft, state.initial) &&
    (state.saved.depthScheme === "deepMidShort" ||
      state.saved.depthScheme === "custom")
  ) {
    return state.saved.depthScheme;
  }
  return "custom";
}

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
 * ride along untouched in every payload: editing where a return lands must
 * never silently rewrite where a coach split contact, and vice versa.
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
 *    one to keep `minGapFt` between them; bounds are baseline→net for depth
 *    (inset half a foot so the payload always satisfies `0 < a < b < 39`
 *    after 2 dp rounding) and −39…30 ft for contact (the table's own CHECK).
 *
 * ## Dirty and the payload
 *
 * Dirty is `!bandsEqual(payload, saved)` — "would Save change anything" —
 * and the payload is built so that returning to the start really is clean:
 *
 * - a draft still at its starting pair saves as the SAVED record itself (a
 *   preset stays that preset);
 * - a depth draft sitting exactly on the thirds pair (i.e. "Reset to thirds"
 *   left alone) saves as the `thirds` SCHEME, not as a custom pair that only
 *   approximates it after rounding;
 * - anything else saves as `depthScheme: "custom"` + the draft rounded to
 *   2 dp (the column's `numeric(5,2)`), or as the new contact pair.
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

export type BandEditorKind = "depth" | "contact";

export interface BandEditorState {
  kind: BandEditorKind;
  /** The workspace's record when editing began — what Cancel restores and
   *  what dirty is measured against. */
  saved: BandSettings;
  /** The pair the editor opened on: "untouched" means the draft equals it. */
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

/** Depth: the FAR baseline to the net, inset half a foot at each end so a
 *  band can never collapse to nothing and the saved pair always passes
 *  `0 < a < b < 39`. */
export const DEPTH_EDIT_BOUNDS_FT: [number, number] = [0.5, 38.5];

/** Contact: the table's own CHECK, `−39 ≤ a < b ≤ 30`. */
export const CONTACT_EDIT_BOUNDS_FT: [number, number] = [-39, 30];

export function bandEditorBounds(kind: BandEditorKind): [number, number] {
  return kind === "depth" ? DEPTH_EDIT_BOUNDS_FT : CONTACT_EDIT_BOUNDS_FT;
}

const THIRDS_PAIR = resolveDepthDividersFt(DEFAULT_BANDS) as [number, number];

/** "Reset to thirds" / "Reset to default". */
export function resetPairFor(kind: BandEditorKind): [number, number] {
  return kind === "depth"
    ? [THIRDS_PAIR[0], THIRDS_PAIR[1]]
    : [DEFAULT_BANDS.contactDividersFt[0], DEFAULT_BANDS.contactDividersFt[1]];
}

/** One snap step in feet — half a foot, or half a metre. */
export function snapStepFt(unit: DistanceUnit): number {
  return unit === "ft" ? 0.5 : 0.5 * FT_PER_M;
}

function pairEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * The pair an editor opens on. A custom record opens on its own pair and a
 * two-divider preset on the pair it resolves to; "none" and "inside" have no
 * pair of their own, so they open on thirds.
 */
function initialPairFor(
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

export function initBandEditor(
  kind: BandEditorKind,
  saved: BandSettings,
): BandEditorState {
  const initial = initialPairFor(kind, saved);
  return { kind, saved, initial, draft: [initial[0], initial[1]] };
}

/**
 * Move divider `index` to `ft` (snap → home magnet → clamp; see the module
 * doc comment). Returns the SAME state object when nothing moved, so a
 * caller can tell a no-op apart without comparing pairs.
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
  const next = clampDividers(
    pair,
    index,
    bandEditorBounds(state.kind),
    ctx.minGapFt,
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

/** What Save would write — see the module doc comment. */
export function bandEditorPayload(state: BandEditorState): BandSettings {
  const { kind, saved, initial, draft } = state;
  if (pairEqual(draft, initial)) return saved;
  if (kind === "contact") {
    return {
      ...saved,
      contactDividersFt: [round2(draft[0]), round2(draft[1])],
    };
  }
  if (pairEqual(draft, THIRDS_PAIR)) {
    return { ...saved, depthScheme: "thirds" };
  }
  return {
    ...saved,
    depthScheme: "custom",
    depthDividersFt: [round2(draft[0]), round2(draft[1])],
  };
}

/** Save is live only when it would change the workspace's record. */
export function bandEditorDirty(state: BandEditorState): boolean {
  return !bandsEqual(bandEditorPayload(state), state.saved);
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

/**
 * Placing the selected stroke on the court by clicking it — board 08i's
 * floating court card. Pure, so the click sequence is a spec rather than a
 * hope.
 *
 * The sequence cycles: the first click on a newly selected stroke is where it
 * was HIT (`contact_x/y`), the second where it LANDED (`landing_x/y`), and a
 * third starts over at the hit, so a labeller who misplaced either end just
 * keeps clicking. The card's Contact / Landing switch sets the end directly
 * ({@link setPlacementTarget}). Selecting another stroke (or re-selecting
 * this one) starts again at the hit.
 *
 * ── The court never moves on its own ────────────────────────────────────────
 * The court is always the WHOLE court, drawn the way it was before the click:
 * selecting a stroke does not zoom it, turn it or switch the end being placed
 * — the labeller asked for a court that stays put. The one thing about the
 * court's orientation that can change is `flipped`, and only the "Flip side"
 * button changes it ({@link flipPlacement}): pressed, the court is drawn the
 * other way up, the far baseline at the bottom, so the picture can match a
 * camera at the other end. It outlives the selection — clearing or changing
 * the selected stroke keeps it ({@link clearPlacement}, {@link startPlacement}).
 */

import type { LabelShotPatch } from "@/lib/services/labels/edit";
import {
  deriveShotResult,
  type ShotGeometry,
} from "@/lib/services/labels/shot-derived";
import type { CourtPoint } from "./court-geometry";

export type PlacementTarget = "contact" | "landing";

export interface PlacementState {
  /** The stroke the next click places; null when none is selected. */
  shotId: string | null;
  target: PlacementTarget;
  /**
   * "Flip side" is pressed: the court is drawn the other way up, far
   * baseline at the bottom. The court's orientation, not the stroke's — it
   * survives a change of selection.
   */
  flipped: boolean;
}

export const NO_PLACEMENT: PlacementState = {
  shotId: null,
  target: "contact",
  flipped: false,
};

/**
 * Selecting a stroke: its next click is where it was hit. The court keeps
 * the orientation it had (`flipped`).
 */
export function startPlacement(
  shotId: string | null,
  flipped = false,
): PlacementState {
  return { shotId, target: "contact", flipped };
}

/** Nothing selected, the court as it was. */
export function clearPlacement(state: PlacementState): PlacementState {
  if (state.shotId === null && state.target === "contact") return state;
  return { shotId: null, target: "contact", flipped: state.flipped };
}

/**
 * The Contact / Landing switch: the end the next click places. Nothing else
 * moves — the court stays as it is.
 */
export function setPlacementTarget(
  state: PlacementState,
  target: PlacementTarget,
): PlacementState {
  if (state.shotId === null || state.target === target) return state;
  return { ...state, target };
}

/** "Flip side": the court the other way up. */
export function flipPlacement(state: PlacementState): PlacementState {
  if (state.shotId === null) return state;
  return { ...state, flipped: !state.flipped };
}

/** Metres to the centimetre: a click resolves to ~6 cm, finer is noise. */
const toCm = (n: number) => Math.round(n * 100) / 100;

/**
 * One court click: the patch it writes to the selected stroke and the state
 * the next click starts from. Null when no stroke is selected — the click
 * places nothing.
 *
 * `shot` is the stroke being placed, as it stands before the click. When the
 * click leaves it with both a contact and a landing — the landing click, or a
 * re-placed contact on a stroke that already has its landing — the patch also
 * carries the `result` those coordinates derive (shot-derived.ts), so In /
 * Out / Net is saved in the same write as the position. A stroke still
 * missing an end gets no `result` key and keeps its stored value.
 *
 * The next state's end follows the click: after a contact, the landing;
 * after a landing, the contact again. The court itself does not move.
 */
export function nextPlacement(
  state: PlacementState,
  point: CourtPoint,
  shot: ShotGeometry,
): { state: PlacementState; patch: LabelShotPatch } | null {
  if (state.shotId === null) return null;
  const x = toCm(point.x);
  const y = toCm(point.y);
  const placed: LabelShotPatch =
    state.target === "contact"
      ? { contact_x: x, contact_y: y }
      : { landing_x: x, landing_y: y };
  const result = deriveShotResult({ ...shot, ...placed });
  const next: PlacementState = {
    ...state,
    target: state.target === "contact" ? "landing" : "contact",
  };
  return {
    state: next,
    patch: result === null ? placed : { ...placed, result },
  };
}

/**
 * What the next click will do, for the court's accessible name. `shotNumber`
 * is the number the table shows the stroke under (live strokes, 1…n).
 */
export function placementPrompt(
  state: PlacementState,
  shotNumber: number | null,
): string | null {
  if (state.shotId === null || shotNumber === null) return null;
  return state.target === "contact"
    ? `Click where shot ${shotNumber} was hit`
    : `Click where shot ${shotNumber} landed`;
}

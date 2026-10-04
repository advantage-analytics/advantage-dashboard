/**
 * Placing the selected stroke on the court by clicking it — board 08's court
 * card. Pure, so the click sequence is a spec rather than a hope.
 *
 * The sequence cycles: the first click on a newly selected stroke is where it
 * was HIT (`contact_x/y`), the second where it LANDED (`landing_x/y`), and a
 * third starts over at the hit, so a labeller who misplaced either end just
 * keeps clicking — the board's own `onCourt` does the same. Selecting another
 * stroke (or re-selecting this one) starts again at the hit.
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
}

export const NO_PLACEMENT: PlacementState = { shotId: null, target: "contact" };

/** Selecting a stroke: its next click is where it was hit. */
export function startPlacement(shotId: string | null): PlacementState {
  return { shotId, target: "contact" };
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
  return {
    state: {
      shotId: state.shotId,
      target: state.target === "contact" ? "landing" : "contact",
    },
    patch: result === null ? placed : { ...placed, result },
  };
}

/**
 * The line under the court: what the next click will do. `shotNumber` is the
 * number the table shows the stroke under (live strokes, 1…n).
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

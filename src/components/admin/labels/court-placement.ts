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
 * ── Which half the card zooms to ────────────────────────────────────────────
 * The card shows one half of the court while placing (court-geometry.ts), and
 * `half` is the one on screen:
 *
 * - **Contact** shows the hitter's half — {@link hitterHalf}: the side the
 *   stroke's stored contact is on; else read off the nearest earlier live
 *   stroke with a contact (the other side when the other player hit it, the
 *   same side when this player did — a second serve after a fault); else
 *   near.
 * - **Landing** shows the other half: a ball that crossed the net.
 * - **Flip side** ({@link flipPlacement}) shows the opposite of either — a
 *   ball into the net came down on the hitter's own half, and a contact
 *   guessed onto the wrong side is one press from the right one. `flipped`
 *   is that button's pressed state; it never outlives the end it was pressed
 *   for.
 */

import type { LabelShotPatch } from "@/lib/services/labels/edit";
import {
  deriveShotResult,
  type ShotGeometry,
} from "@/lib/services/labels/shot-derived";
import {
  halfOf,
  otherHalf,
  type CourtHalf,
  type CourtPoint,
} from "./court-geometry";

export type PlacementTarget = "contact" | "landing";

export interface PlacementState {
  /** The stroke the next click places; null when none is selected. */
  shotId: string | null;
  target: PlacementTarget;
  /** The half of the court on screen, where the next click lands. */
  half: CourtHalf;
  /** "Flip side" is pressed: `half` is the opposite of the target's usual. */
  flipped: boolean;
}

export const NO_PLACEMENT: PlacementState = {
  shotId: null,
  target: "contact",
  half: "near",
  flipped: false,
};

/** What {@link hitterHalf} reads of a stroke. */
export interface HalfClue {
  hitter: "p1" | "p2" | null;
  contactY: number | null;
  /** A tombstone says nothing about where anyone stood. */
  status?: string;
}

/**
 * The half a stroke was hit from. `earlier` is the point's strokes before it,
 * in video order.
 */
export function hitterHalf(
  shot: HalfClue,
  earlier: readonly HalfClue[] = [],
): CourtHalf {
  if (shot.contactY !== null) return halfOf(shot.contactY);
  const previous = earlier.findLast(
    (other) => other.status !== "deleted" && other.contactY !== null,
  );
  if (!previous || previous.contactY === null) return "near";
  const side = halfOf(previous.contactY);
  const sameHitter =
    shot.hitter !== null &&
    previous.hitter !== null &&
    shot.hitter === previous.hitter;
  return sameHitter ? side : otherHalf(side);
}

/**
 * Selecting a stroke: its next click is where it was hit, on the hitter's
 * half (`half` — see {@link hitterHalf}).
 */
export function startPlacement(
  shotId: string | null,
  half: CourtHalf = "near",
): PlacementState {
  return { shotId, target: "contact", half, flipped: false };
}

/** The hitter's half as the state on screen implies it. */
function hitterHalfIn(state: PlacementState): CourtHalf {
  // Wherever the labeller is about to place the contact IS the hitter's half,
  // flipped or not; a landing is across the net from it unless flipped.
  if (state.target === "contact") return state.half;
  return state.flipped ? state.half : otherHalf(state.half);
}

/**
 * The Contact / Landing switch: the end the next click places, and the half
 * that end is on. `contactY` is the stroke's stored contact, which outranks
 * what the screen implies. Any flip is dropped — it was pressed for the other
 * end.
 */
export function setPlacementTarget(
  state: PlacementState,
  target: PlacementTarget,
  contactY: number | null = null,
): PlacementState {
  if (state.shotId === null || state.target === target) return state;
  const hitter = contactY !== null ? halfOf(contactY) : hitterHalfIn(state);
  return {
    shotId: state.shotId,
    target,
    half: target === "contact" ? hitter : otherHalf(hitter),
    flipped: false,
  };
}

/** "Flip side": the other half, for the end being placed. */
export function flipPlacement(state: PlacementState): PlacementState {
  if (state.shotId === null) return state;
  return { ...state, half: otherHalf(state.half), flipped: !state.flipped };
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
 * The next state's half follows the click: after a contact, the landing is
 * across the net from where the contact was just put; after a landing, the
 * contact is back on the hitter's half.
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
  const next: PlacementState =
    state.target === "contact"
      ? {
          shotId: state.shotId,
          target: "landing",
          half: otherHalf(halfOf(y)),
          flipped: false,
        }
      : {
          shotId: state.shotId,
          target: "contact",
          half:
            shot.contact_y !== null
              ? halfOf(shot.contact_y)
              : hitterHalfIn(state),
          flipped: false,
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

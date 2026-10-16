/**
 * Placing the selected stroke on the court by clicking it. Pure.
 *
 * The sequence cycles: the first click on a newly selected stroke is where it
 * was hit (`contact_x/y`), the second where it landed (`landing_x/y`), a third
 * starts over. The Contact / Landing switch sets the end directly ({@link
 * setPlacementTarget}).
 *
 * `half` is the half of the court on screen:
 *
 * - Contact shows the hitter's half ({@link hitterHalf}): the side the stored
 *   contact is on; else read off the nearest earlier live stroke with a
 *   contact; else near.
 * - Landing shows the other half.
 * - Flip side ({@link flipPlacement}) shows the opposite of either, for a ball
 *   into the net or a contact guessed onto the wrong side. `flipped` never
 *   outlives the end it was pressed for.
 *
 * The box on screen can slide at the same size ({@link courtSlide}): back
 * past the usual run-off for a contact deep behind the baseline — the
 * run-off grows as the labeller clicks near its edge, the click itself
 * stored unclamped — and across the net for a landing on the hitter's own
 * side, which is allowed (a click anywhere is the metres under it).
 */

import { takesServeTurn } from "@/lib/services/labels/game-operations";
import { tiebreakEndsSwapped } from "@/lib/services/labels/tiebreak-fold";
import type {
  LabelShotPatch,
  LabelShotValueField,
} from "@/lib/services/labels/edit";
import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import {
  landedOnOwnSide,
  positionPatch,
  type ShotEnds,
  type ShotPosition,
} from "@/lib/services/labels/shot-derived";
import {
  USUAL_RUNOFF,
  behindBaseline,
  halfOf,
  otherHalf,
  runoffWindowTop,
  shankWindowTop,
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
  /**
   * Metres of run-off the contact's box draws behind the baseline, once a
   * click near its edge grew it past {@link USUAL_RUNOFF}. Absent: usual.
   */
  runoff?: number;
}

export const NO_PLACEMENT: PlacementState = {
  shotId: null,
  target: "contact",
  half: "near",
  flipped: false,
};

export interface HalfClue {
  hitter: "p1" | "p2" | null;
  contactY: number | null;
  /** A tombstone says nothing about where anyone stood. */
  status?: string;
}

/**
 * The half a stroke was hit from; `earlier` is the strokes before it.
 * `fallback` is the answer when nothing in the point says: near, unless the
 * caller knows better (`tiebreakHitterHalf`).
 */
export function hitterHalf(
  shot: HalfClue,
  earlier: readonly HalfClue[] = [],
  fallback: CourtHalf = "near",
): CourtHalf {
  if (shot.contactY !== null) return halfOf(shot.contactY);
  const previous = earlier.findLast(
    (other) => other.status !== "deleted" && other.contactY !== null,
  );
  if (!previous || previous.contactY === null) return fallback;
  const side = halfOf(previous.contactY);
  const sameHitter =
    shot.hitter !== null &&
    previous.hitter !== null &&
    shot.hitter === previous.hitter;
  return sameHitter ? side : otherHalf(side);
}

/** What `tiebreakHitterHalf` reads of a point. A `LabelPoint` satisfies it. */
export type TiebreakHalfPoint = Pick<
  LabelPoint,
  "id" | "status" | "pointIndex" | "setNumber" | "gameNumber" | "ending"
> & {
  gameType?: LabelPoint["gameType"] | null;
  shots: readonly HalfClue[];
};

/**
 * In a tiebreak, the half `hitter` stands on at point `pointId` when nothing
 * in that point says: read off the last earlier point of the tiebreak with a
 * placed contact, across the net when another player hit it, and across again
 * when the ends changed in between — after every six points
 * (`tiebreakEndsSwapped`). Null outside a tiebreak, or with nothing to read.
 */
export function tiebreakHitterHalf(
  points: readonly TiebreakHalfPoint[],
  pointId: string,
  hitter: LabelSide | null,
): CourtHalf | null {
  if (hitter === null) return null;
  const point = points.find((p) => p.id === pointId);
  if (!point || (point.gameType ?? "game") === "game") return null;
  const game = points
    .filter(
      (p) =>
        p.status !== "deleted" &&
        p.setNumber === point.setNumber &&
        p.gameNumber === point.gameNumber,
    )
    .sort((a, b) => a.pointIndex - b.pointIndex);
  const playedBefore = (at: TiebreakHalfPoint) =>
    game.filter((p) => p.pointIndex < at.pointIndex && takesServeTurn(p))
      .length;
  const now = tiebreakEndsSwapped(playedBefore(point));
  for (const earlier of [...game].reverse()) {
    if (earlier.pointIndex >= point.pointIndex) continue;
    const contact = earlier.shots.findLast(
      (shot) =>
        shot.status !== "deleted" &&
        shot.hitter !== null &&
        shot.contactY !== null,
    );
    if (!contact || contact.contactY === null) continue;
    let half = halfOf(contact.contactY);
    if (contact.hitter !== hitter) half = otherHalf(half);
    if (tiebreakEndsSwapped(playedBefore(earlier)) !== now) {
      half = otherHalf(half);
    }
    return half;
  }
  return null;
}

/** Selecting a stroke: its next click is its contact, on the hitter's half. */
export function startPlacement(
  shotId: string | null,
  half: CourtHalf = "near",
): PlacementState {
  return { shotId, target: "contact", half, flipped: false };
}

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

export function flipPlacement(state: PlacementState): PlacementState {
  if (state.shotId === null) return state;
  return { ...state, half: otherHalf(state.half), flipped: !state.flipped };
}

/** Metres to the centimetre: a click resolves to ~6 cm, finer is noise. */
const toCm = (n: number) => Math.round(n * 100) / 100;

/** How much the contact's run-off grows by on a click near its edge. */
export const RUNOFF_STEP = 2;
/** The deepest the contact's run-off is ever drawn. */
export const MAX_RUNOFF = USUAL_RUNOFF + 4 * RUNOFF_STEP; // 11.5
/** A contact this close to the run-off's back edge grows it. */
export const RUNOFF_EDGE = 0.5;

/**
 * The run-off a contact `depth` metres behind the baseline needs drawn: the
 * usual 3.5 m, else the usual plus whole steps until the contact sits clear
 * of the edge zone. Capped at {@link MAX_RUNOFF}.
 */
export function runoffFor(depth: number): number {
  let runoff = USUAL_RUNOFF;
  while (depth > runoff - RUNOFF_EDGE && runoff < MAX_RUNOFF) {
    runoff += RUNOFF_STEP;
  }
  return Math.min(runoff, MAX_RUNOFF);
}

/**
 * The run-off the contact's box draws for `state`: what clicks grew it to,
 * or what the stored contact (`contactY`) needs, whichever is deeper. The
 * usual 3.5 m while placing a landing.
 */
export function placementRunoff(
  state: PlacementState,
  contactY: number | null,
): number {
  if (state.target !== "contact") return USUAL_RUNOFF;
  const stored =
    contactY === null
      ? USUAL_RUNOFF
      : runoffFor(behindBaseline(state.half, contactY));
  return Math.max(state.runoff ?? USUAL_RUNOFF, stored);
}

/** How the box on screen has slid, at the same size, or null for the half's own. */
export type CourtSlide =
  | {
      kind: "deep";
      /** Metres of `y` at the box's top edge. */
      top: number;
      /** The half whose baseline the run-off is behind. */
      half: CourtHalf;
      /** Metres of run-off drawn behind that baseline. */
      runoff: number;
    }
  | {
      kind: "shank";
      top: number;
      /** The hitter's half: the ball came down on it. */
      half: CourtHalf;
    };

/**
 * The slide for the selected stroke, while placing it:
 *
 * - its contact, with the run-off past the usual (`placementRunoff`): the
 *   half's box slid back so its edge is that far behind the baseline;
 * - its landing, unflipped, when the stored landing is on the hitter's own
 *   side (`landedOnOwnSide`): the box slid across the net so that side shows
 *   (`shankWindowTop`).
 *
 * Null otherwise — the half's own box.
 */
export function courtSlide(
  state: PlacementState,
  shot: ShotEnds | null,
): CourtSlide | null {
  if (state.shotId === null || !shot) return null;
  if (state.target === "contact") {
    const runoff = placementRunoff(state, shot.contactY ?? null);
    if (runoff <= USUAL_RUNOFF) return null;
    return {
      kind: "deep",
      top: runoffWindowTop(state.half, runoff),
      half: state.half,
      runoff,
    };
  }
  if (state.flipped || !landedOnOwnSide(shot) || shot.contactY == null) {
    return null;
  }
  const hitter = halfOf(shot.contactY);
  return {
    kind: "shank",
    top: shankWindowTop(hitter, shot.landingY ?? null),
    half: hitter,
  };
}

/**
 * One court click: the patch it writes to the selected stroke and the state the
 * next click starts from. Null when no stroke is selected.
 *
 * When the click leaves `shot` with both a contact and a landing, the patch
 * also carries the `result` those coordinates derive (shot-derived.ts); a
 * stroke still missing an end keeps its stored value. The next state's half
 * follows the click: after a contact the landing is across the net, after a
 * landing the contact is back on the hitter's half.
 *
 * A contact clicked within {@link RUNOFF_EDGE} of the run-off's back edge is
 * written as clicked, and the contact stays armed with the run-off grown by
 * {@link RUNOFF_STEP}: the box slides back, so the next click can go deeper.
 */
export function nextPlacement(
  state: PlacementState,
  point: CourtPoint,
  shot: ShotPosition,
): { state: PlacementState; patch: LabelShotPatch } | null {
  if (state.shotId === null) return null;
  const x = toCm(point.x);
  const y = toCm(point.y);
  const patch = positionPatch(shot, state.target, { x, y });
  if (state.target === "contact") {
    const runoff = placementRunoff(state, shot.contact_y);
    const depth = behindBaseline(state.half, y);
    if (depth > runoff - RUNOFF_EDGE && runoff < MAX_RUNOFF) {
      return {
        state: { ...state, runoff: Math.min(MAX_RUNOFF, runoff + RUNOFF_STEP) },
        patch,
      };
    }
  }
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
  return { state: next, patch };
}

/** The two `unclear` names of a placement end: `contact_x`, `contact_y`. */
export function endFields(
  target: PlacementTarget,
): [LabelShotValueField, LabelShotValueField] {
  return target === "contact"
    ? ["contact_x", "contact_y"]
    : ["landing_x", "landing_y"];
}

/** Whether `unclear` calls `target`'s position an estimate (either name). */
export function isEstimate(
  unclear: readonly string[],
  target: PlacementTarget,
): boolean {
  const [fx, fy] = endFields(target);
  return unclear.includes(fx) || unclear.includes(fy);
}

/**
 * The `unclear` list the "Off screen, so this is an estimate" box writes for
 * `target`: both of its names added, or both taken out; every other name as
 * it was. The list replaces the stored one whole (edit.ts).
 */
export function estimatePatch(
  unclear: readonly string[],
  target: PlacementTarget,
  estimate: boolean,
): LabelShotPatch {
  const fields = endFields(target);
  const rest = unclear.filter(
    (field) => !(fields as readonly string[]).includes(field),
  ) as LabelShotValueField[];
  return { unclear: estimate ? [...rest, ...fields] : rest };
}

/**
 * What the next click will do, for the court's accessible name. `shotNumber`
 * is the number the rail shows the stroke under (live strokes, 1…n).
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

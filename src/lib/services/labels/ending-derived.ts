/**
 * What a labelled point's strokes already say about how it ended. Pure; the
 * console calls it around every shot change (`syncEnding`).
 *
 * The last ball also settles who won: a ball that missed gives the point to the
 * other side, a ball marked in gives it to its hitter. A last ball with no
 * result yet settles nothing; there the labelled `winner` is read and never
 * written.
 */

import type { LabelPointPatch } from "./edit";
import {
  isMissedResult,
  isServeStroke,
  opponent,
  orderLabelShots,
  type LabelEnding,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
} from "./session";

export interface DerivedEnding {
  ending: LabelEnding;
  /** The last live stroke's hitter. */
  endedBy: LabelSide | null;
  /**
   * Who the rows say won: the other side from a last stroke that missed, the
   * hitter of one marked in. Null when the rows do not settle it (the last
   * stroke has no result yet, or names no hitter).
   */
  winner: LabelSide | null;
}

type EndingPoint = Pick<LabelPoint, "winner" | "shots">;

/**
 * The ending the point's live (non-deleted) strokes describe, read in video
 * order off the LAST of them:
 *
 * - no live stroke → `null`
 * - a serve that missed → `double_fault` when it is a second serve or an
 *   earlier live serve exists; a lone faulted first serve says nothing → `null`
 * - a serve otherwise (in, or no result yet) → `ace`: nothing came back
 * - any other stroke that missed → `service_winner` when it is the stroke
 *   right after the serve (the return), else `error`
 * - any other stroke marked in → `winner`, by its hitter
 * - any other stroke with no result yet → `winner` when its hitter is the
 *   point's labelled `winner` or no winner is labelled, else `error`
 */
export function deriveEnding(point: EndingPoint): DerivedEnding | null {
  const live = orderLabelShots(
    point.shots.filter((shot) => shot.status !== "deleted"),
  );
  const last = live.at(-1);
  if (!last) return null;
  const endedBy = last.hitter;
  const earlier = live.slice(0, -1);

  if (isServeStroke(last.stroke)) {
    if (!isMissedResult(last.result)) {
      return { ending: "ace", endedBy, winner: wonBy(last) };
    }
    return last.stroke === "second_serve" ||
      earlier.some((shot) => isServeStroke(shot.stroke))
      ? { ending: "double_fault", endedBy, winner: lostBy(endedBy) }
      : null;
  }

  if (isMissedResult(last.result)) {
    const previous = earlier.at(-1);
    return {
      ending:
        previous && isServeStroke(previous.stroke) ? "service_winner" : "error",
      endedBy,
      winner: lostBy(endedBy),
    };
  }

  if (last.result === "in") {
    return { ending: "winner", endedBy, winner: wonBy(last) };
  }

  return {
    ending:
      point.winner === null || last.hitter === point.winner
        ? "winner"
        : "error",
    endedBy,
    winner: null,
  };
}

/** The hitter of a last stroke marked in; null with no result or no hitter. */
function wonBy(last: Pick<LabelShot, "result" | "hitter">): LabelSide | null {
  return last.result === "in" ? last.hitter : null;
}

/** The side that won a point its `hitter` just lost; null with no hitter. */
function lostBy(hitter: LabelSide | null): LabelSide | null {
  return hitter === null ? null : opponent(hitter);
}

/** Endings that say the point was not played out — no stroke rewrites them. */
const HELD_ENDINGS: readonly (LabelEnding | null)[] = [
  "let_replayed",
  "not_a_point",
];

/**
 * The point patch a shot change calls for, or `null`. `before` and `after` are
 * the same point around one shot change.
 *
 * A patch is due only when the change moved the derived ending (so an ending
 * set by hand survives edits that leave the rows saying the same thing), the
 * new one is not null or what the point already holds, and the point is not a
 * let or a non-point. When the rows now settle who won and the point says
 * otherwise, the patch carries the `winner` too.
 */
export function endingPatchForShotChange(
  before: EndingPoint,
  after: EndingPoint & Pick<LabelPoint, "ending" | "endedBy">,
): Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> | null {
  if (HELD_ENDINGS.includes(after.ending)) return null;
  const was = deriveEnding(before);
  const now = deriveEnding(after);
  if (!now) return null;
  if (
    was &&
    was.ending === now.ending &&
    was.endedBy === now.endedBy &&
    was.winner === now.winner
  ) {
    return null;
  }
  const patch: Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> = {};
  if (after.ending !== now.ending || after.endedBy !== now.endedBy) {
    patch.ending = now.ending;
    patch.ended_by = now.endedBy;
  }
  if (now.winner !== null && after.winner !== now.winner) {
    patch.winner = now.winner;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * What a labelled point's strokes already say about how it ended, so a
 * labeller who corrects the shot rows never also has to re-pick "How it
 * ended" by hand.
 *
 * Pure and import-free of anything server-side — the `"use client"` console
 * calls it around every shot change (label-console.tsx `syncEnding`).
 *
 * It reads the rows and the labelled `winner`; it never writes the winner.
 * Where the two disagree (the last ball went out, but its hitter is labelled
 * as having won the point) the ending follows the rows and the winner is left
 * for the labeller.
 */

import type { LabelPointPatch } from "./edit";
import {
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
}

type EndingPoint = Pick<LabelPoint, "winner" | "shots">;

function isServe(shot: Pick<LabelShot, "stroke">): boolean {
  return shot.stroke === "first_serve" || shot.stroke === "second_serve";
}

function missed(shot: Pick<LabelShot, "result">): boolean {
  return shot.result === "out" || shot.result === "net";
}

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
 * - any other stroke that stayed in (or has no result yet) → `winner` when its
 *   hitter is the point's labelled `winner` or no winner is labelled, else
 *   `error`
 */
export function deriveEnding(point: EndingPoint): DerivedEnding | null {
  const live = orderLabelShots(
    point.shots.filter((shot) => shot.status !== "deleted"),
  );
  const last = live.at(-1);
  if (!last) return null;
  const endedBy = last.hitter;
  const earlier = live.slice(0, -1);

  if (isServe(last)) {
    if (!missed(last)) return { ending: "ace", endedBy };
    return last.stroke === "second_serve" || earlier.some(isServe)
      ? { ending: "double_fault", endedBy }
      : null;
  }

  if (missed(last)) {
    const previous = earlier.at(-1);
    return {
      ending: previous && isServe(previous) ? "service_winner" : "error",
      endedBy,
    };
  }

  return {
    ending:
      point.winner === null || last.hitter === point.winner
        ? "winner"
        : "error",
    endedBy,
  };
}

/** Endings that say the point was not played out — no stroke rewrites them. */
const HELD_ENDINGS: readonly (LabelEnding | null)[] = [
  "let_replayed",
  "not_a_point",
];

/**
 * The point patch a shot change calls for, or `null` when it calls for none.
 *
 * `before` and `after` are the same point around one shot change. A patch is
 * due only when the change MOVED the derived ending — so an ending set by hand
 * survives every shot edit that leaves the rows saying the same thing — and
 * the new one is not null, not what the point already holds, and the point is
 * not a let or a non-point.
 */
export function endingPatchForShotChange(
  before: EndingPoint,
  after: EndingPoint & Pick<LabelPoint, "ending" | "endedBy">,
): Pick<LabelPointPatch, "ending" | "ended_by"> | null {
  if (HELD_ENDINGS.includes(after.ending)) return null;
  const was = deriveEnding(before);
  const now = deriveEnding(after);
  if (!now) return null;
  if (was && was.ending === now.ending && was.endedBy === now.endedBy) {
    return null;
  }
  if (after.ending === now.ending && after.endedBy === now.endedBy) return null;
  return { ending: now.ending, ended_by: now.endedBy };
}

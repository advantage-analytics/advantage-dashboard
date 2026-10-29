/**
 * What a labelled point's strokes already say about how it ended. Pure; the
 * server runs it around every shot write (ending-session.ts) and the console
 * reads it for the "Different ending?" hint (marks-state.ts).
 *
 * The last ball also settles who won: a ball that missed gives the point to the
 * other side, a ball marked in gives it to its hitter. A last ball with no
 * result yet settles nothing; there the labelled `winner` is read and never
 * written.
 *
 * `ghosts` says whether a stroke the site removed (`isGhostShot`) is still a
 * ghost — no stroke at all — or, on a session labelled without marks, an
 * ordinary stroke: the same flag `pointEndedEarly` and the volley link take.
 */

import type { LabelPointPatch } from "./edit";
import {
  isMissedResult,
  isNonPointEnding,
  isLetServe,
  isServeStroke,
  liveShotsInOrder,
  opponent,
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
 * The ending the point's live strokes (`isLiveShot`: no tombstone, and no
 * ghost while `ghosts` is on) describe, read in video order off the LAST of
 * them. A let serve (`result: "let"`) is replayed, not played: it is skipped
 * as if absent, so it never ends a point and never makes the serve after it a
 * second one.
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
export function deriveEnding(
  point: EndingPoint,
  ghosts: boolean,
): DerivedEnding | null {
  const live = liveShotsInOrder(point, ghosts).filter(
    (shot) => !isLetServe(shot),
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

/**
 * Whether a point can be marked forced or unforced (`label_points.error_kind`):
 * only when its live strokes say it ended in an error — `deriveEnding()` is
 * `"error"`. A missed return (`service_winner`), a double fault, an ace or a
 * winner is not markable, nor a point whose rows settle nothing, nor a
 * replayed let or non-point (whatever the strokes say, it was not played
 * out), nor a deleted point.
 */
export function isMarkableError(
  point: EndingPoint &
    Pick<LabelPoint, "ending"> &
    Partial<Pick<LabelPoint, "status">>,
  ghosts: boolean,
): boolean {
  if (point.status === "deleted") return false;
  if (isNonPointEnding(point.ending)) return false;
  return deriveEnding(point, ghosts)?.ending === "error";
}

/** The hitter of a last stroke marked in; null with no result or no hitter. */
function wonBy(last: Pick<LabelShot, "result" | "hitter">): LabelSide | null {
  return last.result === "in" ? last.hitter : null;
}

/** The side that won a point its `hitter` just lost; null with no hitter. */
function lostBy(hitter: LabelSide | null): LabelSide | null {
  return hitter === null ? null : opponent(hitter);
}

/**
 * The shot fields whose change can move what the strokes say about how the
 * point ended: the only ones a shot write settles the ending after
 * (edit-session.ts), and the only ones the console settles it ahead of.
 */
export const SHOT_FIELDS_MOVING_ENDING = [
  "hitter",
  "stroke",
  "result",
  "video_time",
] as const;

/**
 * The point patch a shot change calls for, or `null`. `before` and `after` are
 * the same point around one shot change.
 *
 * A patch is due only when the change moved the derived ending (so an ending
 * set by hand survives edits that leave the rows saying the same thing), the
 * new one is not null or what the point already holds, and the point is not a
 * let or a non-point. When the rows now settle who won and the point says
 * otherwise, the patch carries the `winner` too.
 *
 * One patch is due even when the derived ending did not move: the rows settle
 * a winner and the point holds the other player. That is not a hand-set
 * ending surviving, it is a contradiction — "error by Quan", won by Quan —
 * left by a write from before the winner was kept in step, and a labeller who
 * re-saves the stroke is asking for it to be put right. The winner alone
 * moves and the stored ending stays. Not for an edit further back in the
 * rally that left the last shot as it was: a winner set by hand stands.
 */
export function endingPatchForShotChange(
  before: EndingPoint,
  after: EndingPoint & Pick<LabelPoint, "ending" | "endedBy">,
  ghosts: boolean,
): Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> | null {
  if (isNonPointEnding(after.ending)) return null;
  const was = deriveEnding(before, ghosts);
  const now = deriveEnding(after, ghosts);
  if (!now) return null;
  if (
    was &&
    was.ending === now.ending &&
    was.endedBy === now.endedBy &&
    was.winner === now.winner
  ) {
    return winnerContradicted(after, now) &&
      !editedEarlierShot(before, after, ghosts)
      ? { winner: now.winner }
      : null;
  }
  return endingPatchTo(after, now);
}

/**
 * Whether the edit moved a shot before the last and left the last as it was.
 * Every field counts: a placement or a time is as much an edit as a stroke.
 * A re-save that changed nothing, or one of the last shot, is the labeller
 * standing behind the rally's end; an edit further back is not.
 */
function editedEarlierShot(
  before: EndingPoint,
  after: EndingPoint,
  ghosts: boolean,
): boolean {
  const keys = (point: EndingPoint) =>
    liveShotsInOrder(point, ghosts)
      .filter((shot) => !isLetServe(shot))
      .map((shot) => JSON.stringify(shot));
  const was = keys(before);
  const now = keys(after);
  return was.join("\n") !== now.join("\n") && was.at(-1) === now.at(-1);
}

/**
 * Whether the rows settle who won and the point holds the other player: a
 * last ball that missed with its own hitter as the winner, or one marked in
 * with the other. Never true while the rows settle nothing, or no winner is
 * labelled yet.
 */
export function winnerContradicted(
  point: Pick<LabelPoint, "winner">,
  derived: DerivedEnding | null,
): derived is DerivedEnding & { winner: LabelSide } {
  return (
    derived !== null &&
    derived.winner !== null &&
    point.winner !== null &&
    point.winner !== derived.winner
  );
}

/**
 * The patch that brings a point's ending and ended-by to `now`, the winner
 * with them when `now` settles one the point does not hold (and
 * `settleWinner` is on); null when nothing differs.
 */
export function endingPatchTo(
  point: Pick<LabelPoint, "ending" | "endedBy" | "winner">,
  now: DerivedEnding,
  settleWinner = true,
): Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> | null {
  const patch: Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> = {};
  if (point.ending !== now.ending || point.endedBy !== now.endedBy) {
    patch.ending = now.ending;
    patch.ended_by = now.endedBy;
  }
  if (settleWinner && now.winner !== null && point.winner !== now.winner) {
    patch.winner = now.winner;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The ending a point publishes with. A stored ending is the labeller's, as
 * is. With none stored, the strokes decide it by the rule the console's
 * "Make it …" hint offers (`deriveEnding`, ghosts on, as `endingStale`); a
 * point with no played stroke at all is one the score says happened off the
 * video — written with its winner and server and nothing else; and strokes
 * that settle nothing leave it `unresolved`, which the publish refuses.
 * The Mark complete confirm reads the same answer (`completeWarnings`).
 */
export type PublishEnding =
  | { kind: "stored"; ending: LabelEnding; endedBy: LabelSide | null }
  | {
      kind: "derived";
      ending: LabelEnding;
      endedBy: LabelSide | null;
      winner: LabelSide | null;
    }
  | { kind: "off_video" }
  | { kind: "unresolved" };

export function publishEnding(
  point: Pick<LabelPoint, "ending" | "endedBy" | "winner" | "shots">,
): PublishEnding {
  if (point.ending !== null) {
    return { kind: "stored", ending: point.ending, endedBy: point.endedBy };
  }
  const played = liveShotsInOrder(point, true).filter(
    (shot) => !isLetServe(shot),
  );
  if (played.length === 0) return { kind: "off_video" };
  const derived = deriveEnding(point, true);
  return derived ? { kind: "derived", ...derived } : { kind: "unresolved" };
}

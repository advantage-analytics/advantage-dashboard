/**
 * What "Mark complete" warns is still open, as plain sentences — the confirm
 * lists them and completes anyway on a yes (the labeller's call, not a gate).
 * Read off the same pure rules the rail draws from: the points left to check
 * (`labelProgress`), the marks still open (`markSummary`), every game the
 * rows leave unfinished or run past its end (`labelSetScores`, which takes in
 * the session's last game too), and the entered score the labelled sets
 * disagree with (`scoreMismatch`) — not once the labeller has said the video
 * ends early, as the rail's chip — and each tiebreak off its serve order
 * (`tiebreakServeOrders`). Last, how the publish will read each point
 * with no ending stored (`publishEnding`, the rule apply.ts writes by): taken
 * from its strokes, written as score only off the video, published with no
 * ending, or left out — never refused.
 */

import { publishEnding } from "./ending-derived";
import type { LabelMarks } from "./marks";
import { ownedEndingPhrase, type MarkNames } from "./marks-copy";
import { markSummary } from "./marks-state";
import { labelScores, type LabelGameBand } from "./score";
import { enteredScore, labelSetScores, scoreMismatch } from "./set-scores";
import type { MatchScore } from "@/lib/services/splitstep/derivation";
import {
  isNonPointEnding,
  labelProgress,
  type LabelPoint,
  type LabelStartScore,
} from "./session";
import { setBreakSuspects, setBreakWarning } from "./set-break";
import { tiebreakServeOrders } from "./tiebreak-serve";
import { foldedPointIds, gameServeRepeats } from "./game-serve-order";
import { tiebreakFolds } from "./tiebreak-fold";

export interface CompleteWarningInput {
  points: readonly LabelPoint[];
  adScoring: boolean;
  /** Null on a session labelled without marks: no mark is counted. */
  marks: LabelMarks | null;
  finalScore: readonly (readonly number[])[] | null;
  videoEndsEarly: boolean | null;
  matchScore: MatchScore | null;
  /**
   * `labelScores(points, adScoring).games`, when the caller has scored them
   * already (the console's `scores`); scored here otherwise.
   */
  games?: readonly LabelGameBand[];
  /** Who an ending is by, in the publish lines: "an error by Quan". */
  names?: MarkNames;
  /** set-scores.ts `matchTiebreakSet`: its split games are the fold's, not a repeat. */
  matchTiebreakSet?: number | null;
  /** Where the video starts in the match; missing or null: at the beginning. */
  startScore?: LabelStartScore | null;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The tails `completeWarnings` ends a point's sentence with when a publish
 * writes it only partly or leaves it out. The Labels dashboard matches on
 * them (label-dashboard.tsx), so the wording lives here once.
 */
export const PUBLISHED_PAST_TAILS = {
  leftOut: ", so it is left out",
  noEnding: " — it publishes with no ending",
  labelledWinner: " — it publishes with the labelled winner",
} as const;

/** The open items, most general first; empty when nothing is left. */
export function completeWarnings(input: CompleteWarningInput): string[] {
  const { points, adScoring, marks } = input;
  const warnings: string[] = [];

  const { checked, total } = labelProgress(points);
  if (checked < total) {
    warnings.push(
      `${plural(total - checked, "point")} of ${total} not checked`,
    );
  }

  if (marks) {
    const { open, openPoints } = markSummary(points, marks);
    if (open > 0) {
      warnings.push(
        `${plural(open, "mark")} still open on ${plural(openPoints, "point")}`,
      );
    }
  }

  const start = input.startScore ?? null;
  const sets = labelSetScores(
    points,
    input.games ?? labelScores(points, adScoring, start).games,
    start,
  );
  const several = sets.length > 1;
  for (const set of sets) {
    const where = (gameInSet: number) =>
      several ? `Set ${set.setNumber}, game ${gameInSet}` : `Game ${gameInSet}`;
    for (const game of set.unfinished) {
      warnings.push(`${where(game.gameInSet)} unfinished (${game.score})`);
    }
    for (const game of set.overflow) {
      warnings.push(
        `${where(game.gameInSet)} has ${plural(game.extra, "extra point")}`,
      );
    }
  }

  for (const order of tiebreakServeOrders(points)) {
    const name =
      order.type === "tiebreak"
        ? `Set ${order.game.setNumber}'s tiebreak`
        : "The match tiebreak";
    warnings.push(
      `${name} is off its serve order on ${plural(order.off.length, "point")}`,
    );
  }

  const folded = foldedPointIds(
    tiebreakFolds(points, adScoring, input.matchTiebreakSet ?? null),
  );
  for (const repeat of gameServeRepeats(points, folded)) {
    const games = [repeat.gameInSet, repeat.other.gameInSet].sort(
      (a, b) => a - b,
    );
    warnings.push(
      `Set ${repeat.game.setNumber}: the same player serves games ${games[0]} and ${games[1]}`,
    );
  }

  if (input.videoEndsEarly !== true) {
    const mismatch = scoreMismatch(
      sets,
      enteredScore(input.finalScore, input.matchScore),
    );
    // The set's unfinished and run-over games are listed above already.
    if (mismatch) {
      warnings.push(
        // Marks off, the publish takes the score as it is (apply-session.ts).
        `Set ${mismatch.setNumber} labelled ${mismatch.labelled}, the match record says ${mismatch.entered}${marks ? " — it publishes as labelled" : ""}`,
      );
    }
  }

  for (const suspect of setBreakSuspects(points)) {
    warnings.push(setBreakWarning(suspect));
  }

  const names = input.names ?? { p1: "player 1", p2: "player 2" };
  for (const point of points) {
    if (point.status === "deleted" || isNonPointEnding(point.ending)) continue;
    const at = `Point ${point.pointIndex + 1}`;
    const resolved = publishEnding(point);
    if (
      resolved.kind === "derived" &&
      resolved.winner !== null &&
      resolved.winner !== point.winner
    ) {
      warnings.push(
        `${at}'s strokes say ${names[resolved.winner]} won, not the labelled winner${PUBLISHED_PAST_TAILS.labelledWinner}`,
      );
    } else if (resolved.kind === "derived") {
      warnings.push(
        `${at}'s ending will be taken from its strokes (${ownedEndingPhrase(resolved.ending, resolved.endedBy, resolved.winner, names)})`,
      );
    } else if (resolved.kind === "off_video") {
      warnings.push(
        point.winner !== null && point.server !== null
          ? `${at} isn't on the video and will publish as score only`
          : `${at} has no strokes and no ${point.winner === null ? "winner" : "server"}${PUBLISHED_PAST_TAILS.leftOut}`,
      );
    } else if (resolved.kind === "unresolved") {
      warnings.push(
        `${at} has no ending its strokes can settle${PUBLISHED_PAST_TAILS.noEnding}`,
      );
    }
  }
  return warnings;
}

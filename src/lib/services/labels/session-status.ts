/**
 * What "Mark complete" warns is still open, as plain sentences — the confirm
 * lists them and completes anyway on a yes (the labeller's call, not a gate).
 * Read off the same pure rules the rail draws from: the points left to check
 * (`labelProgress`), the marks still open (`markSummary`), every game the
 * rows leave unfinished or run past its end (`labelSetScores`, which takes in
 * the session's last game too), and the entered score the labelled sets
 * disagree with (`scoreMismatch`) — not once the labeller has said the video
 * ends early, as the rail's chip.
 */

import type { LabelMarks } from "./marks";
import { markSummary } from "./marks-state";
import { labelScores, type LabelGameBand } from "./score";
import { enteredScore, labelSetScores, scoreMismatch } from "./set-scores";
import type { MatchScore } from "@/lib/services/splitstep/derivation";
import { labelProgress, type LabelPoint } from "./session";

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
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

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

  const sets = labelSetScores(
    points,
    input.games ?? labelScores(points, adScoring).games,
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

  if (input.videoEndsEarly !== true) {
    const mismatch = scoreMismatch(
      sets,
      enteredScore(input.finalScore, input.matchScore),
    );
    // The set's unfinished and run-over games are listed above already.
    if (mismatch) {
      warnings.push(
        `Set ${mismatch.setNumber} labelled ${mismatch.labelled}, entered ${mismatch.entered}`,
      );
    }
  }
  return warnings;
}

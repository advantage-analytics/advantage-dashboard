/**
 * The two marks that follow the LABELLED score: "Wrong side for the score"
 * (`score_side_mismatch`) and "Same side twice" (`service_court_repeat`, with
 * its `missing_point` suggestion). The derivation raises both against the
 * vendor's score; here they are read off the console's rows on every render,
 * the side each serve was hit from (`LabelMarks.serveSides`) against the side
 * the labelled score before the point expects (score.ts). Gone when the two
 * agree.
 *
 * - Expected side: an even number of counted points played in the game → deuce,
 *   odd → ad; the same parity in a tiebreak. None at 40–40 under no-ad, or once
 *   an ordinary game is already decided (`gameDecided`). Lets and `not_a_point`
 *   rows do not move the score.
 * - Once per game: one wrong winner flips the parity of every later point, so
 *   only the first mismatching point carries the mark.
 * - Repeat: two consecutive live points of one game served from one known side.
 *   Not when the second sits at 40–40 under no-ad, not across a let, and never
 *   through a point with no known side (an added point has none, which is how
 *   "Add point" answers it). A `not_a_point` row is neither a point nor a
 *   break.
 *
 * `withLiveScoreMarks` also runs `liveRowMarks`, the one other `count` mark
 * read off the rows: "Ending can't be read" (`lastShotUnresolved`,
 * marks-state.ts) on a point whose strokes it is handed.
 */

import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
import { lastShotUnresolved } from "./marks-state";
import { gameDecided, gameKey, isCountedPoint, labelScores } from "./score";
import type {
  LabelGameType,
  LabelPoint,
  LabelServeSide,
  LabelSide,
} from "./session";

/** What the two marks read of a point. A `LabelPoint` satisfies it. */
export type ScoreMarkPoint = Pick<
  LabelPoint,
  | "id"
  | "pointIndex"
  | "status"
  | "setNumber"
  | "gameNumber"
  | "server"
  | "winner"
  | "ending"
  | "gameType"
>;

/** The marks and suggestions the labelled score raises, by point id. */
export interface LiveScoreMarks {
  points: Record<string, LabelMark[]>;
  suggestions: LabelSuggestion[];
}

interface GameRun {
  type: LabelGameType;
  points: Record<LabelSide, number>;
  decided: boolean;
  /** A point of this game already carries "Wrong side for the score". */
  mismatched: boolean;
  /** The last live point of the game with a known side, for the repeat. */
  previous: {
    id: string;
    side: LabelServeSide;
    number: number;
    let: boolean;
  } | null;
}

/** Points played so far, as a side — or null where no side is expected. */
function expectedSide(run: GameRun, adScoring: boolean): LabelServeSide | null {
  const { p1, p2 } = run.points;
  if (run.type === "game") {
    if (run.decided) return null;
    // 40–40 under no-ad: the receiver picks the side.
    if (!adScoring && p1 >= 3 && p2 >= 3 && p1 === p2) return null;
  }
  return (p1 + p2) % 2 === 0 ? "deuce" : "ad";
}

/** 40–40 before the point, where no-ad lets the receiver choose. */
function decidingPoint(run: GameRun, adScoring: boolean): boolean {
  const { p1, p2 } = run.points;
  return !adScoring && run.type === "game" && p1 >= 3 && p2 >= 3 && p1 === p2;
}

/** Read the two marks off the rows (rail order, tombstones included). */
export function liveScoreMarks(
  points: readonly ScoreMarkPoint[],
  adScoring: boolean,
  serveSides: Readonly<Record<string, LabelServeSide>>,
  scores = labelScores(points, adScoring),
): LiveScoreMarks {
  const out: LiveScoreMarks = { points: {}, suggestions: [] };
  const runs = new Map<string, GameRun>();

  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    let run = runs.get(key);
    if (!run) {
      run = {
        type: point.gameType ?? "game",
        points: { p1: 0, p2: 0 },
        decided: false,
        mismatched: false,
        previous: null,
      };
      runs.set(key, run);
    }

    if (point.ending !== "not_a_point") {
      const actual = serveSides[point.id] ?? null;
      const expected = expectedSide(run, adScoring);
      if (
        !run.mismatched &&
        actual !== null &&
        expected !== null &&
        actual !== expected
      ) {
        run.mismatched = true;
        (out.points[point.id] ??= []).push({
          code: "score_side_mismatch",
          tier: "count",
          scope: "point",
          params: {
            score: scores.points.get(point.id)?.scoreBefore ?? null,
            expected,
            actual,
          },
        });
      }

      if (actual === null) {
        run.previous = null;
      } else {
        const let_ = point.ending === "let_replayed";
        const before = run.previous;
        if (
          before &&
          before.side === actual &&
          !before.let &&
          !let_ &&
          !run.decided &&
          !decidingPoint(run, adScoring)
        ) {
          (out.points[point.id] ??= []).push({
            code: "service_court_repeat",
            tier: "count",
            scope: "point",
            params: { side: actual },
          });
          out.suggestions.push({
            kind: "missing_point",
            key: "missing_point",
            pointId: point.id,
            beforePointId: before.id,
            side: actual,
            pointNumbers: [before.number, point.pointIndex + 1],
          });
        }
        run.previous = {
          id: point.id,
          side: actual,
          number: point.pointIndex + 1,
          let: let_,
        };
      }
    }

    if (isCountedPoint(point)) {
      run.points[point.winner] += 1;
      if (
        run.type === "game" &&
        !run.decided &&
        gameDecided(run.points, adScoring)
      ) {
        run.decided = true;
      }
    }
  }

  return out;
}

/** A point `liveRowMarks` can read: its strokes, when the caller has them. */
export type RowMarkPoint = Pick<LabelPoint, "id" | "status"> &
  Partial<Pick<LabelPoint, "shots">>;

/**
 * "Ending can't be read" on every live point whose last stroke has neither a
 * landing nor a result, by point id. A point handed without its strokes (the
 * scorecard's seeded rows) raises nothing. Ghosts are not strokes here, as in
 * the console.
 */
export function liveRowMarks(
  points: readonly RowMarkPoint[],
): Record<string, LabelMark[]> {
  const out: Record<string, LabelMark[]> = {};
  for (const point of points) {
    if (point.status === "deleted" || !point.shots) continue;
    const mark = lastShotUnresolved({ shots: point.shots }, true);
    if (mark) out[point.id] = [mark];
  }
  return out;
}

/**
 * The session's marks with the two score marks read off the live rows, then
 * `liveRowMarks`, appended after each point's other marks, and the score
 * marks' `missing_point` suggestions after the file's. Everything else passes
 * through untouched.
 */
export function withLiveScoreMarks(
  marks: LabelMarks,
  points: readonly (ScoreMarkPoint & RowMarkPoint)[],
  adScoring: boolean,
  scores?: ReturnType<typeof labelScores>,
): LabelMarks {
  const live = liveScoreMarks(points, adScoring, marks.serveSides, scores);
  const merged: Record<string, LabelMark[]> = { ...marks.points };
  for (const list of [live.points, liveRowMarks(points)]) {
    for (const [id, own] of Object.entries(list)) {
      merged[id] = [...(merged[id] ?? []), ...own];
    }
  }
  return {
    ...marks,
    points: merged,
    suggestions: [...marks.suggestions, ...live.suggestions],
  };
}

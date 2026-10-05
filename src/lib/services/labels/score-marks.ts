/**
 * The two marks that follow the LABELLED score: "Wrong side for the score"
 * (`score_side_mismatch`) and "Same side twice" (`service_court_repeat`,
 * with its `missing_point` suggestion).
 *
 * The derivation raises both against the vendor's score, which is the thing
 * the labeller is here to correct — so a flag read off the file keeps
 * describing a score that no longer stands once a winner is changed or a
 * missed point added. Here they are read off the console's own rows instead,
 * on every render: the side each serve was actually hit from comes from the
 * vendor file (`LabelMarks.serveSides`, marks.ts), the side it SHOULD have
 * come from is the labelled score before the point (score.ts's arithmetic),
 * and the two are compared. The result is a live fact: present while the
 * labelled score disagrees with the serve, gone the moment it agrees — the
 * one exception to "a flag goes grey, never away" (marks-state.ts), asked
 * for by the labeller: fix the score and the flag should go.
 *
 * The rules mirror the derivation's (flags.ts):
 *
 * - **Expected side.** Even number of points already played in the game →
 *   deuce; odd → ad. In a tiebreak the same parity, over the raw point
 *   count. Under no-ad at 40–40 the receiver chooses, so no expectation
 *   there. Once an ordinary game is already decided (score.ts `gameDecided`)
 *   the rows past its end read "Game–30" and the overflow slot owns them: no
 *   expectation either.
 * - **Repeat.** Two consecutive live points of one game served from one
 *   known side. Not when the second sits at 40–40 under no-ad, not across a
 *   let (the point was replayed from the same side, as it should be), and
 *   never through a point with no known side — an added point has none, so
 *   it raises nothing and breaks a repeat, which is exactly how "Add point"
 *   answers the question. A `not_a_point` row is neither a point nor a break.
 *
 * Lets and `not_a_point` rows do not move the score (score.ts
 * `isCountedPoint`), so the point after one is expected from the same side.
 *
 * Pure, and importable from the client bundle: nothing from `next/`,
 * `components/` or a server file.
 */

import type { LabelMark, LabelMarks, LabelSuggestion } from "./marks";
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

/**
 * Read the two marks off the rows. `points` are the console's rows in rail
 * order, tombstones included; `serveSides` is `LabelMarks.serveSides`.
 */
export function liveScoreMarks(
  points: readonly ScoreMarkPoint[],
  adScoring: boolean,
  serveSides: Readonly<Record<string, LabelServeSide>>,
): LiveScoreMarks {
  const out: LiveScoreMarks = { points: {}, suggestions: [] };
  const scores = labelScores(points, adScoring).points;
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
        previous: null,
      };
      runs.set(key, run);
    }

    if (point.ending !== "not_a_point") {
      const actual = serveSides[point.id] ?? null;
      const expected = expectedSide(run, adScoring);
      if (actual !== null && expected !== null && actual !== expected) {
        (out.points[point.id] ??= []).push({
          code: "score_side_mismatch",
          kind: "flag",
          scope: "point",
          params: {
            score: scores.get(point.id)?.scoreBefore ?? null,
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
            kind: "flag",
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

/**
 * The session's marks with the two score flags read off the LIVE rows
 * appended after each point's other marks, and their `missing_point`
 * suggestions after the file's. The file emits neither (marks.ts), so this
 * is the one place they come from; everything else — the shot marks, the
 * other suggestions, `serveSides` — passes through untouched.
 */
export function withLiveScoreMarks(
  marks: LabelMarks,
  points: readonly ScoreMarkPoint[],
  adScoring: boolean,
): LabelMarks {
  const live = liveScoreMarks(points, adScoring, marks.serveSides);
  const merged: Record<string, LabelMark[]> = { ...marks.points };
  for (const [id, list] of Object.entries(live.points)) {
    merged[id] = [...(merged[id] ?? []), ...list];
  }
  return {
    ...marks,
    points: merged,
    suggestions: [...marks.suggestions, ...live.suggestions],
  };
}

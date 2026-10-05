/**
 * The match's set scores as the labelled points make them, held against the
 * score that was entered — the "Score doesn't add up" banner's arithmetic
 * (board 08m, `BANNER`).
 *
 * Pure, over `score.ts`: a set's games are its `LabelGameBand`s counted for
 * their `winner`, so the same rows that draw the scoreboard draw the tally,
 * and a corrected winner moves both at once. Nothing here is stored.
 *
 * The entered score is a set total — `label_sessions.final_score` as the
 * labeller read it off the video, else `matches.score` as the match record
 * carries it — so a disagreement can be placed at a set, never at a game:
 * `scoreMismatch` names the first set whose pair differs and that set's first
 * live point, which is where "Find the gap" goes.
 */

import { labelScores, type ScorablePoint } from "./score";
import type { LabelSide, MatchScore } from "./session";

/** One set's games as the labelled points make them, p1 first. */
export interface LabelSetScore {
  setNumber: number;
  games: [number, number];
  /** The set's first live point in rail order — where its gap would start. */
  firstPointId: string;
}

/**
 * Tally each set's games for their winners. A game with no counted point yet
 * (`winner` null) adds to neither side; a set appears once it has a live
 * point with a set and game number. Sets come back in set-number order.
 */
export function labelSetScores(
  points: readonly ScorablePoint[],
  adScoring: boolean,
): LabelSetScore[] {
  const { games } = labelScores(points, adScoring);
  const sets = new Map<number, LabelSetScore>();
  for (const point of points) {
    if (point.status === "deleted" || point.setNumber === null) continue;
    if (!sets.has(point.setNumber)) {
      sets.set(point.setNumber, {
        setNumber: point.setNumber,
        games: [0, 0],
        firstPointId: point.id,
      });
    }
  }
  for (const band of games) {
    const set = sets.get(band.setNumber);
    if (!set || band.winner === null) continue;
    set.games[sideIndex(band.winner)] += 1;
  }
  return [...sets.values()].sort((a, b) => a.setNumber - b.setNumber);
}

function sideIndex(side: LabelSide): 0 | 1 {
  return side === "p1" ? 0 : 1;
}

/**
 * The score the labelled points are held against: what the labeller entered
 * on the session when they have, else the match record's — as `[p1, p2]`
 * pairs per set — or null when neither says anything.
 */
export function enteredScore(
  finalScore: readonly (readonly number[])[] | null,
  matchScore: MatchScore | null,
): number[][] | null {
  if (finalScore) return finalScore.map((pair) => [pair[0] ?? 0, pair[1] ?? 0]);
  if (!matchScore) return null;
  const sets = Math.max(matchScore.player1.length, matchScore.player2.length);
  return Array.from({ length: sets }, (_, i) => [
    matchScore.player1[i] ?? 0,
    matchScore.player2[i] ?? 0,
  ]);
}

export interface LabelScoreMismatch {
  setNumber: number;
  /** The labelled pair, p1 first: "4–0". */
  labelled: string;
  /** The entered pair, p1 first: "5–2". */
  entered: string;
  /**
   * The mismatching set's first live point; null when the labelled points
   * never reach that set (the entered score has more sets than the rows do).
   */
  firstPointId: string | null;
}

/**
 * The first set on which the labelled points and the entered score disagree,
 * or null when every set agrees or nothing was entered. A set one side has
 * and the other does not reads as 0–0 on the side without it: the rows that
 * stop a set short of the entered score are a mismatch — the one "Video ends
 * early" answers — and so are rows that run into a set the score never had.
 */
export function scoreMismatch(
  labelled: readonly LabelSetScore[],
  entered: readonly (readonly number[])[] | null,
): LabelScoreMismatch | null {
  if (entered === null) return null;
  const bySet = new Map(labelled.map((set) => [set.setNumber, set]));
  const last = Math.max(entered.length, ...labelled.map((s) => s.setNumber));
  for (let setNumber = 1; setNumber <= last; setNumber += 1) {
    const set = bySet.get(setNumber);
    const have = set?.games ?? [0, 0];
    const want = entered[setNumber - 1] ?? [0, 0];
    if (have[0] === (want[0] ?? 0) && have[1] === (want[1] ?? 0)) continue;
    return {
      setNumber,
      labelled: formatPair(have),
      entered: formatPair([want[0] ?? 0, want[1] ?? 0]),
      firstPointId: set?.firstPointId ?? null,
    };
  }
  return null;
}

/** "4–0": an en dash, as the scoreboard writes every pair. */
export function formatPair(
  pair: readonly [number, number] | readonly number[],
) {
  return `${pair[0] ?? 0}–${pair[1] ?? 0}`;
}

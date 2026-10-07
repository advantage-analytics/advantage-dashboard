/**
 * The match's set scores as the labelled points make them, held against the
 * score that was entered: the "Score doesn't add up" chip's arithmetic. Pure,
 * over `score.ts`: a set's games are its `LabelGameBand`s counted for their
 * `outcome`, so the rows that draw the scoreboard draw the tally.
 *
 * Only a game the points settle counts — one left unfinished (30–40 and then
 * the next game's rows) adds to neither side, and one with rows past its end
 * counts for who it was settled for. Each set lists those two kinds, so the
 * chip can say why its pair falls short.
 *
 * The entered score is a set total (`label_sessions.final_score`, else
 * `matches.score`), so a disagreement is placed at a set: `scoreMismatch`
 * names the first set whose pair differs, that set's first live point (where
 * "Find the gap" goes) and its unfinished and run-over games, the first of
 * which is where the chip scrolls to.
 */

import { gameKey, type LabelGameBand, type ScorablePoint } from "./score";
import type { LabelSide, MatchScore } from "./session";

/** One game of a set the points left unfinished. */
export interface UnfinishedGame {
  setNumber: number;
  gameNumber: number;
  /** The number the band names it by. */
  gameInSet: number;
  /** The call as it stands, the server's points first: "30–40". */
  score: string;
}

/** One game of a set with rows sitting past the row that settled it. */
export interface OverflowGame {
  setNumber: number;
  gameNumber: number;
  gameInSet: number;
  /** The live rows past its end. */
  extra: number;
}

/** One set's games as the labelled points make them, p1 first. */
export interface LabelSetScore {
  setNumber: number;
  games: [number, number];
  /** The set's first live point in rail order — where its gap would start. */
  firstPointId: string;
  /** The set's games left unfinished, in point order. */
  unfinished: UnfinishedGame[];
  /** The set's games with rows past their end, in point order. */
  overflow: OverflowGame[];
}

/**
 * Tally each set's games for who the points settled them for. A game left
 * unfinished — no counted point yet, or short of settled — adds to neither
 * side and is listed; a set appears once it has a live point with a set and
 * game number. Sets come back in set-number order.
 */
export function labelSetScores(
  points: readonly ScorablePoint[],
  /** `labelScores(points, adScoring).games` — scored once by the caller. */
  games: readonly LabelGameBand[],
): LabelSetScore[] {
  const sets = new Map<number, LabelSetScore>();
  for (const point of points) {
    if (point.status === "deleted" || point.setNumber === null) continue;
    if (!sets.has(point.setNumber)) {
      sets.set(point.setNumber, {
        setNumber: point.setNumber,
        games: [0, 0],
        firstPointId: point.id,
        unfinished: [],
        overflow: [],
      });
    }
  }
  for (const band of games) {
    const set = sets.get(band.setNumber);
    if (!set) continue;
    const { outcome } = band;
    if (outcome.kind === "unfinished") {
      set.unfinished.push({
        setNumber: band.setNumber,
        gameNumber: band.gameNumber,
        gameInSet: band.gameInSet,
        score: outcome.score,
      });
      continue;
    }
    set.games[sideIndex(outcome.winner)] += 1;
    if (outcome.kind === "overflow") {
      set.overflow.push({
        setNumber: band.setNumber,
        gameNumber: band.gameNumber,
        gameInSet: band.gameInSet,
        extra: outcome.extra,
      });
    }
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

/** Why a set's labelled pair is what it is: one game, and what is wrong with it. */
export type LabelScoreReason =
  | ({ kind: "unfinished" } & UnfinishedGame)
  | ({ kind: "overflow" } & OverflowGame);

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
  /** The set's unfinished games, then its run-over ones; empty when neither. */
  reasons: LabelScoreReason[];
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
      reasons: [
        ...(set?.unfinished ?? []).map((game): LabelScoreReason => ({
          kind: "unfinished",
          ...game,
        })),
        ...(set?.overflow ?? []).map((game): LabelScoreReason => ({
          kind: "overflow",
          ...game,
        })),
      ],
    };
  }
  return null;
}

/** "game 5 unfinished (30–40)" or "game 3 has 2 extra points". */
export function scoreReasonText(reason: LabelScoreReason): string {
  if (reason.kind === "unfinished") {
    return `game ${reason.gameInSet} unfinished (${reason.score})`;
  }
  return `game ${reason.gameInSet} has ${reason.extra} extra ${
    reason.extra === 1 ? "point" : "points"
  }`;
}

/**
 * The chip's sentence: "Set 2: labelled 4–5, entered 4–6 · game 5 unfinished
 * (30–40)". The reasons follow the pairs, each after a middle dot; none when
 * the set has no unfinished or run-over game.
 */
export function scoreMismatchSentence(mismatch: LabelScoreMismatch): string {
  const head = `Set ${mismatch.setNumber}: labelled ${mismatch.labelled}, entered ${mismatch.entered}`;
  return [head, ...mismatch.reasons.map(scoreReasonText)].join(" · ");
}

/** The first game the sentence names, as `gameKey` spells it; null with none. */
export function mismatchGameKey(mismatch: LabelScoreMismatch): string | null {
  const [first] = mismatch.reasons;
  return first ? gameKey(first) : null;
}

/** "6–3, 4–6": the labelled sets as "Fix the entered score" will store them. */
export function formatSets(sets: readonly LabelSetScore[]): string {
  return sets.map((set) => formatPair(set.games)).join(", ");
}

/** "4–0": an en dash, as the scoreboard writes every pair. */
export function formatPair(
  pair: readonly [number, number] | readonly number[],
) {
  return `${pair[0] ?? 0}–${pair[1] ?? 0}`;
}

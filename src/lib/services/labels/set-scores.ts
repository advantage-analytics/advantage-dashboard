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
 * The entered score is a set total (`matches.score`, else
 * `label_sessions.final_score`), so a disagreement is placed at a set: `scoreMismatch`
 * names the first set whose pair differs, that set's first live point (where
 * "Find the gap" goes) and its unfinished and run-over games, the first of
 * which is where the chip scrolls to.
 */

import { gameKey, type LabelGameBand, type ScorablePoint } from "./score";
import type { LabelSide, LabelStartScore, MatchScore } from "./session";

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
  /** The set's last live point in rail order — where its score is read. */
  lastPointId: string;
  /** The set's games left unfinished, in point order. */
  unfinished: UnfinishedGame[];
  /** The set's games with rows past their end, in point order. */
  overflow: OverflowGame[];
}

/**
 * Tally each set's games for who the points settled them for. A game left
 * unfinished — no counted point yet, or short of settled — adds to neither
 * side and is listed; a set appears once it has a live point with a set and
 * game number. Sets come back in set-number order. The first game's set — the
 * first set on the video — opens at `start.games` when the video starts
 * mid-match (null: at 0–0, as every later set).
 */
export function labelSetScores(
  points: readonly ScorablePoint[],
  /** `labelScores(points, adScoring, start).games` — scored once by the caller. */
  games: readonly LabelGameBand[],
  start: LabelStartScore | null = null,
): LabelSetScore[] {
  const sets = new Map<number, LabelSetScore>();
  for (const point of points) {
    if (point.status === "deleted" || point.setNumber === null) continue;
    if (!sets.has(point.setNumber)) {
      sets.set(point.setNumber, {
        setNumber: point.setNumber,
        games: [0, 0],
        firstPointId: point.id,
        lastPointId: point.id,
        unfinished: [],
        overflow: [],
      });
    }
    sets.get(point.setNumber)!.lastPointId = point.id;
  }
  if (start && games.length > 0) {
    const opening = sets.get(games[0].setNumber);
    if (opening) opening.games = [start.games[0], start.games[1]];
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
 * The score the labelled points are held against: the match record's — the
 * source of truth, which labelling never writes — as `[p1, p2]` pairs per
 * set; the session's own `final_score` only for a match with no recorded
 * score; null when neither says anything. The labels answer to the score,
 * never the other way round.
 */
export function enteredScore(
  finalScore: readonly (readonly number[])[] | null,
  matchScore: MatchScore | null,
): number[][] | null {
  const sets = matchScore
    ? Math.max(matchScore.player1.length, matchScore.player2.length)
    : 0;
  if (matchScore && sets > 0) {
    return Array.from({ length: sets }, (_, i) => [
      matchScore.player1[i] ?? 0,
      matchScore.player2[i] ?? 0,
    ]);
  }
  if (finalScore) return finalScore.map((pair) => [pair[0] ?? 0, pair[1] ?? 0]);
  return null;
}

/**
 * The fewest points the winner of a match tiebreak can have entered: first
 * to 10 under the rules, but 7 is the floor here, since a 7-point match
 * tiebreak exists and the wizard does not say which was played.
 */
export const MATCH_TIEBREAK_MIN_POINTS = 7;

/**
 * The set the match record says was played as a 10-point match tiebreak, or
 * null when none was. The wizard stores a match tiebreak by convention —
 * the deciding set entered as 1–0 or 0–1 games, its points in the tiebreak
 * arrays (ScoreBlock.tsx `isTiebreakSet`, score-state.ts `setWinner`) — and
 * no format flag says so anywhere, so both halves of the convention are
 * required: the deciding set's games are 1–0 / 0–1 AND its entry in the
 * tiebreak arrays gives the set's winner at least `MATCH_TIEBREAK_MIN_POINTS`.
 * A 1–0 deciding set with no tiebreak points is a retirement (6–4, 3–6, 1–0
 * ret.) and stays a set of games; so does a record with no tiebreak arrays
 * at all, and the console's own `final_score` — games only — never names
 * one. Nothing is inferred.
 *
 * The deciding set is the one at index `bestOf - 1`, or the last entered set
 * when the sets before it were level with each player one set from the match.
 * A 1–0 set anywhere else is not a match tiebreak — an unfinished opener
 * entered as 1–0 stays a set of games.
 */
export function matchTiebreakSet(
  score: MatchScore | null,
  bestOf: number,
): number | null {
  if (!score) return null;
  const sets = Math.max(score.player1.length, score.player2.length);
  if (sets === 0) return null;
  const games = (i: number): [number, number] => [
    score.player1[i] ?? 0,
    score.player2[i] ?? 0,
  ];
  const toWin = Math.ceil(bestOf / 2);
  const decidingIndex = (() => {
    if (sets >= bestOf) return bestOf - 1;
    const won = { p1: 0, p2: 0 };
    for (let i = 0; i < sets - 1; i += 1) {
      const [a, b] = games(i);
      if (a > b) won.p1 += 1;
      else if (b > a) won.p2 += 1;
    }
    return won.p1 === toWin - 1 && won.p2 === toWin - 1 ? sets - 1 : null;
  })();
  if (decidingIndex === null) return null;
  const [a, b] = games(decidingIndex);
  if (Math.max(a, b) !== 1 || Math.min(a, b) !== 0) return null;
  const winnerPoints =
    a === 1
      ? score.player1_tiebreaks?.[decidingIndex]
      : score.player2_tiebreaks?.[decidingIndex];
  return typeof winnerPoints === "number" &&
    winnerPoints >= MATCH_TIEBREAK_MIN_POINTS
    ? decidingIndex + 1
    : null;
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
  /** The set's last live point; null exactly when `firstPointId` is. */
  lastPointId: string | null;
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
      lastPointId: set?.lastPointId ?? null,
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

/**
 * The session's mismatch as the console reads it — the labelled sets against
 * `enteredScore` — or null once the labeller has said the video ends early.
 * The rail draws it and `]` steps to it, so both read this one answer.
 */
export function sessionScoreMismatch(input: {
  points: readonly ScorablePoint[];
  /** `labelScores(points, adScoring, startScore).games`. */
  games: readonly LabelGameBand[];
  finalScore: readonly (readonly number[])[] | null;
  matchScore: MatchScore | null;
  videoEndsEarly: boolean | null;
  /** Where the video starts in the match; missing or null: at the beginning. */
  startScore?: LabelStartScore | null;
}): LabelScoreMismatch | null {
  if (input.videoEndsEarly === true) return null;
  return scoreMismatch(
    labelSetScores(input.points, input.games, input.startScore ?? null),
    enteredScore(input.finalScore, input.matchScore),
  );
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

/** "6–3, 4–6": the labelled sets, as the publish script prints them. */
export function formatSets(sets: readonly LabelSetScore[]): string {
  return sets.map((set) => formatPair(set.games)).join(", ");
}

/** "4–0": an en dash, as the scoreboard writes every pair. */
export function formatPair(
  pair: readonly [number, number] | readonly number[],
) {
  return `${pair[0] ?? 0}–${pair[1] ?? 0}`;
}

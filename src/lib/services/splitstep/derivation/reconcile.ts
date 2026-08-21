/**
 * Fold the resolved point winners forward and check them against the score the
 * player entered at upload.
 *
 * This is the only automatic correctness check that exists on this vendor's
 * model, and it is what decides whether a match may be written at all. It is a
 * mechanism, not a report: `matches.score` is ground truth, the fold either
 * reproduces it exactly or the match is refused.
 *
 * Spec §4.4 proposed grading a fold that lands within one game as "medium" and
 * publishing it anyway. That is rejected here. A one-game miss means at least
 * one game's point winners are wrong with nothing identifying which, and these
 * rows are the point-by-point timeline and the video seek targets — so a wrong
 * point is a specific false claim on a screen, not a rounding error in an
 * aggregate.
 */

import type { PointWinner } from './winners';

export interface MatchScore {
  player1: number[];
  player2: number[];
}

export interface FoldedGame {
  setIndex: number;
  /** 1-based and global across the match, matching `points.game_number`. */
  gameNumber: number;
  winner: string;
}

export interface Reconciliation {
  ok: boolean;
  /** Which label is player1, decided by the fold rather than by name. */
  player1Label: string | null;
  /** Per-set game counts the fold produced, keyed by label. */
  foldedSets: Array<Record<string, number>>;
  games: FoldedGame[];
  /** Populated only when ok is false. */
  reason: string | null;
  /**
   * Points the vendor stream could not resolve on its own. The final rally is
   * listed here when it was one of them even after the fold settled it — this
   * is the raw diagnostic, not a list of rows that were written wrong.
   */
  unresolvedPoints: number[];
  /**
   * `winners` with the trailing point settled, when it needed settling.
   *
   * Consumers MUST write points from this rather than from the array they
   * passed in. `resolveWinner` cannot resolve the last rally — it has no
   * successor to compare against — and the fold is the only thing that knows
   * which assignment reproduces the entered score.
   */
  settledWinners: PointWinner[];
}

/** True when a score cannot distinguish a mapping from its mirror. */
export function scoreIsSelfMirroring(score: MatchScore): boolean {
  const n = Math.max(score.player1.length, score.player2.length);
  for (let i = 0; i < n; i += 1) {
    if ((score.player1[i] ?? -1) !== (score.player2[i] ?? -1)) return false;
  }
  return true;
}

/**
 * Walk the points, closing games and sets as their winners accumulate.
 *
 * Game and set boundaries come from the vendor's own score-string changes
 * rather than from re-deriving tennis scoring, because the vendor's stream is
 * what produced the winners in the first place and re-deriving would silently
 * paper over a disagreement between the two.
 */
export function foldGames(
  winners: PointWinner[],
  gameKeyOf: (rallyId: number) => string,
  setKeyOf: (rallyId: number) => string
): { games: FoldedGame[]; sets: Array<Record<string, number>> } {
  const games: FoldedGame[] = [];
  const sets: Array<Record<string, number>> = [];

  let currentGameKey: string | null = null;
  let currentSetKey: string | null = null;
  let setIndex = -1;
  let lastWinnerInGame: string | null = null;

  const closeGame = () => {
    if (currentGameKey === null || lastWinnerInGame === null) return;
    games.push({
      setIndex: Math.max(setIndex, 0),
      gameNumber: games.length + 1,
      winner: lastWinnerInGame,
    });
    const bucket = sets[Math.max(setIndex, 0)];
    if (bucket) bucket[lastWinnerInGame] = (bucket[lastWinnerInGame] ?? 0) + 1;
  };

  for (const point of winners) {
    const gameKey = gameKeyOf(point.rallyId);
    const setKey = setKeyOf(point.rallyId);

    if (setKey !== currentSetKey) {
      closeGame();
      currentGameKey = gameKey;
      currentSetKey = setKey;
      setIndex += 1;
      sets[setIndex] = {};
      lastWinnerInGame = point.winner;
      continue;
    }

    if (gameKey !== currentGameKey) {
      closeGame();
      currentGameKey = gameKey;
      lastWinnerInGame = point.winner;
      continue;
    }

    if (point.winner) lastWinnerInGame = point.winner;
  }
  closeGame();

  return { games, sets };
}

/** Per-set counts for one label, in set order. */
function setCounts(
  sets: Array<Record<string, number>>,
  label: string
): number[] {
  return sets.map((s) => s[label] ?? 0);
}

function sameCounts(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Decide the label -> player1 mapping and confirm the fold matches the entered
 * score exactly.
 *
 * The mapping falls out of the comparison rather than from string matching.
 * `pred_player_id` is free text echoed back from the job request and has been
 * observed misspelled relative to `matches.player1_name`, so matching on it
 * would be a coin flip dressed as a lookup — and getting it backwards puts
 * every statistic on the wrong player with nothing looking wrong on screen.
 */
export function reconcile(params: {
  winners: PointWinner[];
  labels: string[];
  score: MatchScore;
  gameKeyOf: (rallyId: number) => string;
  setKeyOf: (rallyId: number) => string;
  /** Label whose game-1 strokes sat on the top half, when geometry was decisive. */
  geometryTopLabel?: string | null;
  /** From `matches.initial_top_player_is_player1`, when known. */
  initialTopIsPlayer1?: boolean | null;
}): Reconciliation {
  const { winners, labels, score, gameKeyOf, setKeyOf } = params;

  const unresolvedPoints = winners
    .filter((w) => !w.winner)
    .map((w) => w.rallyId);

  const empty: Reconciliation = {
    ok: false,
    player1Label: null,
    foldedSets: [],
    games: [],
    reason: null,
    unresolvedPoints,
    settledWinners: winners,
  };

  if (labels.length !== 2) {
    return { ...empty, reason: 'expected exactly two player labels' };
  }

  // Every point must resolve. The final rally is the one legitimate exception:
  // it has no successor, so it is allowed to be unresolved provided the fold
  // still lands on the entered score.
  const lastIndex = winners.length - 1;
  const lastRallyId = winners[lastIndex]?.rallyId;
  const fatalUnresolved = unresolvedPoints.filter((id) => id !== lastRallyId);
  if (fatalUnresolved.length > 0) {
    const { games, sets } = foldGames(winners, gameKeyOf, setKeyOf);
    return {
      ...empty,
      foldedSets: sets,
      games,
      reason: `${fatalUnresolved.length} point(s) resolved no winner`,
    };
  }

  const [a, b] = labels;

  const attempt = (candidate: PointWinner[]) => {
    const { games, sets } = foldGames(candidate, gameKeyOf, setKeyOf);
    const aCounts = setCounts(sets, a);
    const bCounts = setCounts(sets, b);
    return {
      candidate,
      games,
      sets,
      aCounts,
      bCounts,
      aIsPlayer1:
        sameCounts(aCounts, score.player1) && sameCounts(bCounts, score.player2),
      bIsPlayer1:
        sameCounts(bCounts, score.player1) && sameCounts(aCounts, score.player2),
    };
  };

  /**
   * SETTLE THE TRAILING POINT.
   *
   * `foldGames` carries `lastWinnerInGame` forward across an unresolved point,
   * so an unsettled final rally credited the match's LAST GAME to whoever won
   * the previous resolved point in it. That is only correct when the winner
   * took the final two points in a row; a game closed at 40-30, or running
   * 40-0 → 40-15 → game, was credited to the loser. The fold then came up one
   * game short for the winner and one long for the loser, `reconcile` reported
   * "does not match the entered score", and `deriveAndPublish` wrote
   * `derivation_failed` — refusing a match that was entirely correct.
   *
   * There is exactly one point in question and two possible winners, so the
   * honest resolution is to try both and keep the one the entered score
   * confirms. `matches.score` is ground truth here (see the module header), so
   * this is reading the answer off the evidence, not guessing at it: an
   * assignment that does not reproduce the entered score is still refused.
   */
  const trailingUnresolved = lastIndex >= 0 && !winners[lastIndex]?.winner;
  const attempts = (
    trailingUnresolved
      ? labels.map((label) =>
          winners.map((w, i) => (i === lastIndex ? { ...w, winner: label } : w))
        )
      : [winners]
  ).map(attempt);

  const settled =
    attempts.find((r) => r.aIsPlayer1 || r.bIsPlayer1) ?? attempts[0];

  const { candidate: settledWinners, games, sets, aCounts, bCounts } = settled;
  const { aIsPlayer1, bIsPlayer1 } = settled;

  if (!aIsPlayer1 && !bIsPlayer1) {
    return {
      ...empty,
      foldedSets: sets,
      games,
      reason: `folded score ${JSON.stringify({ [a]: aCounts, [b]: bCounts })} does not match the entered score`,
    };
  }

  // A score that equals its own mirror — a retirement recorded as 3-3, a split
  // walkover — satisfies both directions and tells us nothing. Fall back to
  // geometry, and refuse when geometry was indecisive too, rather than pick.
  if (aIsPlayer1 && bIsPlayer1) {
    const { geometryTopLabel, initialTopIsPlayer1 } = params;
    if (!geometryTopLabel || initialTopIsPlayer1 === null || initialTopIsPlayer1 === undefined) {
      return {
        ...empty,
        foldedSets: sets,
        games,
        reason:
          'entered score is its own mirror and geometry was indecisive, so player1 cannot be identified',
      };
    }
    const player1Label = initialTopIsPlayer1
      ? geometryTopLabel
      : (otherOf(geometryTopLabel, labels) as string);
    return {
      ok: true,
      player1Label,
      foldedSets: sets,
      games,
      reason: null,
      unresolvedPoints,
      settledWinners,
    };
  }

  return {
    ok: true,
    player1Label: aIsPlayer1 ? a : b,
    foldedSets: sets,
    games,
    reason: null,
    unresolvedPoints,
    settledWinners,
  };
}

function otherOf(label: string, labels: string[]): string | null {
  const rest = labels.filter((l) => l !== label);
  return rest.length === 1 ? rest[0] : null;
}

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
 *
 * TEMPORARILY BYPASSED (2026-09-02, product decision): see
 * ACCEPT_UNRECONCILED_FOLD below. A fold that misses the entered score is now
 * still written, with player1 named from the wizard's top-player input and
 * court geometry instead of from the fold. The refusal above is what to restore.
 */

import type { PointWinner } from './winners';

/**
 * TEMPORARY — accept the vendor's data as truth even when the fold does not
 * reproduce `matches.score`.
 *
 * Decided 2026-09-02 after the first real team match (job 3c0f5e7c) came back
 * from the vendor and was refused here: "folded score … does not match the
 * entered score", `derivation_failed`, and a match page with nothing on it.
 * Until the vendor's stream is reliable enough for the gate to be a signal
 * rather than a wall, an unreconciled transcript is written anyway.
 *
 * What still holds while this is true:
 *   • `Reconciliation.ok` keeps meaning "the fold reproduced the score". It is
 *     false on the bypass path, so nothing downstream mistakes an accepted
 *     transcript for a verified one, and derive-and-publish logs it.
 *   • player1 is named from geometry + the wizard's top-player input first, then
 *     from whichever label assignment folds CLOSEST to the entered score, and
 *     the match is still refused when neither says anything — writing rows on a
 *     coin flip would put every statistic on the wrong human.
 *   • The unresolved-points gate above this one is untouched.
 *     `points.won_by_player1` is NOT NULL, and the fold's game alignment
 *     depends on it.
 *
 * To restore Gate 1: set this to false (or delete the fenced block in
 * `reconcile()`), bump DERIVATION_VERSION, and rebuild every match derived
 * under the `-unreconciled` version tag.
 */
export const ACCEPT_UNRECONCILED_FOLD = true;

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
  /** True when the fold reproduced `matches.score` exactly. */
  ok: boolean;
  /**
   * Which label is player1. Decided by the fold when `ok`; otherwise, under
   * ACCEPT_UNRECONCILED_FOLD, by `player1Source`. Null means refused.
   */
  player1Label: string | null;
  /**
   * How player1Label was decided. `fold` when the fold matched; `geometry`
   * when the wizard's top-player input plus court position named it;
   * `distance` when the closer of the two folds did. Null when refused.
   */
  player1Source: 'fold' | 'geometry' | 'distance' | null;
  /** Per-set game counts the fold produced, keyed by label. */
  foldedSets: Array<Record<string, number>>;
  games: FoldedGame[];
  /**
   * Why the fold did not reproduce the score. Populated whenever ok is false —
   * including on the bypass path, where rows are written regardless.
   */
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
 * How far a folded score sits from the entered one, under a given mapping:
 * the sum of per-set absolute game differences, with a missing set counted
 * as 0 games. Used only by the ACCEPT_UNRECONCILED_FOLD path, to prefer the
 * label assignment that is less wrong when nothing better is known.
 */
function scoreDistance(
  p1Counts: number[],
  p2Counts: number[],
  score: MatchScore
): number {
  const n = Math.max(
    p1Counts.length,
    p2Counts.length,
    score.player1.length,
    score.player2.length
  );
  let d = 0;
  for (let i = 0; i < n; i += 1) {
    d +=
      Math.abs((p1Counts[i] ?? 0) - (score.player1[i] ?? 0)) +
      Math.abs((p2Counts[i] ?? 0) - (score.player2[i] ?? 0));
  }
  return d;
}

/**
 * player1 from the wizard's top-player input and the opening game's court
 * geometry — the same rule the mirror-score branch uses, pulled out so the
 * bypass path can share it. Null when either half is missing.
 */
function player1FromGeometry(
  geometryTopLabel: string | null | undefined,
  initialTopIsPlayer1: boolean | null | undefined,
  labels: string[]
): string | null {
  if (!geometryTopLabel) return null;
  if (initialTopIsPlayer1 === null || initialTopIsPlayer1 === undefined) return null;
  return initialTopIsPlayer1 ? geometryTopLabel : otherOf(geometryTopLabel, labels);
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
    player1Source: null,
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
    const reason = `folded score ${JSON.stringify({ [a]: aCounts, [b]: bCounts })} does not match the entered score`;

    // ---- BEGIN Gate 1 bypass (ACCEPT_UNRECONCILED_FOLD) ----------------------
    // Name player1 without the fold's help, so the transcript can still be
    // written. `ok` stays false: this is an accepted transcript, not a
    // verified one. Delete this block (or flip the constant) to restore.
    if (ACCEPT_UNRECONCILED_FOLD) {
      const { geometryTopLabel, initialTopIsPlayer1 } = params;

      // 1. Geometry + the wizard's top-player input. Independent of the fold
      //    that just proved itself wrong, and the only signal that identifies
      //    the human directly.
      let player1Label = player1FromGeometry(geometryTopLabel, initialTopIsPlayer1, labels);
      let source: 'geometry' | 'distance' | null = player1Label ? 'geometry' : null;

      // Distance of every (attempt, mapping) pair from the entered score.
      // The mapping is judged on the SUM over every trailing-point attempt:
      // the settlement of the final point is an unknown, and a single
      // attempt can make either mapping look closer by exactly the one game
      // that point decides. Summing averages that ambiguity out. A tie
      // between the two sums says nothing — a self-mirroring fold is
      // equidistant under both mappings — and is treated as no answer
      // rather than as labels[0].
      const distanceFor = (label: string, r: (typeof attempts)[number]) =>
        label === a
          ? scoreDistance(r.aCounts, r.bCounts, score)
          : scoreDistance(r.bCounts, r.aCounts, score);
      const total = (label: string) =>
        attempts.reduce((sum, r) => sum + distanceFor(label, r), 0);

      // 2. Otherwise the mapping whose fold is closest.
      if (!player1Label) {
        const totalA = total(a);
        const totalB = total(b);
        if (totalA !== totalB) {
          player1Label = totalA < totalB ? a : b;
          source = 'distance';
        }
      }

      // 3. Neither: fall through to the refusal below.
      if (player1Label) {
        // Settle the trailing point under the chosen mapping: the attempt
        // that lands closest to the entered score, as the reconciled path
        // would have done.
        const chosen = attempts.reduce((best, r) =>
          distanceFor(player1Label as string, r) < distanceFor(player1Label as string, best)
            ? r
            : best
        );
        return {
          ok: false,
          player1Label,
          player1Source: source,
          foldedSets: chosen.sets,
          games: chosen.games,
          reason,
          unresolvedPoints,
          settledWinners: chosen.candidate,
        };
      }
    }
    // ---- END Gate 1 bypass ---------------------------------------------------

    return {
      ...empty,
      foldedSets: sets,
      games,
      reason,
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
      player1Source: 'fold',
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
    player1Source: 'fold',
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

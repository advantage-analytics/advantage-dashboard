/**
 * Who won each point.
 *
 * The vendor emits no point-winner field. Two signals could stand in for one
 * and they are NOT equals: the score stream, and the last stroke's `in` flag.
 * They agree on 86% / 43% / 90% of points across the three real payloads, and
 * the tie was broken by ground truth — on the one match whose true score we
 * hold, folding the score stream forward reproduces 6-4, 6-4 exactly (20 games,
 * 12-8). The `in` flag is the unreliable half: it reads false on 16% / 38% /
 * 29% of strokes that demonstrably had more strokes after them.
 *
 * So the winner comes from the score stream and never from `in`. This module
 * is the only place that decision is implemented.
 *
 * Everything here is orientation-aware in one specific way: `pred_point_score`,
 * `pred_game_score` and `pred_set_score` are written from the SERVER's
 * perspective, so the same match state renders as two different strings
 * depending on who is serving. Every comparison below therefore *absolutizes*
 * to `{label: value}` before comparing. Comparing the raw strings reports a
 * change on every single game.
 */

import type { SplitStepRally } from './types';

/** Rungs of a standard game, plus AD for ad-scoring matches. */
const LADDER: Record<string, number> = {
  '0': 0,
  '15': 1,
  '30': 2,
  '40': 3,
  AD: 4,
};

export interface WinnerResolution {
  /** Player label that won, or null when no rule resolved it. */
  winner: string | null;
  /** Which rule fired, for the flag trail and for debugging. */
  via: 'ladder' | 'game' | 'set' | 'final' | null;
}

/** Split a server-relative score string into [serverValue, returnerValue]. */
function tokens(score: string | null): [string, string] | null {
  if (!score) return null;
  const parts = score.split('-');
  return parts.length === 2 ? [parts[0].trim(), parts[1].trim()] : null;
}

/**
 * Absolutize a server-relative score into a per-label map.
 *
 * This is the step that makes every later comparison meaningful. Without it a
 * change of server looks identical to a change of score.
 */
function absolutize(
  score: string | null,
  server: string,
  returner: string
): Record<string, string> | null {
  const t = tokens(score);
  if (!t) return null;
  return { [server]: t[0], [returner]: t[1] };
}

/** Numeric per-label map, using the point ladder or plain integers. */
function numeric(
  abs: Record<string, string> | null,
  useLadder: boolean
): Record<string, number> | null {
  if (!abs) return null;
  const out: Record<string, number> = {};
  for (const [label, raw] of Object.entries(abs)) {
    const value = useLadder ? LADDER[raw.toUpperCase()] : Number(raw);
    if (value === undefined || !Number.isFinite(value)) return null;
    out[label] = value;
  }
  return out;
}

/** The label whose value rose by exactly one, when exactly one did. */
function soleIncrement(
  before: Record<string, number> | null,
  after: Record<string, number> | null
): string | null {
  if (!before || !after) return null;
  const labels = Object.keys(before);
  if (labels.length !== 2 || Object.keys(after).length !== 2) return null;
  const risers = labels.filter((l) => after[l] - before[l] === 1);
  const steady = labels.filter((l) => after[l] === before[l]);
  return risers.length === 1 && steady.length === 1 ? risers[0] : null;
}

function otherLabel(label: string, labels: string[]): string | null {
  const others = labels.filter((l) => l !== label);
  return others.length === 1 ? others[0] : null;
}

/**
 * Resolve the winner of `rally` from its transition to `next`.
 *
 * Rules are tried in order and FALL THROUGH. An unparseable set score must not
 * be fatal — it should drop to the game comparison, and an unparseable game
 * score to the ladder. Treating any one of them as a refusal condition costs
 * coverage for no correctness gain.
 */
export function resolveWinner(
  rally: SplitStepRally,
  next: SplitStepRally | null,
  labels: string[]
): WinnerResolution {
  const server = rally.server;
  const returner = otherLabel(server, labels);
  if (!returner || !next) return { winner: null, via: null };

  const nextServer = next.server;
  const nextReturner = otherLabel(nextServer, labels);
  if (!nextReturner) return { winner: null, via: null };

  const from = rally.strokes[0];
  const to = next.strokes[0];
  if (!from || !to) return { winner: null, via: null };

  const sameGame =
    from.predGameScore === to.predGameScore && server === nextServer;

  // 1. Inside a game: exactly one side climbs one rung. Tiebreak point scores
  //    are plain integers rather than 0/15/30/40, so try both readings.
  if (sameGame) {
    const before = absolutize(from.predPointScore, server, returner);
    const after = absolutize(to.predPointScore, nextServer, nextReturner);
    for (const useLadder of [true, false]) {
      const winner = soleIncrement(
        numeric(before, useLadder),
        numeric(after, useLadder)
      );
      if (winner) return { winner, via: 'ladder' };
    }
    return { winner: null, via: null };
  }

  // 2. The point that closed a game: exactly one side's game count rises.
  const gameBefore = numeric(
    absolutize(from.predGameScore, server, returner),
    false
  );
  const gameAfter = numeric(
    absolutize(to.predGameScore, nextServer, nextReturner),
    false
  );
  const byGame = soleIncrement(gameBefore, gameAfter);
  if (byGame) return { winner: byGame, via: 'game' };

  // 3. The point that closed a set: the game score resets, so the rise shows up
  //    in the set score instead.
  const setBefore = numeric(
    absolutize(from.predSetScore, server, returner),
    false
  );
  const setAfter = numeric(
    absolutize(to.predSetScore, nextServer, nextReturner),
    false
  );
  const bySet = soleIncrement(setBefore, setAfter);
  if (bySet) return { winner: bySet, via: 'set' };

  return { winner: null, via: null };
}

export interface PointWinner {
  rallyId: number;
  server: string;
  winner: string | null;
  via: WinnerResolution['via'];
}

/**
 * Resolve every point in the match.
 *
 * The final rally has no successor to compare against, so it is left
 * unresolved here and settled by the reconciliation fold, which knows the true
 * final score and can therefore name the only winner consistent with it.
 */
export function resolvePointWinners(
  rallies: SplitStepRally[],
  labels: string[]
): PointWinner[] {
  return rallies.map((rally, i) => {
    const { winner, via } = resolveWinner(
      rally,
      rallies[i + 1] ?? null,
      labels
    );
    return { rallyId: rally.rallyId, server: rally.server, winner, via };
  });
}

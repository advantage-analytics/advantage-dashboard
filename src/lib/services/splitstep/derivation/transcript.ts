/**
 * The whole derivation, from a parsed payload to database-shaped rows.
 *
 * Pure: it builds rows and returns them. Nothing here writes, so it can be run
 * against a fixture in a test and against a real payload in the webhook and
 * produce byte-identical output.
 *
 * A transcript is either complete or refused. There is no partial mode — see
 * reconcile.ts for why a fold that misses the entered score by a game is not
 * "close enough".
 */

import { metersToCourtFrame, kmhToMph, serveZone, directionZone, serveCourtSide } from './court';
import { flagPoint, flagStroke } from './flags';
import { reconcile, scoreIsSelfMirroring, type MatchScore, type Reconciliation } from './reconcile';
import { classifyPoint, lastServeIndex, shotNumber, shotResult, type ResultType } from './result-type';
import { resolvePointWinners } from './winners';
import { pressureFor } from './pressure';
import type { SplitStepRally, SplitStepStroke } from './types';

export interface DerivedShot {
  shot_number: number;
  is_player1: boolean;
  shot_type: string | null;
  spin_type: string | null;
  speed_mph: number | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  result: string | null;
  video_time: number | null;
  zone: string | null;
  flags: string[];
  derived: true;
}

export interface DerivedPoint {
  point_number: number;
  set_number: number;
  game_number: number;
  server_is_player1: boolean;
  won_by_player1: boolean;
  rally_length: number;
  result_type: ResultType | null;
  is_break_point: boolean;
  is_set_point: boolean;
  is_match_point: boolean;
  video_time: number | null;
  duration: number | null;
  flags: string[];
  derived: true;
  shots: DerivedShot[];
}

export interface Transcript {
  ok: boolean;
  reason: string | null;
  reconciliation: Reconciliation;
  points: DerivedPoint[];
  /** Share of rally-ending non-serve strokes struck by the point winner. */
  winnerShare: number;
  /** Share of serves whose landing survived the geometry gate. */
  serveGeometryRetention: number;
  /** Rallies whose last stroke was a serve, over points. */
  unreturnedServeRate: number;
}

/**
 * A score string reduced to something that does not change when the server
 * does. Used for keys only, never for display.
 */
function orderlessScore(score: string | null): string {
  if (!score) return 'unknown';
  const parts = score.split('-').map((p) => p.trim());
  if (parts.length !== 2) return score;
  return [...parts].sort().join('-');
}

/** Physically impossible serve landings, beyond a wide or long fault. */
function serveLandingUsable(stroke: SplitStepStroke): boolean {
  if (stroke.bounceX === null || stroke.bounceY === null) return false;
  if (stroke.playerY === null) return false;
  if (Math.sign(stroke.bounceY) === Math.sign(stroke.playerY)) return false;
  return Math.abs(stroke.bounceX) <= 6.0 && Math.abs(stroke.bounceY) <= 8.4;
}

function rallyLandingUsable(stroke: SplitStepStroke): boolean {
  if (stroke.bounceX === null || stroke.bounceY === null) return false;
  return Math.abs(stroke.bounceX) <= 6.0 && Math.abs(stroke.bounceY) <= 14.0;
}

/** `shots.shot_type` for a non-serve, from the vendor's coarse taxonomy. */
function strokeShotType(stroke: SplitStepStroke): string | null {
  if (stroke.strokeType === 'volley') return 'Volley';
  if (stroke.strokeSide === 'forehand') return 'Forehand';
  if (stroke.strokeSide === 'backhand') return 'Backhand';
  if (stroke.strokeSide === 'overhead') return 'Overhead';
  return null;
}

/**
 * Which label was on the far half during the opening game.
 *
 * A candidate only. The fold is the authority on identity; this exists to
 * cross-check it, and to break the tie when the entered score is its own
 * mirror. Requires a clear majority on a decent sample, because one payload's
 * opening game splits 3/2 and a bare majority there means nothing.
 */
function geometryTopLabel(
  rallies: SplitStepRally[],
  labels: string[]
): string | null {
  const firstGame = rallies[0]?.strokes[0]?.predGameScore ?? null;
  const votes = new Map<string, { top: number; bottom: number }>();

  for (const rally of rallies) {
    if ((rally.strokes[0]?.predGameScore ?? null) !== firstGame) break;
    for (const stroke of rally.strokes) {
      if (stroke.playerY === null) continue;
      const tally = votes.get(stroke.playerLabel) ?? { top: 0, bottom: 0 };
      if (stroke.playerY > 0) tally.top += 1;
      else tally.bottom += 1;
      votes.set(stroke.playerLabel, tally);
    }
  }

  let best: string | null = null;
  for (const label of labels) {
    const tally = votes.get(label);
    if (!tally) return null;
    const total = tally.top + tally.bottom;
    if (total < 5) return null;
    const topShare = tally.top / total;
    if (topShare >= 0.8) best = best ?? label;
    else if (topShare > 0.2) return null; // indecisive
  }
  return best;
}

export interface BuildOptions {
  rallies: SplitStepRally[];
  labels: string[];
  score: MatchScore | null;
  initialTopIsPlayer1: boolean | null;
  /** matches.format.ad_scoring. Decides whether 40-40 is a deciding point. */
  adScoring?: boolean;
  /** matches.format.best_of. Decides when a set point is also a match point. */
  bestOf?: number;
}

export function buildTranscript(options: BuildOptions): Transcript {
  const {
    rallies,
    labels,
    score,
    initialTopIsPlayer1,
    adScoring = true,
    bestOf = 3,
  } = options;

  const gameKeyOf = new Map<number, string>();
  const setKeyOf = new Map<number, string>();
  for (const rally of rallies) {
    const first = rally.strokes[0];
    // Both score strings are server-relative, so "1-0" and "0-1" are the SAME
    // state seen from opposite ends and the string flips every game. Keying a
    // set on the raw string splits every game into its own set — set one
    // survives only because "0-0" happens to be symmetric. Sort the pair.
    setKeyOf.set(rally.rallyId, orderlessScore(first?.predSetScore ?? null));
    gameKeyOf.set(
      rally.rallyId,
      `${orderlessScore(first?.predSetScore ?? null)}|${first?.predGameScore}|${rally.server}`
    );
  }

  const winners = resolvePointWinners(rallies, labels);

  const empty: Transcript = {
    ok: false,
    reason: null,
    reconciliation: {
      ok: false,
      player1Label: null,
      foldedSets: [],
      games: [],
      reason: null,
      unresolvedPoints: [],
    },
    points: [],
    winnerShare: 0,
    serveGeometryRetention: 0,
    unreturnedServeRate: 0,
  };

  if (!score) {
    return { ...empty, reason: 'matches.score is required and was not set' };
  }
  if (labels.length !== 2) {
    return { ...empty, reason: `expected two player labels, found ${labels.length}` };
  }

  const topLabel = geometryTopLabel(rallies, labels);
  const rec = reconcile({
    winners,
    labels,
    score,
    gameKeyOf: (id) => gameKeyOf.get(id) ?? '',
    setKeyOf: (id) => setKeyOf.get(id) ?? '',
    geometryTopLabel: topLabel,
    initialTopIsPlayer1,
  });

  // Decisive geometry that contradicts the fold is a refusal, not a warning:
  // the two disagree about which physical human every statistic belongs to.
  if (rec.ok && topLabel && initialTopIsPlayer1 !== null) {
    const expected = initialTopIsPlayer1
      ? topLabel
      : labels.find((l) => l !== topLabel) ?? null;
    if (expected && rec.player1Label && expected !== rec.player1Label) {
      return {
        ...empty,
        reconciliation: rec,
        reason: 'player_mapping_contradiction: geometry and the score fold disagree',
      };
    }
  }

  if (!rec.ok) {
    return { ...empty, reconciliation: rec, reason: rec.reason };
  }

  const player1 = rec.player1Label as string;
  const gameNumberOf = new Map<string, { set: number; game: number }>();
  rec.games.forEach((g, i) => {
    gameNumberOf.set(`${i}`, { set: g.setIndex + 1, game: i + 1 });
  });

  // Walk games in stream order so point/game/set numbering matches the timeline.
  const points: DerivedPoint[] = [];
  let gameIndex = -1;
  let previousGameKey: string | null = null;
  let previousRally: SplitStepRally | null = null;

  // Running tallies, advanced as each game closes. Break/set/match points are
  // arithmetic on the score BEFORE a point, so these must reflect what was true
  // when the point started, not after it.
  const gamesThisSet: Record<string, number> = {};
  const setsWon: Record<string, number> = {};
  for (const label of labels) {
    gamesThisSet[label] = 0;
    setsWon[label] = 0;
  }
  let currentSetIndex = 0;

  let winnerStruckLast = 0;
  let rallyEnders = 0;
  let servesSeen = 0;
  let servesKept = 0;
  let unreturned = 0;

  rallies.forEach((rally, i) => {
    const key = gameKeyOf.get(rally.rallyId) ?? '';
    if (key !== previousGameKey) {
      // Close the game that just ended and credit it before this point is
      // measured, so the tallies describe the state this point begins from.
      const closed = gameIndex >= 0 ? rec.games[gameIndex] : undefined;
      if (closed) {
        if (closed.setIndex !== currentSetIndex) {
          const setWinner = Object.entries(gamesThisSet).sort(
            (a, b) => b[1] - a[1]
          )[0]?.[0];
          if (setWinner) setsWon[setWinner] = (setsWon[setWinner] ?? 0) + 1;
          for (const label of labels) gamesThisSet[label] = 0;
          currentSetIndex = closed.setIndex;
        }
        gamesThisSet[closed.winner] = (gamesThisSet[closed.winner] ?? 0) + 1;
      }
      gameIndex += 1;
      previousGameKey = key;
      previousRally = null;
    }

    const winner = winners[i]?.winner ?? null;
    const serveIndex = lastServeIndex(rally);
    const pressure = pressureFor({
      rally,
      labels,
      gamesThisSet,
      setsWon,
      adScoring,
      bestOf,
    });
    const resultType = winner ? classifyPoint(rally, winner) : null;
    const numbering = gameNumberOf.get(`${gameIndex}`) ?? { set: 1, game: gameIndex + 1 };

    const last = rally.strokes[rally.strokes.length - 1];
    if (last && last.strokeType !== 'serve' && winner) {
      rallyEnders += 1;
      if (last.playerLabel === winner) winnerStruckLast += 1;
    }
    if (last?.strokeType === 'serve') unreturned += 1;

    const shots: DerivedShot[] = [];
    const serveLanding = rally.serves[rally.serves.length - 1];
    const serveLandingX =
      serveLanding && serveLandingUsable(serveLanding) ? serveLanding.bounceX : null;

    rally.strokes.forEach((stroke, index) => {
      const isServe = stroke.strokeType === 'serve';
      if (isServe) servesSeen += 1;

      const usable = isServe ? serveLandingUsable(stroke) : rallyLandingUsable(stroke);
      if (isServe && usable) servesKept += 1;

      const landing = usable && stroke.bounceX !== null && stroke.bounceY !== null
        ? metersToCourtFrame(stroke.bounceX, stroke.bounceY)
        : null;
      const contact =
        stroke.playerX !== null && stroke.playerY !== null
          ? metersToCourtFrame(stroke.playerX, stroke.playerY)
          : null;

      const number = shotNumber(index, serveIndex);
      const isFirstServe = isServe && index < serveIndex;

      shots.push({
        shot_number: number,
        is_player1: stroke.playerLabel === player1,
        shot_type: isServe
          ? isFirstServe || rally.serves.length === 1
            ? 'First Serve'
            : 'Second Serve'
          : strokeShotType(stroke),
        spin_type: stroke.spinType,
        speed_mph: stroke.speedKmh === null ? null : kmhToMph(stroke.speedKmh),
        contact_x: contact?.x ?? null,
        contact_y: contact?.y ?? null,
        landing_x: landing?.x ?? null,
        landing_y: landing?.y ?? null,
        result: winner
          ? shotResult({ stroke, index, rally, serveIndex, winner })
          : null,
        video_time: stroke.videoTime,
        zone: isServe
          ? serveZone(landing?.x ?? null)
          : directionZone(landing?.x ?? null, serveLandingX),
        flags: flagStroke({ stroke, index, rally, serveIndex }),
        derived: true,
      });
    });

    const first = rally.strokes[0];
    const duration =
      first && last ? Math.max(0, last.videoTime - first.videoTime) : null;

    points.push({
      point_number: points.length + 1,
      set_number: numbering.set,
      game_number: numbering.game,
      server_is_player1: rally.server === player1,
      won_by_player1: winner === player1,
      rally_length: rally.strokes.length - serveIndex,
      result_type: resultType,
      is_break_point: pressure.isBreakPoint,
      is_set_point: pressure.isSetPoint,
      is_match_point: pressure.isMatchPoint,
      video_time: first?.videoTime ?? null,
      duration,
      flags: flagPoint({
        rally,
        winner,
        previousInGame: previousRally,
        resultType,
      }),
      derived: true,
      shots,
    });

    previousRally = rally;
  });

  return {
    ok: true,
    reason: null,
    reconciliation: rec,
    points,
    winnerShare: rallyEnders === 0 ? 0 : winnerStruckLast / rallyEnders,
    serveGeometryRetention: servesSeen === 0 ? 0 : servesKept / servesSeen,
    unreturnedServeRate: rallies.length === 0 ? 0 : unreturned / rallies.length,
  };
}

export { scoreIsSelfMirroring, serveCourtSide };
export type { MatchScore, Reconciliation };

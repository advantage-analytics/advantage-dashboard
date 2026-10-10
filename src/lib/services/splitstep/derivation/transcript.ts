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
 *
 * TEMPORARILY RELAXED (2026-09-02): under ACCEPT_UNRECONCILED_FOLD a fold that
 * misses the entered score still yields a complete transcript, with player1
 * named by geometry or score distance (see reconcile.ts). `ok` on the
 * transcript then means "rows were built"; `reconciliation.ok` says whether
 * they were verified, and `reason` carries why not.
 */

import {
  metersToCourtFrame,
  kmhToMph,
  serveZone,
  directionZone,
  serveCourtSide,
} from "./court";
import { flagPoint, flagStroke, POINT_FLAGS } from "./flags";
import {
  ACCEPT_UNRECONCILED_FOLD,
  reconcile,
  scoreIsSelfMirroring,
  type MatchScore,
  type Reconciliation,
} from "./reconcile";
import {
  classifyPoint,
  lastServeIndex,
  shotNumber,
  shotResult,
  type ResultType,
} from "./result-type";
import {
  lastStrokeWinner,
  resolvePointWinners,
  type PointWinner,
} from "./winners";
import {
  proposeSegmentation,
  type RallyOutcome,
  type SegmentationInput,
  type SegmentationProposal,
} from "./segmentation";
import { collapsedTailStart, opponentOf } from "./rallies";
import { frozenGameStarts, frozenStretches, withServer } from "./frozen";
import { playedRally } from "./played";
import type { LineCalls } from "./line-calls";
import { pressureFor } from "./pressure";
import { pointScoresOf } from "./scores";
import { bounceVideoTimes } from "./frame-clock";
import type { SplitStepRally, SplitStepStroke } from "./types";

export interface DerivedShot {
  /**
   * The vendor stroke's `eventId`, carried so a derived row can be joined back
   * to the stroke it came from. Not a `shots` column — persist-transcript.ts
   * lists its insert columns explicitly and leaves this out.
   */
  event_id: number;
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
  /**
   * Seconds of the ball's bounce on the same clock as `video_time`, fitted
   * from the vendor's `bounce_frame` through the strokes' frame/time pairs.
   * Null when the vendor saw no bounce or the match had no clock to fit.
   */
  bounce_video_time: number | null;
  zone: string | null;
  flags: string[];
  derived: true;
}

export interface DerivedPoint {
  /**
   * The vendor rally's `rallyId`, the point-level join key back to the
   * payload. Not a `points` column — see `DerivedShot.event_id`.
   */
  rally_id: number;
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
  /** Server-first, verbatim from the vendor's first-stroke prediction — see scores.ts. */
  set_score: string | null;
  game_score: string | null;
  point_score: string | null;
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
  /**
   * Rallies whose winner is the last stroke's guess because the score stream
   * could not name one: a collapsed tail (collapsedTailStart), a frozen
   * stretch (frozen.ts), or a stall inside a game. Each carries
   * `winner_guessed`.
   */
  guessedRallies: number[];
  /** Rallies inside a frozen stretch, games read from the serve. */
  frozenRallies: number[];
  /**
   * The score-constrained segmenter's proposal (segmentation.ts). Review-only:
   * it never changes a published row, it only adds
   * `segment_proposal_differs` to the points it disagrees with. Null when the
   * segmenter had no score or top player to work from, when the transcript
   * was refused, or when the segmenter threw.
   */
  segmentation: SegmentationProposal | null;
}

/**
 * A score string reduced to something that does not change when the server
 * does. Used for keys only, never for display.
 */
function orderlessScore(score: string | null): string {
  if (!score) return "unknown";
  const parts = score.split("-").map((p) => p.trim());
  if (parts.length !== 2) return score;
  return [...parts].sort().join("-");
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
  if (stroke.strokeType === "volley") return "Volley";
  if (stroke.strokeSide === "forehand") return "Forehand";
  if (stroke.strokeSide === "backhand") return "Backhand";
  if (stroke.strokeSide === "overhead") return "Overhead";
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
  labels: string[],
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

/**
 * The segmenter's proposal for one rally, in the published rows' terms.
 *
 * `ProposedGame.game` is numbered per set; `points.game_number` is
 * match-cumulative, so the two cannot be compared as they are. This converts
 * once, for both the transcript's flagging and the labelling console's marks,
 * so the two never disagree about which points differ.
 */
export interface ProposedPoint {
  set: number;
  /** Match-cumulative, like `points.game_number`. */
  game: number;
  server: "player1" | "player2";
  /** The rally this one would be consumed with as a single point, if any. */
  mergedWith: number | null;
}

/**
 * Whether the proposal would cut this point differently from the published
 * row: another set or game, another server, or a merge. The one test behind
 * `segment_proposal_differs` and the label-session scoring's "fired".
 */
export function proposalDiffers(
  p: ProposedPoint,
  row: { set_number: number; game_number: number; server_is_player1: boolean },
): boolean {
  return (
    p.mergedWith !== null ||
    p.set !== row.set_number ||
    p.game !== row.game_number ||
    (p.server === "player1") !== row.server_is_player1
  );
}

/**
 * `rallyIds` in play order — rally ids rise with play, and a proposed game is
 * an id range, so one forward walk places every rally. A rally outside every
 * proposed game (a no_fit path that died early) has no entry.
 */
export function proposedPointsOf(
  proposal: SegmentationProposal,
  rallyIds: readonly number[],
): Map<number, ProposedPoint> {
  const gamesInSet = new Map<number, number>();
  for (const game of proposal.games) {
    gamesInSet.set(game.set, (gamesInSet.get(game.set) ?? 0) + 1);
  }
  const gamesBefore = (set: number) => {
    let n = 0;
    for (const [s, count] of gamesInSet) if (s < set) n += count;
    return n;
  };
  const mergedWith = new Map<number, number>();
  for (const [a, b] of proposal.merges) {
    mergedWith.set(a, b);
    mergedWith.set(b, a);
  }

  const out = new Map<number, ProposedPoint>();
  const games = proposal.games;
  let g = 0;
  for (const rallyId of rallyIds) {
    while (g < games.length && rallyId > games[g].lastRallyId) g += 1;
    const game = games[g];
    if (!game || rallyId < game.firstRallyId) continue;
    out.set(rallyId, {
      set: game.set,
      game: gamesBefore(game.set) + game.game,
      server: game.server,
      mergedWith: mergedWith.get(rallyId) ?? null,
    });
  }
  return out;
}

/**
 * The segmenter's input, from what the transcript already holds, and its
 * proposal. Review-only: a throw is logged and dropped, never a refusal.
 *
 * The rallies are the ones the rows were built from — frozen relabelling
 * applied, phantom strokes removed — so the proposal's `diff` is against the
 * PUBLISHED server, not the vendor's raw label. Who won relative to the server
 * does not change under a label swap, so the outcomes read off the settled
 * winners stay valid. A guessed or frozen winner is low confidence; a winner
 * the stream or the fold named is high.
 */
function segmentForReview(args: {
  rallies: readonly SplitStepRally[];
  settled: readonly PointWinner[];
  frozenRallies: ReadonlySet<number>;
  gameKeyOf: ReadonlyMap<number, string>;
  score: MatchScore;
  adScoring: boolean;
  bestOf: number;
  labels: readonly string[];
  player1: string;
  initialTopIsPlayer1: boolean | null;
  segmenter: (input: SegmentationInput) => SegmentationProposal;
}): SegmentationProposal | null {
  const { rallies, settled, frozenRallies, gameKeyOf, player1 } = args;
  const player2 = args.labels.find((label) => label !== player1);
  if (args.initialTopIsPlayer1 === null || player2 === undefined) return null;

  const outcomes: RallyOutcome[] = rallies.map((rally, i) => {
    const winner = settled[i]?.winner ?? null;
    return {
      won:
        winner === null
          ? null
          : winner === rally.server
            ? "server"
            : "receiver",
      confidence:
        settled[i]?.via === "guess" || frozenRallies.has(rally.rallyId)
          ? "low"
          : "high",
    };
  });
  const vendorGameStarts = rallies.map(
    (rally, i) =>
      i === 0 ||
      gameKeyOf.get(rally.rallyId) !== gameKeyOf.get(rallies[i - 1].rallyId),
  );
  const input: SegmentationInput = {
    rallies,
    outcomes,
    vendorGameStarts,
    adScoring: args.adScoring,
    bestOf: args.bestOf,
    score: args.score,
    topAtStart: args.initialTopIsPlayer1 ? player1 : player2,
    player1Label: player1,
    player2Label: player2,
  };
  try {
    return args.segmenter(input);
  } catch (error) {
    console.error(
      "[splitstep] segmentation threw; the proposal is dropped and the rows stand",
      error,
    );
    return null;
  }
}

export interface BuildOptions {
  rallies: SplitStepRally[];
  labels: string[];
  score: MatchScore | null;
  initialTopIsPlayer1: boolean | null;
  /**
   * processing_jobs.ad_scoring, falling back to matches.format.ad_scoring (see
   * resolveAdScoring). Decides whether 40-40 is a deciding point.
   */
  adScoring?: boolean;
  /** matches.format.best_of. Decides when a set point is also a match point. */
  bestOf?: number;
  /**
   * Our own line calls from the trajectories file (line-calls.ts). Absent
   * means no file: the dead-ball and near-line flags then fall back
   * to what the strokes file alone can say.
   */
  lineCalls?: LineCalls;
  /**
   * Test seam for the review-only segmenter. Omit in production:
   * `proposeSegmentation` runs. `null` skips it, so a test can check that the
   * published rows are identical with and without it; a function stands in
   * for it, so a test can force a throw.
   */
  segmenter?: ((input: SegmentationInput) => SegmentationProposal) | null;
}

export function buildTranscript(options: BuildOptions): Transcript {
  const {
    rallies: streamRallies,
    labels,
    score,
    initialTopIsPlayer1,
    adScoring = true,
    bestOf = 3,
    lineCalls: streamLineCalls,
    segmenter = proposeSegmentation,
  } = options;

  const gameKeyOf = new Map<number, string>();
  const setKeyOf = new Map<number, string>();
  for (const rally of streamRallies) {
    const first = rally.strokes[0];
    // Both score strings are server-relative, so "1-0" and "0-1" are the SAME
    // state seen from opposite ends and the string flips every game. Keying a
    // set on the raw string splits every game into its own set — set one
    // survives only because "0-0" happens to be symmetric. Sort the pair.
    setKeyOf.set(rally.rallyId, orderlessScore(first?.predSetScore ?? null));
    gameKeyOf.set(
      rally.rallyId,
      `${orderlessScore(first?.predSetScore ?? null)}|${first?.predGameScore}|${rally.server}`,
    );
  }

  // Winners are read off the stream as the vendor labelled it: its score
  // strings are relative to ITS server, so absolutizing them against a
  // corrected one would misread them.
  const winners = resolvePointWinners(streamRallies, labels);
  const rallies = [...streamRallies];
  const tailStart = collapsedTailStart(rallies);
  const guessedRallies: number[] = [];
  const guess = (i: number) => {
    const winner = lastStrokeWinner(rallies[i], labels);
    if (!winner) return;
    winners[i] = { ...winners[i], winner, via: "guess" };
    guessedRallies.push(winners[i].rallyId);
  };

  // A frozen stretch keeps the vendor's set but not its one endless game: the
  // serve splits it into games, the server alternates game by game from the
  // last rally the stream could read, and every point takes the last stroke's
  // guess — including ones a transition out of the run happened to resolve,
  // since those read the frozen labels.
  const frozenRallies = new Set<number>();
  // Line calls are keyed by stroke object, and relabelling a frozen rally
  // replaces its strokes, so the calls are carried across to the new objects.
  let lineCalls = streamLineCalls;
  const frozenKey = (rallyId: number) =>
    `${setKeyOf.get(rallyId)}|frozen@${rallyId}`;
  for (const { start, end } of frozenStretches(
    rallies,
    tailStart ?? rallies.length,
  )) {
    const run = rallies.slice(start, end);
    const previous = start > 0 ? rallies[start - 1] : null;
    const opensGame =
      !previous ||
      previous.strokes[0]?.predSetScore !== run[0].strokes[0]?.predSetScore ||
      previous.strokes[0]?.predGameScore !== run[0].strokes[0]?.predGameScore;
    let server = !previous
      ? run[0].server
      : opensGame
        ? (opponentOf(previous.server, labels) ?? run[0].server)
        : previous.server;
    let gameKey =
      previous && !opensGame
        ? (gameKeyOf.get(previous.rallyId) ?? "")
        : frozenKey(run[0].rallyId);

    frozenGameStarts(run).forEach((startsGame, offset) => {
      const i = start + offset;
      const rally = rallies[i];
      if (startsGame) {
        server = opponentOf(server, labels) ?? server;
        gameKey = frozenKey(rally.rallyId);
      }
      rallies[i] = withServer(rally, server, labels);
      if (streamLineCalls && rallies[i] !== rally) {
        const carried = new Map(lineCalls);
        rally.strokes.forEach((stroke, k) => {
          const call = streamLineCalls.get(stroke);
          if (call) carried.set(rallies[i].strokes[k], call);
        });
        lineCalls = carried;
      }
      gameKeyOf.set(rally.rallyId, gameKey);
      frozenRallies.add(rally.rallyId);
      guess(i);
    });
  }

  // A collapsed score tail keeps its rallies. They fold into the game the last
  // real rally was in (a reset key would open a phantom set), and every point
  // from that rally on that the stream could not resolve takes the last
  // stroke's guess. If the vendor's tail actually spanned a game change, it is
  // one game here — the stream no longer says where that change was.
  if (tailStart !== null) {
    const anchor = rallies[tailStart - 1].rallyId;
    for (const rally of rallies.slice(tailStart)) {
      gameKeyOf.set(rally.rallyId, gameKeyOf.get(anchor) ?? "");
      setKeyOf.set(rally.rallyId, setKeyOf.get(anchor) ?? "");
    }
    for (let i = tailStart - 1; i < winners.length; i += 1) {
      if (!winners[i].winner) guess(i);
    }
  }

  // Anything else the stream left unresolved is a stall inside a game (the
  // score repeating for a few rallies, then moving on). The point was played,
  // so it is kept on the last stroke's guess rather than refusing the match.
  // The final rally is the exception: reconcile settles it from the entered
  // score, which beats a guess. So is a warm-up rally before the stream has
  // read any set score: it has no game to join, and keeping it would open a
  // phantom first set and push every real point one set up. It stays a
  // refusal (see collapsedTailStart).
  const firstScored = rallies.findIndex(
    (r) => (r.strokes[0]?.predSetScore ?? null) !== null,
  );
  const stallsFrom = firstScored === -1 ? winners.length : firstScored;
  for (let i = stallsFrom; i < winners.length - 1; i += 1) {
    if (!winners[i].winner) guess(i);
  }
  guessedRallies.sort((a, b) => a - b);

  const frozenList = [...frozenRallies];
  const empty: Transcript = {
    ok: false,
    reason: null,
    reconciliation: {
      ok: false,
      player1Label: null,
      player1Source: null,
      foldedSets: [],
      games: [],
      reason: null,
      unresolvedPoints: [],
      settledWinners: [],
    },
    points: [],
    winnerShare: 0,
    serveGeometryRetention: 0,
    unreturnedServeRate: 0,
    guessedRallies,
    frozenRallies: frozenList,
    segmentation: null,
  };

  if (!score) {
    return { ...empty, reason: "matches.score is required and was not set" };
  }
  if (labels.length !== 2) {
    return {
      ...empty,
      reason: `expected two player labels, found ${labels.length}`,
    };
  }

  const topLabel = geometryTopLabel(rallies, labels);

  // One clock for the whole match: the fit wants every stroke's frame/time
  // pair, not one rally's, so a short rally still lands on the same line.
  const allStrokes = rallies.flatMap((rally) => rally.strokes);
  const bounceTimeOf = new Map<SplitStepStroke, number | null>();
  bounceVideoTimes(allStrokes).forEach((t, i) => {
    bounceTimeOf.set(allStrokes[i], t);
  });
  const rec = reconcile({
    winners,
    labels,
    score,
    gameKeyOf: (id) => gameKeyOf.get(id) ?? "",
    setKeyOf: (id) => setKeyOf.get(id) ?? "",
    geometryTopLabel: topLabel,
    initialTopIsPlayer1,
  });

  // Decisive geometry that contradicts the fold is a refusal, not a warning:
  // the two disagree about which physical human every statistic belongs to.
  if (rec.ok && topLabel && initialTopIsPlayer1 !== null) {
    const expected = initialTopIsPlayer1
      ? topLabel
      : (labels.find((l) => l !== topLabel) ?? null);
    if (expected && rec.player1Label && expected !== rec.player1Label) {
      return {
        ...empty,
        reconciliation: rec,
        reason:
          "player_mapping_contradiction: geometry and the score fold disagree",
      };
    }
  }

  // ---- Gate 1 bypass: an unreconciled fold that still named player1 builds
  // rows anyway. Restore by deleting the second clause. ----------------------
  if (!rec.ok && !(ACCEPT_UNRECONCILED_FOLD && rec.player1Label)) {
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
  /** The rallies as the rows read them, for the segmenter. */
  const keptRallies: SplitStepRally[] = [];

  rallies.forEach((rally, i) => {
    const key = gameKeyOf.get(rally.rallyId) ?? "";
    if (key !== previousGameKey) {
      // Close the game that just ended and credit it before this point is
      // measured, so the tallies describe the state this point begins from.
      const closed = gameIndex >= 0 ? rec.games[gameIndex] : undefined;
      if (closed) {
        if (closed.setIndex !== currentSetIndex) {
          const setWinner = Object.entries(gamesThisSet).sort(
            (a, b) => b[1] - a[1],
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

    // `rec.settledWinners`, NOT `winners`. The final rally has no successor
    // for `resolveWinner` to compare against, so only the fold can name its
    // winner — reading the raw array here recorded every match's last point as
    // won by player2, because `winner === player1` is false for null.
    const winner = rec.settledWinners[i]?.winner ?? null;
    // Phantom strokes are removed once, here, so numbering, results,
    // result_type, flags and rally length all read the same list. Pressure and
    // the score columns read the raw rally: they come from the score stream.
    const played = playedRally(rally, { winner, lineCalls });
    const kept = played.rally;
    keptRallies.push(kept);
    const serveIndex = lastServeIndex(kept);
    const pressure = pressureFor({
      rally,
      labels,
      gamesThisSet,
      setsWon,
      adScoring,
      bestOf,
    });
    const resultType = winner ? classifyPoint(kept, winner) : null;
    const numbering = gameNumberOf.get(`${gameIndex}`) ?? {
      set: 1,
      game: gameIndex + 1,
    };

    const last = kept.strokes[kept.strokes.length - 1];
    if (last && last.strokeType !== "serve" && winner) {
      rallyEnders += 1;
      if (last.playerLabel === winner) winnerStruckLast += 1;
    }
    if (last?.strokeType === "serve") unreturned += 1;

    const shots: DerivedShot[] = [];

    kept.strokes.forEach((stroke, index) => {
      const isServe = stroke.strokeType === "serve";
      if (isServe) servesSeen += 1;

      const usable = isServe
        ? serveLandingUsable(stroke)
        : rallyLandingUsable(stroke);
      if (isServe && usable) servesKept += 1;

      const landing =
        usable && stroke.bounceX !== null && stroke.bounceY !== null
          ? metersToCourtFrame(stroke.bounceX, stroke.bounceY)
          : null;
      const contact =
        stroke.playerX !== null && stroke.playerY !== null
          ? metersToCourtFrame(stroke.playerX, stroke.playerY)
          : null;

      const number = shotNumber(index, serveIndex);
      const isFirstServe = isServe && index < serveIndex;

      shots.push({
        event_id: stroke.eventId,
        shot_number: number,
        is_player1: stroke.playerLabel === player1,
        shot_type: isServe
          ? isFirstServe || kept.serves.length === 1
            ? "First Serve"
            : "Second Serve"
          : strokeShotType(stroke),
        spin_type: stroke.spinType,
        speed_mph: stroke.speedKmh === null ? null : kmhToMph(stroke.speedKmh),
        contact_x: contact?.x ?? null,
        contact_y: contact?.y ?? null,
        landing_x: landing?.x ?? null,
        landing_y: landing?.y ?? null,
        result: winner
          ? shotResult({ stroke, index, rally: kept, serveIndex, winner })
          : null,
        video_time: stroke.videoTime,
        bounce_video_time: bounceTimeOf.get(stroke) ?? null,
        zone: isServe
          ? serveZone(landing?.x ?? null)
          : directionZone(landing?.x ?? null, contact?.x ?? null),
        flags: flagStroke({ stroke, index, rally: kept }),
        derived: true,
      });
    });

    // The clip window spans every detected stroke, dropped ones included, so
    // the film room still shows the whole exchange.
    const first = rally.strokes[0];
    const end = rally.strokes[rally.strokes.length - 1];
    const duration =
      first && end ? Math.max(0, end.videoTime - first.videoTime) : null;

    const frozen = frozenRallies.has(rally.rallyId);
    points.push({
      rally_id: rally.rallyId,
      point_number: points.length + 1,
      set_number: numbering.set,
      game_number: numbering.game,
      server_is_player1: rally.server === player1,
      won_by_player1: winner === player1,
      rally_length: kept.strokes.length - serveIndex,
      result_type: resultType,
      is_break_point: pressure.isBreakPoint,
      is_set_point: pressure.isSetPoint,
      is_match_point: pressure.isMatchPoint,
      // A frozen reading is not the score this point started from; the film
      // room shows nothing rather than the same 0-0 on every point.
      ...(frozen
        ? { set_score: null, game_score: null, point_score: null }
        : pointScoresOf(rally)),
      video_time: first?.videoTime ?? null,
      duration,
      flags: [
        // score_side_mismatch reads the point score's parity, and a frozen
        // reading always says "first point": it would flag every ad court.
        ...flagPoint({
          rally: kept,
          winner,
          previousInGame: previousRally,
          resultType,
          adScoring,
          lineCalls,
        }).filter((f) => !(frozen && f === POINT_FLAGS.SCORE_SIDE_MISMATCH)),
        ...(rec.settledWinners[i]?.via === "guess"
          ? [POINT_FLAGS.WINNER_GUESSED]
          : []),
        ...(frozen ? [POINT_FLAGS.SCORE_FROZEN] : []),
        ...played.flags,
      ],
      derived: true,
      shots,
    });

    previousRally = rally;
  });

  // Review-only. The rows above are final; the proposal only marks the points
  // whose game or server it would have cut differently, and both halves of
  // every point it would merge.
  const segmentation =
    segmenter === null
      ? null
      : segmentForReview({
          rallies: keptRallies,
          settled: rec.settledWinners,
          frozenRallies,
          gameKeyOf,
          score,
          adScoring,
          bestOf,
          labels,
          player1,
          initialTopIsPlayer1,
          segmenter,
        });
  if (segmentation) {
    const proposed = proposedPointsOf(
      segmentation,
      points.map((point) => point.rally_id),
    );
    for (const point of points) {
      const p = proposed.get(point.rally_id);
      if (!p) continue;
      if (proposalDiffers(p, point))
        point.flags.push(POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS);
    }
  }

  return {
    ok: true,
    // Carries the unreconciled reason on the bypass path, so the CLI and the
    // publish log say why the fold missed even though rows were written.
    reason: rec.ok ? null : rec.reason,
    reconciliation: rec,
    points,
    winnerShare: rallyEnders === 0 ? 0 : winnerStruckLast / rallyEnders,
    serveGeometryRetention: servesSeen === 0 ? 0 : servesKept / servesSeen,
    unreturnedServeRate: rallies.length === 0 ? 0 : unreturned / rallies.length,
    guessedRallies,
    frozenRallies: frozenList,
    segmentation,
  };
}

export { scoreIsSelfMirroring, serveCourtSide };
export type { MatchScore, Reconciliation };

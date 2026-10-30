/**
 * A completed hand-labelling session turned back into `points` / `shots`
 * insert rows — the inverse of seed.ts, for `scripts/label-apply.ts`, which
 * replaces a match's published rows with what the labeller saw on the video.
 *
 * Pure: no client, no writes. The rows are shaped exactly as
 * `persist-transcript.ts` shapes a derived transcript (same columns, same
 * `derived = true`), so `calculate_match_stats` and every reader treat them
 * the same way; `points.flags` carries `hand_labelled` instead of the
 * derivation's flags, which is what the derive guard in persist-transcript.ts
 * refuses to overwrite.
 *
 * What is read from the labels and how:
 * - A point is a live `label_points` row (no tombstone) whose ending is not
 *   `let_replayed` / `not_a_point`, in `point_index` order.
 * - Its strokes are the live ones (`isLiveShot` with ghosts on: no tombstone,
 *   no site-removed stroke the labeller never restored), in video order.
 * - A let serve (`isLetServe`) is replayed, not played: it is never written as
 *   a serve, so it cannot count as a first serve in or out. It still widens
 *   the point's clip window, as the derivation's dropped strokes do.
 * - A serve stored in whose landing reads out or net (`inServeLandingMiss`)
 *   is written as in with no `landing_x` / `landing_y` and no `zone`: the
 *   landing is the vendor's wrong bounce, and a serve with no placement is
 *   one every reader already skips (the derivation writes them too).
 * - Score strings come from the console's own scoreboard (`labelScores`),
 *   server-first like the vendor's, and the pressure flags from the same
 *   `pressureFor` the derivation runs over them — both counted from the
 *   session's `start` when the video starts mid-match: the first game opens
 *   at its points, its set at its games, and sets-won-before at its sets.
 * - Sides: `p1` is `matches.player1_id`, the side `is_player1` /
 *   `server_is_player1` / `won_by_player1` name, so `p1` → true throughout.
 * - `video_time` on a label shot is already on the analysis clock (the seed
 *   copied the transcript's, trim offset included); the vendor's speed and
 *   bounce time are read off the frozen `label_shots.vendor` stroke with the
 *   job's trim offset (`vendorShotFacts`).
 */

import {
  bounceVideoTimes,
  directionZone,
  kmhToMph,
  parseStrokes,
  pressureFor,
  serveZone,
  shotNumber,
  type RawSplitStepStroke,
  type SplitStepRally,
} from "@/lib/services/splitstep/derivation";
import { publishEnding } from "./ending-derived";
import { inServeLandingMiss } from "./shot-derived";
import { gameKey, labelScores, type LabelGameBand } from "./score";
import { labelSetScores } from "./set-scores";
import {
  isLetServe,
  isNonPointEnding,
  isServeStroke,
  liveShotsInOrder,
  opponent,
  type LabelEnding,
  type LabelPoint,
  type LabelShot,
  type LabelShotResult,
  type LabelSide,
  type LabelSpin,
  type LabelStartScore,
  type LabelStroke,
} from "./session";

/** The flag every applied point carries; persist-transcript.ts guards on it. */
export {
  HAND_LABELLED_FLAG,
  OFF_VIDEO_FLAG,
} from "@/lib/services/splitstep/derivation/flags";
import {
  HAND_LABELLED_FLAG,
  OFF_VIDEO_FLAG,
} from "@/lib/services/splitstep/derivation/flags";

/** What the vendor stroke says that the label row does not carry. */
export interface VendorShotFacts {
  speedMph: number | null;
  /** On the analysis clock, trim offset included; null with no bounce. */
  bounceVideoTime: number | null;
}

/** One `shots` insert row, without the `point_id` the insert assigns. */
export interface AppliedShotRow {
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
  bounce_video_time: number | null;
  zone: string | null;
  flags: string[];
  derived: true;
}

/** One `points` insert row (without `match_id`), plus its strokes. */
export interface AppliedPointRow {
  point_number: number;
  set_number: number;
  game_number: number;
  server_is_player1: boolean;
  won_by_player1: boolean;
  rally_length: number | null;
  result_type: string | null;
  is_break_point: boolean;
  is_set_point: boolean;
  is_match_point: boolean;
  set_score: string | null;
  game_score: string | null;
  point_score: string | null;
  video_time: number | null;
  duration: number | null;
  flags: string[];
  derived: true;
  /** Not a column: the label point it came from, for messages. */
  labelPointId: string;
  /** Not a column: the label point's forced/unforced mark, kept only on an error ending. */
  errorKind: "forced" | "unforced" | null;
  /** Not a column: the label point's `point_index`. */
  pointIndex: number;
  shots: AppliedShotRow[];
}

export interface AppliedRows {
  points: AppliedPointRow[];
  /** Rows that cannot be written as they stand. A write refuses on any. */
  problems: string[];
  /** Oddities worth reading before a write, that do not block it. */
  warnings: string[];
  /**
   * Live let serves across the applied points, left out of the written
   * shots on purpose (a let is replayed, not played).
   */
  letsLeftOut: number;
}

export interface ApplyInput {
  /** The session's points, `point_index` order, strokes in any order. */
  points: readonly LabelPoint[];
  adScoring: boolean;
  /** `matches.format.best_of`, else 3 — as persist-transcript.ts reads it. */
  bestOf: number;
  /** By vendor `event_id`; an added stroke has none. */
  vendor?: ReadonlyMap<number, VendorShotFacts>;
  /** Where the video starts in the match; missing or null: at the beginning. */
  start?: LabelStartScore | null;
}

// ── Vocabulary: seed.ts's mappings, inverted ────────────────────────────────

/** `label_shots.stroke` → `shots.shot_type` (inverts seed.ts `labelStroke`). */
export function shotTypeOf(stroke: LabelStroke | null): string | null {
  switch (stroke) {
    case "first_serve":
      return "First Serve";
    case "second_serve":
      return "Second Serve";
    case "forehand":
      return "Forehand";
    case "backhand":
      return "Backhand";
    case "overhead":
      return "Overhead";
    // The derivation files every volley as a bare `Volley`.
    case "forehand_volley":
    case "backhand_volley":
      return "Volley";
    default:
      return null;
  }
}

/**
 * `label_shots.result` → `shots.result` (inverts `labelShotResult`). A let is
 * not a result `shots` can hold; lets are never written (see the header).
 */
export function shotResultOf(result: LabelShotResult | null): string | null {
  if (result === "in") return "In";
  if (result === "out") return "Out";
  if (result === "net") return "Net";
  return null;
}

/** `label_shots.spin` → `shots.spin_type`, the vendor's capitalised word. */
export function spinTypeOf(spin: LabelSpin | null): string | null {
  return spin ? spin[0].toUpperCase() + spin.slice(1) : null;
}

const SIDE_OF_STROKE: Partial<Record<LabelStroke, string>> = {
  forehand: "Forehand",
  backhand: "Backhand",
  overhead: "Overhead",
};

/**
 * `label_points.ending` → `points.result_type` (inverts seed.ts
 * `labelEnding`), the side from the stroke that ended the point. A volley
 * names no side ("Winner"). Labels do not split forced from unforced errors
 * and the derivation never emits a forced one, so every error is unforced —
 * the only error string `calculate_match_stats` counts.
 */
export function resultTypeOf(
  ending: LabelEnding | null,
  lastStroke: LabelStroke | null,
): string | null {
  const side = lastStroke ? SIDE_OF_STROKE[lastStroke] : undefined;
  switch (ending) {
    case "ace":
      return "Ace";
    case "double_fault":
      return "Double Fault";
    case "service_winner":
      return "Service Winner";
    case "winner":
      return side ? `${side} Winner` : "Winner";
    case "error":
      return side ? `${side} Unforced Error` : "Unforced Error";
    default:
      return null;
  }
}

/**
 * The scoreboard's call ("30–15", "Ad–40", "3–2" in a tiebreak) as a
 * `points.point_score`: server-first, hyphenated, `AD` upper-case like the
 * vendor's. Null for no call, and for a "Game–30" call — a point sitting past
 * the end of its game, which has no honest score to start from.
 *
 * A game's call is already server-first. A tiebreak's is player 1's points
 * first (score.ts `tiebreakScore`, since its serve changes every two points),
 * so with player 2 serving (`tiebreakP2Serves`) its two counts swap here — written
 * as it stood, Eli serving at 0–1 in Emon v Eli's set-2 tiebreak read "1-0".
 */
export function pointScoreOf(
  scoreBefore: string | null,
  tiebreakP2Serves = false,
): string | null {
  if (!scoreBefore || /game/i.test(scoreBefore)) return null;
  const score = scoreBefore.replace(/–/g, "-").replace(/\bAd\b/g, "AD");
  if (!tiebreakP2Serves) return score;
  const [a, b] = score.split("-");
  return b === undefined ? score : `${b}-${a}`;
}

/** Server-first "a-b" from a p1/p2 tally. */
function serverFirst(
  tally: Record<LabelSide, number>,
  server: LabelSide,
): string {
  return `${tally[server]}-${tally[opponent(server)]}`;
}

// ── Vendor facts ─────────────────────────────────────────────────────────────

/**
 * Speed and bounce time per vendor `event_id`, from the strokes frozen on
 * `label_shots.vendor`. The bounce clock is fitted through every stroke's
 * frame/time pair at once, as transcript.ts fits it over the match, and the
 * trim offset is added at the parse boundary exactly as the derivation does.
 */
export function vendorShotFacts(
  rawStrokes: readonly unknown[],
  startTimeSeconds: number,
): Map<number, VendorShotFacts> {
  const rows = rawStrokes.filter(
    (raw): raw is RawSplitStepStroke =>
      raw !== null && typeof raw === "object" && !Array.isArray(raw),
  );
  const { strokes } = parseStrokes(rows, {
    startTimeSeconds: Number.isFinite(startTimeSeconds) ? startTimeSeconds : 0,
  });
  const bounces = bounceVideoTimes(strokes);
  const facts = new Map<number, VendorShotFacts>();
  strokes.forEach((stroke, i) => {
    if (stroke.eventId < 0) return;
    facts.set(stroke.eventId, {
      speedMph: stroke.speedKmh === null ? null : kmhToMph(stroke.speedKmh),
      bounceVideoTime: bounces[i] ?? null,
    });
  });
  return facts;
}

// ── The build ────────────────────────────────────────────────────────────────

/** Whether a label point becomes a `points` row at all. */
function isAppliedPoint(point: Pick<LabelPoint, "status" | "ending">): boolean {
  return point.status !== "deleted" && !isNonPointEnding(point.ending);
}

/** The strokes a point writes: live, in video order, lets left out. */
function playedShots(point: Pick<LabelPoint, "shots">): LabelShot[] {
  return liveShotsInOrder(point, true).filter((shot) => !isLetServe(shot));
}

/**
 * Sets won before each set, p1/p2, from the set tallies: a set counts for
 * whoever won more of its settled games, on top of the sets already won
 * before the video started (`start.sets`).
 */
function setsWonBefore(
  points: readonly LabelPoint[],
  games: readonly LabelGameBand[],
  start: LabelStartScore | null,
): Map<number, Record<LabelSide, number>> {
  const before = new Map<number, Record<LabelSide, number>>();
  const won: Record<LabelSide, number> = start
    ? { p1: start.sets[0], p2: start.sets[1] }
    : { p1: 0, p2: 0 };
  for (const set of labelSetScores(points, games, start)) {
    before.set(set.setNumber, { ...won });
    const [a, b] = set.games;
    if (a > b) won.p1 += 1;
    else if (b > a) won.p2 += 1;
  }
  return before;
}

/** "2–1" (p1 first, en dash) → { p1: 2, p2: 1 }. */
function parseGamesBefore(text: string): Record<LabelSide, number> {
  const [a, b] = text.split("–").map((n) => Number(n));
  return { p1: Number.isFinite(a) ? a : 0, p2: Number.isFinite(b) ? b : 0 };
}

/**
 * Build the insert rows for a session. Every point that cannot be written as
 * it stands — no server, no winner, no set or game, a stroke with no hitter —
 * is a `problem`; the script refuses to write while any remain.
 */
export function buildAppliedRows(input: ApplyInput): AppliedRows {
  const { points, adScoring, bestOf, vendor } = input;
  const start = input.start ?? null;
  const problems: string[] = [];
  const warnings: string[] = [];
  const scores = labelScores(points, adScoring, start);
  const bandByGame = new Map(scores.games.map((band) => [gameKey(band), band]));
  // A label game number is a key, not an order: a game the console opens or
  // starts mid-set takes the session's highest number plus one. Published,
  // games are numbered in play order through the match — what the match
  // page's per-set count reads (game-in-set.ts) — by when each first appears.
  const playOrder = new Map(
    scores.games.map((band, index) => [gameKey(band), index + 1]),
  );
  const setsBefore = setsWonBefore(points, scores.games, start);

  const rows: AppliedPointRow[] = [];
  let letsLeftOut = 0;
  for (const point of points) {
    if (!isAppliedPoint(point)) continue;
    const at = `point ${point.pointIndex + 1}`;

    const { server, winner, setNumber, gameNumber } = point;
    if (server === null) problems.push(`${at}: no server`);
    if (winner === null) problems.push(`${at}: no winner`);
    if (setNumber === null || gameNumber === null) {
      problems.push(`${at}: no set or game number`);
    }
    const resolved = publishEnding(point);
    if (resolved.kind === "unresolved") {
      problems.push(`${at}: no ending, and its strokes don't settle one`);
    } else if (resolved.kind === "derived") {
      if (resolved.winner !== null && resolved.winner !== winner) {
        problems.push(
          `${at}: no ending, and the strokes say ${resolved.winner} won`,
        );
      } else {
        warnings.push(
          `${at}: ending taken from its strokes (${resolved.ending}${resolved.endedBy ? ` by ${resolved.endedBy}` : ""})`,
        );
      }
    } else if (resolved.kind === "off_video") {
      warnings.push(`${at}: not on the video — published as score only`);
    }
    const offVideo = resolved.kind === "off_video";
    const settled =
      resolved.kind === "stored" || resolved.kind === "derived"
        ? resolved
        : null;
    const ending = settled?.ending ?? null;
    const endedBy = settled?.endedBy ?? null;
    if (
      server === null ||
      winner === null ||
      setNumber === null ||
      gameNumber === null
    ) {
      continue;
    }

    const played = playedShots(point);
    const live = liveShotsInOrder(point, true);
    letsLeftOut += live.length - played.length;
    const window = live
      .map((shot) => shot.videoTime)
      .filter((t): t is number => t !== null);

    let serveIndex = -1;
    played.forEach((shot, i) => {
      if (isServeStroke(shot.stroke)) serveIndex = i;
    });
    if (played.length > 0 && serveIndex === -1) {
      warnings.push(`${at}: no serve`);
    }
    // With no serve the first stroke stands in for it, rather than the
    // derivation's numbering starting at 2.
    const from = Math.max(serveIndex, 0);

    const shots: AppliedShotRow[] = [];
    played.forEach((shot, i) => {
      if (shot.hitter === null) {
        problems.push(`${at}: stroke ${i + 1} has no hitter`);
        return;
      }
      if (shot.stroke === null) {
        warnings.push(`${at}: stroke ${i + 1} has no stroke type`);
      }
      const facts =
        shot.eventId !== null ? vendor?.get(shot.eventId) : undefined;
      // An in serve whose landing is outside the box carries the wrong
      // bounce: written as in, without the landing or the zone read off it.
      const landed = inServeLandingMiss(shot) === null;
      shots.push({
        shot_number: shotNumber(i, from),
        is_player1: shot.hitter === "p1",
        shot_type: shotTypeOf(shot.stroke),
        spin_type: spinTypeOf(shot.spin),
        speed_mph: facts?.speedMph ?? null,
        contact_x: shot.contactX,
        contact_y: shot.contactY,
        landing_x: landed ? shot.landingX : null,
        landing_y: landed ? shot.landingY : null,
        result: shotResultOf(shot.result),
        video_time: shot.videoTime,
        bounce_video_time: facts?.bounceVideoTime ?? null,
        zone: !landed
          ? null
          : isServeStroke(shot.stroke)
            ? serveZone(shot.landingX)
            : directionZone(shot.landingX, shot.contactX),
        flags: [],
        derived: true,
      });
    });

    const last = played.at(-1) ?? null;
    if (last && endedBy !== null && last.hitter !== endedBy) {
      warnings.push(
        `${at}: ended by ${endedBy}, but the last stroke is ${last.hitter}'s`,
      );
    }
    const serverWins = ending === "ace" || ending === "service_winner";
    if (serverWins && winner !== server) {
      warnings.push(`${at}: ${ending} won by the receiver`);
    }
    if (ending === "double_fault" && winner === server) {
      warnings.push(`${at}: double fault won by the server`);
    }

    const band = bandByGame.get(gameKey(point));
    const games = band ? parseGamesBefore(band.gamesBefore) : { p1: 0, p2: 0 };
    const sets = setsBefore.get(setNumber) ?? { p1: 0, p2: 0 };
    const pointScore = pointScoreOf(
      scores.points.get(point.id)?.scoreBefore ?? null,
      (point.gameType ?? "game") !== "game" && server === "p2",
    );
    if (pointScore === null) {
      warnings.push(`${at}: no point score (past the end of its game?)`);
    }

    // `pressureFor` reads a rally: the server's label and the first stroke's
    // server-first score. The labels give it both, with p1/p2 as the labels.
    const rally = {
      server,
      strokes: [{ predPointScore: pointScore }],
    } as unknown as SplitStepRally;
    const pressure = pressureFor({
      rally,
      labels: ["p1", "p2"],
      gamesThisSet: games,
      setsWon: sets,
      adScoring,
      bestOf,
    });

    const first = window.length > 0 ? Math.min(...window) : null;
    const end = window.length > 0 ? Math.max(...window) : null;

    rows.push({
      point_number: rows.length + 1,
      set_number: setNumber,
      game_number: playOrder.get(gameKey(point)) ?? gameNumber,
      server_is_player1: server === "p1",
      won_by_player1: winner === "p1",
      // Null, not 0, off the video: AVG(rally_length) skips it.
      rally_length: offVideo ? null : Math.max(0, played.length - from),
      result_type: resultTypeOf(ending, last?.stroke ?? null),
      is_break_point: pressure.isBreakPoint,
      is_set_point: pressure.isSetPoint,
      is_match_point: pressure.isMatchPoint,
      set_score: serverFirst(sets, server),
      game_score: serverFirst(games, server),
      point_score: pointScore,
      video_time: first,
      duration:
        first !== null && end !== null ? Math.max(0, end - first) : null,
      flags: offVideo
        ? [HAND_LABELLED_FLAG, OFF_VIDEO_FLAG]
        : [HAND_LABELLED_FLAG],
      derived: true,
      labelPointId: point.id,
      errorKind: ending === "error" ? point.errorKind : null,
      pointIndex: point.pointIndex,
      shots,
    });
  }

  return { points: rows, problems, warnings, letsLeftOut };
}

/** The dry-run / write-summary line naming the lets left out (always printed). */
export function letsLeftOutLine(count: number): string {
  return `lets left out: ${count} (replayed serves, not written as shots)`;
}

/** The `points` insert row for a built point: its columns only. */
export function pointInsertRow(matchId: string, point: AppliedPointRow) {
  return {
    match_id: matchId,
    point_number: point.point_number,
    set_number: point.set_number,
    game_number: point.game_number,
    server_is_player1: point.server_is_player1,
    won_by_player1: point.won_by_player1,
    rally_length: point.rally_length,
    result_type: point.result_type,
    is_break_point: point.is_break_point,
    is_set_point: point.is_set_point,
    is_match_point: point.is_match_point,
    set_score: point.set_score,
    game_score: point.game_score,
    point_score: point.point_score,
    video_time: point.video_time,
    duration: point.duration,
    flags: point.flags,
    derived: point.derived,
  };
}

// ── The preview ──────────────────────────────────────────────────────────────

export interface SideStats {
  pointsWon: number;
  servicePoints: number;
  serviceGames: number;
  aces: number;
  doubleFaults: number;
  serviceWinners: number;
  winners: number;
  /** Errors marked forced; `unforcedErrors` counts every other error, unmarked included. */
  forcedErrors: number;
  unforcedErrors: number;
  firstServesIn: number;
  firstServes: number;
  breakPointsFaced: number;
  breakPointsWon: number;
}

export interface ExpectedStats {
  points: number;
  shots: number;
  games: number;
  p1: SideStats;
  p2: SideStats;
}

function emptySide(): SideStats {
  return {
    pointsWon: 0,
    servicePoints: 0,
    serviceGames: 0,
    aces: 0,
    doubleFaults: 0,
    serviceWinners: 0,
    winners: 0,
    forcedErrors: 0,
    unforcedErrors: 0,
    firstServesIn: 0,
    firstServes: 0,
    breakPointsFaced: 0,
    breakPointsWon: 0,
  };
}

/**
 * What the statistics should read once the rows are in: counted straight off
 * the built rows, for a dry run to hold against the table it means to fix.
 * An approximation of `calculate_match_stats`, not a copy of it — the write
 * prints the real before/after.
 */
export function expectedStats(
  points: readonly AppliedPointRow[],
): ExpectedStats {
  const stats = { p1: emptySide(), p2: emptySide() };
  const servedGames = new Set<string>();
  let shots = 0;
  for (const point of points) {
    shots += point.shots.length;
    const server: LabelSide = point.server_is_player1 ? "p1" : "p2";
    const receiver = opponent(server);
    const winner: LabelSide = point.won_by_player1 ? "p1" : "p2";
    // Who struck the ending: the server for an ace or double fault, the
    // receiver's error for a service winner, else the last stroke's hitter.
    const last = point.shots.at(-1);
    const striker: LabelSide = last ? (last.is_player1 ? "p1" : "p2") : server;

    stats[winner].pointsWon += 1;
    stats[server].servicePoints += 1;
    const key = `${point.set_number}·${point.game_number}`;
    if (!servedGames.has(key)) {
      servedGames.add(key);
      stats[server].serviceGames += 1;
    }
    switch (point.result_type) {
      case "Ace":
        stats[server].aces += 1;
        break;
      case "Double Fault":
        stats[server].doubleFaults += 1;
        break;
      case "Service Winner":
        stats[server].serviceWinners += 1;
        break;
      default:
        if (point.result_type?.endsWith("Winner")) stats[striker].winners += 1;
        else if (point.result_type?.endsWith("Unforced Error")) {
          if (point.errorKind === "forced") stats[striker].forcedErrors += 1;
          else stats[striker].unforcedErrors += 1;
        }
    }
    const firstServe = point.shots.find((s) => s.shot_type === "First Serve");
    if (firstServe) {
      stats[server].firstServes += 1;
      if (firstServe.result === "In") stats[server].firstServesIn += 1;
    }
    if (point.is_break_point) {
      stats[server].breakPointsFaced += 1;
      if (winner === receiver) stats[receiver].breakPointsWon += 1;
    }
  }
  return {
    points: points.length,
    shots,
    games: servedGames.size,
    ...stats,
  };
}

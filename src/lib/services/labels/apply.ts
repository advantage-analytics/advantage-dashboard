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
 *   `not_a_point`, in `point_index` order.
 * - A replayed let (`let_replayed`) is written whole, strokes and all, so the
 *   Video tab can show it, and flagged `let_replayed` (`LET_REPLAYED_FLAG`)
 *   with `result_type` 'Let' (`LET_POINT_RESULT`). It is no point: the score
 *   before it is the score before the point that replays it (it never moves
 *   `labelScores`), it carries no pressure flag and no rally length, and its
 *   `won_by_player1` — NOT NULL — is a placeholder, the server. Every reader
 *   that counts must skip the flag.
 * - Its strokes are the live ones (`isLiveShot` with ghosts on: no tombstone,
 *   no site-removed stroke the labeller never restored), in video order.
 * - A let serve (`isLetServe`) is replayed, not played: it is written at
 *   `shot_number` 0 with `result` 'Let' (`LET_RESULT`) and no `zone`, its
 *   landing kept, so the report can show it while every serve count skips it
 *   (`calculate_match_stats` and the readers filter `result = 'Let'`). It
 *   neither counts as a first serve in or out nor moves the counted serve.
 * - A stroke that is not a serve, before the counted serve
 *   (`countedServeIndex`), was hit at a fault or a let — nothing is in play
 *   until the serve that counts. It is dropped, as the derivation's
 *   `playedRally` drops it, and counted in `droppedBeforeServe`. It still
 *   widens the point's clip window.
 * - A serve stored in whose landing reads out or net (`inServeLandingMiss`)
 *   is written as in with its landing and zone as labelled: the call is the
 *   labeller's, and the landing is what they placed.
 * - A stroke whose landing is the next air stroke's contact, filled or stored
 *   there (volley-link.ts), is written with the `zone` that place reads as and
 *   no `landing_x` / `landing_y`: the ball never bounced there. A landing stored
 *   anywhere else is a bounce and goes out.
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
import {
  allErrorsJudged,
  endingContradictsWinner,
  publishEnding,
} from "./ending-derived";
import {
  inServeLandingMiss,
  isServeByReceiver,
  playedOnResult,
} from "./shot-derived";
import { filledLanding, landingTakesContact } from "./volley-link";
import { gameKey, labelScores, type LabelGameBand } from "./score";
import { labelSetScores } from "./set-scores";
import {
  isLetServe,
  isServeStroke,
  liveShotsInOrder,
  opponent,
  type LabelEnding,
  type LabelErrorKind,
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
  LET_REPLAYED_FLAG,
  OFF_VIDEO_FLAG,
} from "@/lib/services/splitstep/derivation/flags";
import {
  HAND_LABELLED_FLAG,
  LET_REPLAYED_FLAG,
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
  /**
   * Not a column: the labeller's forced/unforced mark, kept only on an error
   * ending with a stroke to carry it. Stays when `result_type` cannot say it
   * (`AppliedRows.errorsJudged` false): the console's own count reads this.
   */
  errorKind: "forced" | "unforced" | null;
  /** Not a column: the label point's `point_index`. */
  pointIndex: number;
  shots: AppliedShotRow[];
}

export interface AppliedRows {
  points: AppliedPointRow[];
  /**
   * Every error in the session is marked (`allErrorsJudged`). False, every
   * error's `result_type` says "Unforced Error"; the marks stay in label_points.
   */
  errorsJudged: boolean;
  /** Rows that cannot be written as they stand. A write refuses on any. */
  problems: string[];
  /** Oddities worth reading before a write, that do not block it. */
  warnings: string[];
  /**
   * Live let serves across the applied points, written at shot 0 as
   * `LET_RESULT` rows that no serve count reads.
   */
  letsKept: number;
  /**
   * Replayed lets (`let_replayed`) written as `LET_REPLAYED_FLAG` points,
   * which no statistic reads.
   */
  letPointsKept: number;
  /**
   * Strokes other than serves before a point's counted serve — hit at a
   * fault or a let — dropped from the written shots (`splitPointStrokes`).
   */
  droppedBeforeServe: number;
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
 * `shots.result` on a let serve: written at `shot_number` 0, and skipped by
 * every serve count (`calculate_match_stats`, the serve and return readers).
 * Also the `points.result_type` of a replayed let (`LET_REPLAYED_FLAG`) — the
 * flag, not this string, is what readers filter on.
 */
export const LET_RESULT = "Let";

/**
 * `label_shots.result` → `shots.result` (inverts `labelShotResult`). A let is
 * `LET_RESULT`, only ever on a serve (`label_shots_let_serve_only`).
 */
export function shotResultOf(result: LabelShotResult | null): string | null {
  if (result === "in") return "In";
  if (result === "out") return "Out";
  if (result === "net") return "Net";
  if (result === "let") return LET_RESULT;
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
 * names no side ("Winner"). An error carries the kind it is given: "Forced
 * Error" when forced, else "Unforced Error", which is what every reader counted
 * before the split existed. `calculate_match_stats` counts the forced string
 * only on a match whose errors were all judged (`matches.errors_judged_at`),
 * so `buildAppliedRows` passes a forced kind only when the publish stamps that
 * marker. A forced string on an unjudged match lands in neither stat column.
 *
 * `self_review_result_type()` (migration 20261028025013) is this function's
 * SQL twin, used by the self-review views: change one and change the other.
 */
export function resultTypeOf(
  ending: LabelEnding | null,
  lastStroke: LabelStroke | null,
  errorKind: LabelErrorKind | null = null,
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
    case "error": {
      const kind = errorKind === "forced" ? "Forced Error" : "Unforced Error";
      return side ? `${side} ${kind}` : kind;
    }
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

/**
 * Whether a label point becomes a `points` row at all: every live one but a
 * `not_a_point` row. A replayed let does, flagged (`isLetPoint`).
 */
function isAppliedPoint(point: Pick<LabelPoint, "status" | "ending">): boolean {
  return point.status !== "deleted" && point.ending !== "not_a_point";
}

/** A replayed let: written whole, flagged `let_replayed`, counted as nothing. */
function isLetPoint(point: Pick<LabelPoint, "ending">): boolean {
  return point.ending === "let_replayed";
}

/** A built row is a replayed let (`LET_REPLAYED_FLAG`). */
export function isLetPointRow(point: Pick<AppliedPointRow, "flags">): boolean {
  return point.flags.includes(LET_REPLAYED_FLAG);
}

/**
 * A point's live strokes split three ways: `played`, the rally numbered and
 * counted (lets out, and no stroke but a serve before the counted serve);
 * `lets`, the replayed serves written at shot 0; `dropped`, the strokes hit
 * at a fault or a let before the counted serve, never written.
 */
export function splitPointStrokes(
  live: readonly LabelShot[],
  server: LabelSide,
): { played: LabelShot[]; lets: LabelShot[]; dropped: LabelShot[] } {
  const lets = live.filter((shot) => isLetServe(shot));
  const rally = live.filter((shot) => !isLetServe(shot));
  const counted = countedServeIndex(rally, server);
  const dropped: LabelShot[] = [];
  const played: LabelShot[] = [];
  rally.forEach((shot, i) => {
    (i < counted && !isServeStroke(shot.stroke) ? dropped : played).push(shot);
  });
  return { played, lets, dropped };
}

/**
 * The `shots` rows of one point's live strokes, in video order: the rally
 * (`played`) numbered from the counted serve, each let at shot 0, and the
 * strokes before the counted serve that are not serves left out
 * (`splitPointStrokes`). `at` names the point in messages.
 */
function buildShotRows(
  live: readonly LabelShot[],
  server: LabelSide,
  ending: LabelEnding | null,
  vendor: ReadonlyMap<number, VendorShotFacts> | undefined,
  at: string,
): {
  shots: AppliedShotRow[];
  played: LabelShot[];
  from: number;
  lets: number;
  dropped: number;
  problems: string[];
  warnings: string[];
} {
  const problems: string[] = [];
  const warnings: string[] = [];
  const { played, lets, dropped } = splitPointStrokes(live, server);
  const serveIndex = countedServeIndex(played, server);
  if (played.length > 0 && serveIndex === -1) {
    warnings.push(`${at}: no serve`);
  }
  played.forEach((shot, i) => {
    if (isServeByReceiver(shot, server)) {
      warnings.push(
        `${at}: stroke ${i + 1} is a serve by ${shot.hitter}, but ${server} is serving`,
      );
    }
  });
  // With no serve the first stroke stands in for it, rather than the
  // derivation's numbering starting at 2.
  const from = Math.max(serveIndex, 0);

  const byId = new Map<string, AppliedShotRow>();
  const base = (shot: LabelShot) => {
    const facts = shot.eventId !== null ? vendor?.get(shot.eventId) : undefined;
    return {
      is_player1: shot.hitter === "p1",
      shot_type: shotTypeOf(shot.stroke),
      spin_type: spinTypeOf(shot.spin),
      speed_mph: facts?.speedMph ?? null,
      contact_x: shot.contactX,
      contact_y: shot.contactY,
      video_time: shot.videoTime,
      bounce_video_time: facts?.bounceVideoTime ?? null,
      flags: [],
      derived: true as const,
    };
  };
  const named = (shot: LabelShot) => `stroke ${live.indexOf(shot) + 1}`;
  played.forEach((shot, i) => {
    // Met in the air, so its zone reads off where the next stroke met it. It
    // never bounced, so no landing goes out for the courts to draw as one.
    const next = played[i + 1];
    const filled = filledLanding(shot, next);
    const metInAir = landingTakesContact(shot, next, false);
    if (shot.hitter === null) {
      problems.push(`${at}: ${named(shot)} has no hitter`);
      return;
    }
    if (shot.stroke === null) {
      warnings.push(`${at}: ${named(shot)} has no stroke type`);
    }
    byId.set(shot.id, {
      ...base(shot),
      shot_number: shotNumber(i, from),
      landing_x: metInAir ? null : shot.landingX,
      landing_y: metInAir ? null : shot.landingY,
      result: shotResultOf(playedOnResult(shot, next, ending)),
      zone: isServeStroke(shot.stroke)
        ? serveZone(shot.landingX)
        : directionZone(filled?.x ?? shot.landingX, shot.contactX),
    });
  });
  for (const shot of lets) {
    if (shot.hitter === null) {
      problems.push(`${at}: ${named(shot)} (a let) has no hitter`);
      continue;
    }
    byId.set(shot.id, {
      ...base(shot),
      shot_number: 0,
      landing_x: shot.landingX,
      landing_y: shot.landingY,
      result: LET_RESULT,
      // No placement: a let is no serve of the point's.
      zone: null,
    });
  }
  const shots = live.flatMap((shot) => {
    const row = byId.get(shot.id);
    return row ? [row] : [];
  });
  return {
    shots,
    played,
    from,
    lets: lets.length,
    dropped: dropped.length,
    problems,
    warnings,
  };
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
  const errorsJudged = allErrorsJudged(points);

  const rows: AppliedPointRow[] = [];
  let letsKept = 0;
  let letPointsKept = 0;
  let droppedBeforeServe = 0;
  for (const point of points) {
    if (!isAppliedPoint(point)) continue;
    const at = `point ${point.pointIndex + 1}`;
    if (isLetPoint(point)) {
      const row = buildLetPointRow(point, {
        at,
        pointNumber: rows.length + 1,
        vendor,
        scores,
        playOrder,
        bandByGame,
        setsBefore,
      });
      problems.push(...row.problems);
      warnings.push(...row.warnings);
      if (row.row) {
        rows.push(row.row);
        letPointsKept += 1;
        letsKept += row.lets;
        droppedBeforeServe += row.dropped;
      }
      continue;
    }

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

    const live = liveShotsInOrder(point, true);
    const built = buildShotRows(live, server, ending, vendor, at);
    problems.push(...built.problems);
    warnings.push(...built.warnings);
    const { played, from, shots } = built;
    letsKept += built.lets;
    droppedBeforeServe += built.dropped;
    const window = live
      .map((shot) => shot.videoTime)
      .filter((t): t is number => t !== null);

    const last = played.at(-1) ?? null;
    if (last && endedBy !== null && last.hitter !== endedBy) {
      warnings.push(
        `${at}: ended by ${endedBy}, but the last stroke is ${last.hitter}'s`,
      );
    }
    if (endingContradictsWinner({ ending, endedBy, winner })) {
      warnings.push(`${at}: ${ending} by ${endedBy}, won by ${winner}`);
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

    const errorKind =
      ending === "error" && played.length > 0 ? point.errorKind : null;
    rows.push({
      point_number: rows.length + 1,
      set_number: setNumber,
      game_number: playOrder.get(gameKey(point)) ?? gameNumber,
      server_is_player1: server === "p1",
      won_by_player1: winner === "p1",
      // Null, not 0, off the video: AVG(rally_length) skips it.
      rally_length: offVideo ? null : Math.max(0, played.length - from),
      result_type: resultTypeOf(
        ending,
        last?.stroke ?? null,
        errorsJudged ? errorKind : null,
      ),
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
      errorKind,
      pointIndex: point.pointIndex,
      shots,
    });
  }

  return {
    points: rows,
    errorsJudged,
    problems,
    warnings,
    letsKept,
    letPointsKept,
    droppedBeforeServe,
  };
}

/**
 * One replayed let's row. Its strokes are written as any point's are
 * (`buildShotRows`, no ending), so the Video tab can play and list them; the
 * score columns are the score it was played at, which the point that replays
 * it starts from too. Nothing on it is a fact a statistic may read.
 */
function buildLetPointRow(
  point: LabelPoint,
  ctx: {
    at: string;
    pointNumber: number;
    vendor: ReadonlyMap<number, VendorShotFacts> | undefined;
    scores: ReturnType<typeof labelScores>;
    playOrder: ReadonlyMap<string, number>;
    bandByGame: ReadonlyMap<string, LabelGameBand>;
    setsBefore: ReadonlyMap<number, Record<LabelSide, number>>;
  },
): {
  row: AppliedPointRow | null;
  lets: number;
  dropped: number;
  problems: string[];
  warnings: string[];
} {
  const { at } = ctx;
  const problems: string[] = [];
  const { server, setNumber, gameNumber } = point;
  if (server === null) problems.push(`${at} (a let): no server`);
  if (setNumber === null || gameNumber === null) {
    problems.push(`${at} (a let): no set or game number`);
  }
  if (server === null || setNumber === null || gameNumber === null) {
    return { row: null, lets: 0, dropped: 0, problems, warnings: [] };
  }
  const live = liveShotsInOrder(point, true);
  const built = buildShotRows(live, server, null, ctx.vendor, `${at} (a let)`);
  const window = live
    .map((shot) => shot.videoTime)
    .filter((t): t is number => t !== null);
  const first = window.length > 0 ? Math.min(...window) : null;
  const end = window.length > 0 ? Math.max(...window) : null;
  const band = ctx.bandByGame.get(gameKey(point));
  const games = band ? parseGamesBefore(band.gamesBefore) : { p1: 0, p2: 0 };
  const sets = ctx.setsBefore.get(setNumber) ?? { p1: 0, p2: 0 };
  return {
    row: {
      point_number: ctx.pointNumber,
      set_number: setNumber,
      game_number: ctx.playOrder.get(gameKey(point)) ?? gameNumber,
      server_is_player1: server === "p1",
      // NOT NULL, and meaningless: the server, by convention. Every reader
      // skips the row by its flag before it could read this.
      won_by_player1: server === "p1",
      // Null like an off-video point's: AVG(rally_length) skips it.
      rally_length: null,
      result_type: LET_RESULT,
      is_break_point: false,
      is_set_point: false,
      is_match_point: false,
      set_score: serverFirst(sets, server),
      game_score: serverFirst(games, server),
      point_score: pointScoreOf(
        ctx.scores.points.get(point.id)?.scoreBefore ?? null,
        (point.gameType ?? "game") !== "game" && server === "p2",
      ),
      video_time: first,
      duration:
        first !== null && end !== null ? Math.max(0, end - first) : null,
      flags: [HAND_LABELLED_FLAG, LET_REPLAYED_FLAG],
      derived: true,
      labelPointId: point.id,
      errorKind: null,
      pointIndex: point.pointIndex,
      shots: built.shots,
    },
    lets: built.lets,
    dropped: built.dropped,
    problems: [...problems, ...built.problems],
    warnings: built.warnings,
  };
}

/** The dry-run / write-summary lines for lets and dropped strokes (always printed). */
export function letsAndDroppedLines(
  built: Pick<AppliedRows, "letsKept" | "letPointsKept" | "droppedBeforeServe">,
): string[] {
  return [
    `lets kept: ${built.letsKept} (replayed serves, written at shot 0, counted as nothing)`,
    `let points kept: ${built.letPointsKept} (replayed points, written flagged let_replayed, counted as nothing)`,
    `strokes before the serve dropped: ${built.droppedBeforeServe} (hit at a fault or a let)`,
  ];
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
  /** Errors counted forced (`expectedStats`); `unforcedErrors` counts every other error. */
  forcedErrors: number;
  unforcedErrors: number;
  firstServesIn: number;
  firstServes: number;
  breakPointsFaced: number;
  breakPointsWon: number;
}

export interface ExpectedStats {
  /** Points that count: a replayed let (`isLetPointRow`) is not one. */
  points: number;
  /** Every shot written, a let point's included. */
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
 *
 * Errors split as the rows will publish, off `result_type`. `labellerMarks`
 * splits them by the labeller's own marks instead, for the console's overview:
 * a partly marked session publishes no forced string, and the labeller still
 * sees the forced errors marked so far.
 */
export function expectedStats(
  points: readonly AppliedPointRow[],
  options: { labellerMarks?: boolean } = {},
): ExpectedStats {
  const stats = { p1: emptySide(), p2: emptySide() };
  const servedGames = new Set<string>();
  let shots = 0;
  let counted = 0;
  for (const point of points) {
    shots += point.shots.length;
    // A replayed let is written to be shown, never counted.
    if (isLetPointRow(point)) continue;
    counted += 1;
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
        else if (point.result_type?.endsWith("Error")) {
          // As calculate_match_stats splits them: "…Forced Error" (not
          // "…Unforced") is forced, every other error string unforced.
          const forced = options.labellerMarks
            ? point.errorKind === "forced"
            : !point.result_type.endsWith("Unforced Error");
          if (forced) stats[striker].forcedErrors += 1;
          else stats[striker].unforcedErrors += 1;
        }
    }
    // A let is replayed, not the first serve (`LET_RESULT`).
    const firstServe = point.shots.find(
      (s) => s.shot_type === "First Serve" && s.result !== LET_RESULT,
    );
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
    points: counted,
    shots,
    games: servedGames.size,
    ...stats,
  };
}

/**
 * Where a point's numbering starts: its last serve hit by the server, the
 * serve that counted. A serve typed on the receiver is never that serve — a
 * mid-rally overhead left as a "second serve" once numbered the seven strokes
 * before it 0 (Emon van Loben Sels v Eli Stephenson, point 120) — unless the
 * server hit none at all, where the point's server is what is wrong and its
 * last serve stands, as before. A serve that directly follows the server's
 * is still the service, whoever it is typed on: a second serve with the
 * wrong hitter stays the counted serve, so a faulted first serve is never
 * numbered 1. -1 with no serve.
 */
export function countedServeIndex(
  played: readonly Pick<LabelShot, "stroke" | "hitter">[],
  server: LabelSide,
): number {
  const lastServe = (own: boolean) =>
    played.findLastIndex(
      (shot) => isServeStroke(shot.stroke) && (!own || shot.hitter === server),
    );
  const byServer = lastServe(true);
  if (byServer === -1) return lastServe(false);
  let at = byServer;
  while (isServeStroke(played[at + 1]?.stroke)) at += 1;
  return at;
}

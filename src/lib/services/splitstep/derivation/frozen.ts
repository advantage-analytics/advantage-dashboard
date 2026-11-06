/**
 * Where the vendor's score stream froze mid-match, and the games inside it.
 *
 * Job ac56ef8b (Quan v Balciunas, 2026-09-30): from the first rally of set two
 * to the end of the video, all 38 rallies read point 0-0, game 0-0, set 1-0,
 * and the first stroke of every one was labelled Rudy — including back-to-back
 * games served from opposite ends, which one player cannot do. No winner rule
 * can read a transition that never happens, so all 38 resolved no winner and
 * the match was refused. The tail rule (collapsedTailStart) did not apply: the
 * set score still read, so it was not a reset, and folding a whole set into one
 * game would have been wrong anyway.
 *
 * The serve itself still says where the games are. Each game opens from the
 * deuce court, and a new game is a new server: from the OTHER end when the
 * players stay put, from the SAME end after a changeover — which follows a
 * break long enough to sit down (server-witness.ts measured 85–141 s against
 * at most 58 s between games without one). On that match's set two this reads
 * seven games with changeovers after games 1, 3 and 5, exactly the pattern the
 * rules require.
 *
 * The vendor's score is trusted wherever it reads; this applies only to a run
 * of identical score readings longer than any game can be.
 *
 * Pure: no I/O.
 */

import { serveCourtSide } from "./court";
import { serveEnd, type CourtEnd } from "./position";
import { lastServeIndex } from "./result-type";
import { opponentOf } from "./rallies";
import { CHANGEOVER_MIN_GAP_S } from "./server-witness";
import type { SplitStepRally } from "./types";

/**
 * Shortest run of identical score readings treated as frozen. A no-ad game is
 * at most seven points and an ad game moves its point score every point, so
 * eight rallies on one reading cannot be a game the stream is following. A
 * shorter stall is the stream lagging inside a game, and stays in that game.
 */
export const FROZEN_MIN_RALLIES = 8;

export interface FrozenStretch {
  /** Index of the first frozen rally. */
  start: number;
  /** Index one past the last frozen rally. */
  end: number;
}

function scoreReading(rally: SplitStepRally): string {
  const first = rally.strokes[0];
  return `${first?.predSetScore}|${first?.predGameScore}|${first?.predPointScore}`;
}

/** Runs of at least FROZEN_MIN_RALLIES identical score readings, before `limit`. */
export function frozenStretches(
  rallies: readonly SplitStepRally[],
  limit: number = rallies.length,
): FrozenStretch[] {
  const stretches: FrozenStretch[] = [];
  let start = 0;
  while (start < limit) {
    const reading = scoreReading(rallies[start]);
    let end = start + 1;
    while (end < limit && scoreReading(rallies[end]) === reading) end += 1;
    if (end - start >= FROZEN_MIN_RALLIES) stretches.push({ start, end });
    start = end;
  }
  return stretches;
}

/**
 * For each rally in a frozen run, whether it opens a new game — read from the
 * serve alone. The first rally is always false: whether the run opens on a new
 * game is the score stream's call, made by the caller.
 */
export function frozenGameStarts(run: readonly SplitStepRally[]): boolean[] {
  let previousEnd: CourtEnd | null = null;
  let previousTime: number | null = null;

  return run.map((rally, i) => {
    const serve = rally.strokes[lastServeIndex(rally)] ?? rally.strokes[0];
    const end = serveEnd(rally);
    const side = serve
      ? serveCourtSide(serve.playerX, serve.playerY ?? null)
      : null;
    const time = serve?.videoTime ?? null;

    let starts = false;
    if (i > 0) {
      const switchedEnds =
        end !== null && previousEnd !== null && end !== previousEnd;
      const changeover =
        side === "deuce" &&
        time !== null &&
        previousTime !== null &&
        time - previousTime >= CHANGEOVER_MIN_GAP_S;
      starts = switchedEnds || changeover;
    }

    previousEnd = end ?? previousEnd;
    previousTime = time ?? previousTime;
    return starts;
  });
}

/**
 * The rally with `server` serving. The vendor's labels froze with its score
 * (see the module header), so when they name the other player every stroke's
 * label is swapped: the hitting order is right, only the names are crossed.
 */
export function withServer(
  rally: SplitStepRally,
  server: string,
  labels: string[],
): SplitStepRally {
  if (rally.server === server) return rally;
  const swap = (label: string) => opponentOf(label, labels) ?? label;
  const strokes = rally.strokes.map((s) => ({
    ...s,
    playerLabel: swap(s.playerLabel),
  }));
  return {
    ...rally,
    strokes,
    server,
    serves: strokes.filter((s) => s.strokeType === "serve"),
  };
}

/** Fewest points a stream must have before `stalledScoreStream` judges it. */
export const STALLED_MIN_POINTS = 10;

/**
 * Most points one game reading can plausibly last. A game is four points at
 * the least and a long deuce game rarely passes a dozen; across the 21
 * complete label sessions and the 12 reprocessed matches (2026-11-06) the
 * longest honest run was 24 points, on a match of 149.
 */
export const STALLED_RUN_POINTS = 14;

/** A match whose score stream barely moved: what the warning says. */
export interface ScoreStreamStall {
  points: number;
  /** Times the set-and-game reading changed from one point to the next. */
  gameChanges: number;
  /** Points inside a reading held longer than `STALLED_RUN_POINTS`. */
  stalledPoints: number;
}

/**
 * Whether the vendor's game score stood still over most of the match: at
 * least half its points sit inside one set-and-game reading held for more
 * than `STALLED_RUN_POINTS` points. Read from each point's set and game
 * reading in order (`points.set_score` / `game_score`); a reading left null —
 * a frozen stretch's, or the sentinel — repeats the one before it.
 *
 * Measured over the same 33 files: it names Yen Yen's new-model file
 * (da20720e, every one of 38 readings 0-0) and 3558742b's (one game held for
 * 15 of 17 points), and no other. A short clip of two long deuce games
 * (79d71fd5, 16 points) is not a stall, which a changes-per-point rate read
 * as one.
 *
 * Never a refusal: the derivation still builds every point (games from the
 * serve, winners from the last shot, above), and this only says how little of
 * it the score stream could vouch for. `score_frozen` marks the points of a
 * frozen stretch one by one; this is the match-level reading beside it, and
 * it also catches a game score stuck while the point score moves, which
 * `frozenStretches` (whole readings identical) does not.
 */
export function stalledScoreStream(
  readings: ReadonlyArray<{
    set_score: string | null;
    game_score: string | null;
  }>,
): ScoreStreamStall | null {
  if (readings.length < STALLED_MIN_POINTS) return null;
  let gameChanges = 0;
  let stalledPoints = 0;
  let previous: string | null = null;
  let run = 0;
  // A tiebreak is one game reading for its whole length: 6-6 in a set, or
  // 0-0 games at a level set score (1-1) for a match tiebreak. Held that
  // long by an honest stream, so such a run never counts as stalled.
  const closeRun = () => {
    if (run > STALLED_RUN_POINTS && !isTiebreakReading(previous)) {
      stalledPoints += run;
    }
  };
  for (const { set_score, game_score } of readings) {
    const reading: string | null =
      set_score === null || game_score === null
        ? previous
        : `${set_score}|${game_score}`;
    if (previous !== null && reading !== previous) {
      gameChanges += 1;
      closeRun();
      run = 0;
    }
    run += 1;
    previous = reading;
  }
  closeRun();
  return stalledPoints * 2 >= readings.length
    ? { points: readings.length, gameChanges, stalledPoints }
    : null;
}

/** A `set|game` reading that is a tiebreak's (see `stalledScoreStream`). */
function isTiebreakReading(reading: string | null): boolean {
  if (reading === null) return false;
  const [set, game] = reading.split("|");
  const sides = (score: string) => score.split("-").map((p) => p.trim());
  const [g1, g2] = sides(game ?? "");
  if (g1 === "6" && g2 === "6") return true;
  const [s1, s2] = sides(set ?? "");
  return g1 === "0" && g2 === "0" && s1 === s2 && s1 !== "0" && s1 !== "";
}

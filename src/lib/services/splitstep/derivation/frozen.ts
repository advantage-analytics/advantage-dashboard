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

/**
 * A tournament entry's run, as pure functions.
 *
 * Lifted out of `tournament-detail.tsx` so the two questions the page asks
 * about a run — which draws it crossed, and how it ended — can be pinned by a
 * spec without rendering anything. Both are answered from the MATCHES, never
 * from a stored summary: a run's shape changes every time a result is added or
 * corrected, and a stored "out in QF" is a sentence that stops being true the
 * moment a coach fixes a score.
 */

import { matchWon } from "./entry-state";
import { drawOfRound, roundLongLabel, roundRank } from "./format";
import type { EventEntry } from "./types";

/**
 * An entry's matches bucketed by the draw each round belongs to, in the order
 * the draws were first entered.
 *
 * Moved verbatim from `tournament-detail.tsx` — signature and rule unchanged.
 * The draw comes from `drawOfRound(match.round)` and falls back to the entry's
 * own `draw` only when the round says nothing: `entry.draw` records where a
 * player STARTED, so using it to label their later rounds put a qualifier's R32
 * under "Qualifying" and hid the fact they had come through.
 */
export function groupByDraw(entry: EventEntry) {
  const home = entry.draw ?? "Main draw";
  const order: string[] = [];
  const buckets = new Map<string, EventEntry["matches"]>();

  for (const match of entry.matches) {
    const draw = drawOfRound(match.round) ?? home;
    if (!buckets.has(draw)) {
      buckets.set(draw, []);
      order.push(draw);
    }
    buckets.get(draw)!.push(match);
  }

  return order.map((draw) => ({ draw, matches: buckets.get(draw)! }));
}

/**
 * How the run ended — "out in the quarter-final", "won the final",
 * "through the round of 16" — or null when nothing has been played.
 *
 * Read off the FURTHEST round the entry reached (`roundRank`, the same ladder
 * the rows are sorted by), not off the last row in the array: `matches` arrives
 * in whatever order Postgres returned, and a weekend that read R32, Q1, Q2
 * would otherwise report a player as out in qualifying after they came through
 * it.
 *
 * "through" rather than "into" for a round still standing, because a run whose
 * furthest match is won and unfinished is exactly that — the player is through
 * it and the next round is not on the page yet. Only `F` won is a title, and it
 * is the one sentence here that claims an event is over.
 */
export function runFinish(entry: EventEntry): string | null {
  if (entry.matches.length === 0) return null;

  // Rounds we recognise decide the furthest point. When none are recognised
  // there is no ladder to read, so the array's last row is the only answer
  // available — `reduce` over an all-`MAX_SAFE_INTEGER` pool lands there.
  const ranked = entry.matches.filter(
    (match) => roundRank(match.round) !== Number.MAX_SAFE_INTEGER,
  );
  const pool = ranked.length > 0 ? ranked : entry.matches;
  const last = pool.reduce((furthest, match) =>
    roundRank(match.round) >= roundRank(furthest.round) ? match : furthest,
  );

  if (!last.round) return null;

  const label = roundLongLabel(last.round);
  const won = matchWon(last);

  if (won === false) return `out in ${label}`;
  if (won === true && last.round.toUpperCase() === "F") return "won the final";
  return `through ${label}`;
}

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
import { drawOfRound, ROUND_ORDER, roundLongLabel, roundRank } from "./format";
import type { EntryMatch, EventEntry } from "./types";

/**
 * The part of an entry the round pickers read: where it started and which
 * rounds it holds. An `EventEntry` is one; the score flow builds one from its
 * `recordedRounds` without holding the entry itself.
 */
export type RunRounds = {
  draw: string | null;
  matches: readonly { round: string | null }[];
};

/**
 * The round after the last one recorded, so the common case is pre-picked.
 *
 * One ladder, `ROUND_ORDER` — the same one the run is sorted by. A second
 * list would let the score page offer a round the sort does not know, which
 * sends that match to the end of the run. And a round already recorded is
 * never the default: `recordResult` de-duplicates on (entry, round) and would
 * UPDATE the recorded quarter-final with the semi-final's score, losing the
 * earlier result with no error.
 */
export function nextRound(entry: RunRounds): string {
  const last = entry.matches[entry.matches.length - 1]?.round;
  if (!last) {
    return entry.draw?.toLowerCase().includes("qualif") ? "Q1" : "R32";
  }
  const index = ROUND_ORDER.indexOf(last);
  return index >= 0 && index < ROUND_ORDER.length - 1
    ? ROUND_ORDER[index + 1]
    : last;
}

/** `drawOfRound`'s names for the two draws a qualifier crosses. */
const QUALIFYING = "Qualifying";
const MAIN_DRAW = "Main draw";
/** Where a fresh main-draw run starts — the same default `nextRound` uses. */
const MAIN_DRAW_START = "R32";

/**
 * The round to open after saving `savedRound`, or null when nothing follows.
 *
 * A WIN moves the entry one step up its own draw — the next `ROUND_ORDER`
 * entry whose `drawOfRound` matches (R32→R16, QF→SF, Q1→Q2, C1→C2). Read off
 * the ladder and `drawOfRound` rather than a list of its own, so a round added
 * to the ladder is picked up here with no second edit.
 *
 * - **A won `F`** is a title: null, nothing follows it.
 * - **The last round of a draw** with nothing after it in the same draw: a
 *   qualifier's last round won carries them into the main draw — the first
 *   main-draw round after the furthest one the entry already holds, or the
 *   run's usual main-draw start (R32, as `nextRound` opens a fresh entry)
 *   when it holds none. Null when the ladder defines no main draw, and for
 *   any other draw (the last consolation round) — there is nowhere to go.
 * - **An unrecognised round** has no ladder position: null.
 *
 * A LOSS — until T11 decides where a loss goes — answers what it always has:
 * `nextRound(entry)`.
 */
export function nextRoundAfter(
  entry: RunRounds,
  savedRound: string,
  won: boolean,
): string | null {
  if (!won) return nextRound(entry);

  const saved = savedRound.toUpperCase();
  const index = ROUND_ORDER.indexOf(saved);
  const draw = drawOfRound(saved);
  if (index === -1 || draw === null) return null;
  if (saved === "F") return null;

  const sameDraw = ROUND_ORDER.slice(index + 1).find(
    (round) => drawOfRound(round) === draw,
  );
  if (sameDraw) return sameDraw;
  if (draw !== QUALIFYING) return null;

  const main = ROUND_ORDER.filter((round) => drawOfRound(round) === MAIN_DRAW);
  if (main.length === 0) return null;

  // The furthest main-draw round already held; the one after it is next.
  const furthest = entry.matches.reduce((best, match) => {
    const at = match.round ? main.indexOf(match.round.toUpperCase()) : -1;
    return Math.max(best, at);
  }, -1);
  if (furthest === -1) {
    return main.includes(MAIN_DRAW_START) ? MAIN_DRAW_START : main[0];
  }
  return main[furthest + 1] ?? null;
}

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

/**
 * "3–1" for a run: decided matches only, so a default or a withdrawal on the
 * entry's schedule outcome does not count as a match won or lost.
 */
export function runRecord(matches: EntryMatch[]): {
  won: number;
  lost: number;
} {
  let won = 0;
  let lost = 0;
  for (const match of matches) {
    const result = matchWon(match);
    if (result === true) won++;
    else if (result === false) lost++;
  }
  return { won, lost };
}

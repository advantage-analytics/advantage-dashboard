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
import {
  classifyStartingDraw,
  CONSOLATION,
  drawOfRound,
  MAIN_DRAW,
  PQ_CONSOLATION,
  PREQUALIFYING,
  QUALIFYING,
  ROUND_ORDER,
  roundLongLabel,
  roundRank,
} from "./format";
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
 *
 * A fresh entry opens on the first round of the draw it was entered in —
 * "Prequalifying" at PQ1, "Qualifying" at Q1, anything else at R32. Read
 * loosely ("prequal", "qualif") because `program_event_entries.draw` is free
 * text and older rows spell it their own way; prequalifying is tested first
 * since the word contains "qualif".
 */
export function nextRound(entry: RunRounds): string {
  const last = entry.matches[entry.matches.length - 1]?.round;
  if (!last) {
    const kind = classifyStartingDraw(entry.draw);
    if (kind === "prequalifying") return "PQ1";
    return kind === "qualifying" ? "Q1" : "R32";
  }
  const index = ROUND_ORDER.indexOf(last);
  return index >= 0 && index < ROUND_ORDER.length - 1
    ? ROUND_ORDER[index + 1]
    : last;
}

/** Where a fresh main-draw run starts — the same default `nextRound` uses. */
const MAIN_DRAW_START = "R32";

/** The rounds an entry already holds, upper-cased, for a `held.has()` check. */
function heldRounds(entry: RunRounds): Set<string> {
  return new Set(
    entry.matches.flatMap((match) =>
      match.round ? [match.round.toUpperCase()] : [],
    ),
  );
}

/**
 * The first round of `draw`, in `ROUND_ORDER`, the entry does not already
 * hold — or null when it holds every one. Shared by `nextRoundAfter`'s two
 * "enter a new draw for the first time" cases: a loss into consolation, and a
 * prequalifier's win into qualifying.
 */
function firstUnheldRoundOf(entry: RunRounds, draw: string): string | null {
  const held = heldRounds(entry);
  return (
    ROUND_ORDER.find(
      (round) => drawOfRound(round) === draw && !held.has(round),
    ) ?? null
  );
}

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
 *   when it holds none. Null when the ladder defines no main draw.
 *   A prequalifier's last round won carries them into QUALIFYING the same way
 *   — the first qualifying round they do not already hold (Q1) — because
 *   that is what prequalifying is for (the builder's own copy: "must come
 *   through prequalifying, then qualifying"). Null for any other draw: the
 *   last consolation round and the last PQ-consolation round lead nowhere.
 * - **An unrecognised round** has no ladder position: null.
 *
 * A LOSS drops the entry into the consolation draw that feeds from the draw it
 * lost in (the ITA structure), or ends the run:
 *
 * - **A lost `PQ*`** → PQ Consolation, from `PC1`.
 * - **A lost `Q*`, or a lost main-draw round other than `F`** → the main
 *   Consolation, from `C1`. (The ITA's "C-R32-Q" feeder rounds, where
 *   qualifying losers enter, are modelled as the same `C1`.)
 * - **A lost `F`, a lost `PC*`, a lost `C*`** → null: the run is over. So is
 *   a lost round with no ladder position.
 *
 * **Never a consolation round the entry already holds.** `recordResult`
 * de-duplicates on (entry, round), so offering a held `C1` would overwrite
 * that round's score with the next one's. When the draw's first round is
 * held, the answer is the FIRST round of that consolation draw, in
 * `ROUND_ORDER`, the entry does not hold — and null when it holds every one.
 */
export function nextRoundAfter(
  entry: RunRounds,
  savedRound: string,
  won: boolean,
): string | null {
  const saved = savedRound.toUpperCase();
  const index = ROUND_ORDER.indexOf(saved);
  const draw = drawOfRound(saved);
  if (index === -1 || draw === null) return null;
  if (saved === "F") return null;

  if (!won) {
    const consolation =
      draw === PREQUALIFYING
        ? PQ_CONSOLATION
        : draw === QUALIFYING || draw === MAIN_DRAW
          ? CONSOLATION
          : null;
    if (consolation === null) return null;
    return firstUnheldRoundOf(entry, consolation);
  }

  const sameDraw = ROUND_ORDER.slice(index + 1).find(
    (round) => drawOfRound(round) === draw,
  );
  if (sameDraw) return sameDraw;

  if (draw === PREQUALIFYING) return firstUnheldRoundOf(entry, QUALIFYING);
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
 * the draws were first entered — so a prequalifier's PQ2 → PC1 → PC2 is two
 * segments, "Prequalifying" then "PQ Consolation".
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

/**
 * The part of a tournament table row the default sort reads. Structural, so
 * the `"use client"` component's `TournamentRow` satisfies it without this
 * module importing from the component.
 */
export type DatedRoundRow = {
  round: string | null;
  match: { date?: string | null } | null;
};

/** `matches.date`'s calendar day ("2026-09-12"), or null when there is none. */
function rowDay(row: DatedRoundRow): string | null {
  const date = row.match?.date;
  return date ? date.slice(0, 10) : null;
}

/**
 * The tournament table's default order: the calendar day each match was
 * played, earliest first, then `roundRank` for rounds played the same day
 * (Q2 before R32 on one Saturday).
 *
 * **Undated rows go last.** An outcome-only round — a default, a withdrawal,
 * a forfeit — has no `matches` row and so no date of its own. It is a chosen
 * policy, not an accident, that every such row sorts after every dated row
 * and, among themselves, by `roundRank`: guessing a day for it would place a
 * decision on a date nobody recorded.
 *
 * Compares on the day (the first ten characters of the timestamptz), not the
 * instant: `recordResult` writes the event's day at noon, so two rounds from
 * one day are ordered by the ladder, never by when a coach happened to save.
 */
export function compareTournamentRows(
  a: DatedRoundRow,
  b: DatedRoundRow,
): number {
  const dayA = rowDay(a);
  const dayB = rowDay(b);
  if (dayA !== dayB) {
    if (dayA === null) return 1;
    if (dayB === null) return -1;
    return dayA < dayB ? -1 : 1;
  }
  return roundRank(a.round) - roundRank(b.round);
}

/**
 * What a line is waiting for, and who won it.
 *
 * The schedule row, the event table and the upload queue all ask these
 * questions about the same line. Three surfaces answering them three ways is
 * the failure `lib/data/match-analysis.ts` was consolidated to prevent, so this
 * is the one spelling of both.
 */

import {
  isAnalysisFailed,
  isAnalysisReady,
  isWorking,
} from "@/lib/data/match-analysis";
import type { EntryMatch, EventEntry } from "./types";

export type EntryState =
  /** Nobody has recorded anything. No match row exists yet. */
  | "empty"
  /** Played and scored, but no video was ever sent. */
  | "no-video"
  /** Something is happening right now — this is the state that pulses. */
  | "working"
  /** There is a report to read. */
  | "ready"
  | "failed";

/**
 * Sets won by each side, from the game counts.
 *
 * `player1` is always our side: the wizard writes `player1_name = playerName`
 * and `recordResult` follows it. Counting sets rather than reading a column is
 * not a shortcut — `matches.result` holds a CONTEXT string ("Final Score",
 * "Unfinished"), never an outcome, and `transformDbMatch` derives the winner
 * exactly this way for the matches list.
 */
function setsWon(match: EntryMatch): { us: number; them: number } | null {
  const ours = match.score?.player1 ?? [];
  const theirs = match.score?.player2 ?? [];
  if (ours.length === 0 || theirs.length === 0) return null;

  let us = 0;
  let them = 0;
  for (let index = 0; index < ours.length; index++) {
    const our = ours[index];
    const their = theirs[index] ?? 0;
    if (our > their) us++;
    else if (their > our) them++;
  }
  return { us, them };
}

/** Did we win this match? Null when it has no score, or the sets are level. */
export function matchWon(match: EntryMatch): boolean | null {
  const sets = setsWon(match);
  if (!sets || sets.us === sets.them) return null;
  return sets.us > sets.them;
}

/** Has this line been played at all — is there a decided match under it? */
export function entryPlayed(entry: EventEntry): boolean {
  return entry.matches.some((match) => matchWon(match) !== null);
}

/** Did our side take this line? A tournament entry is "won" if any match was. */
function entryWon(entry: EventEntry): boolean {
  return entry.matches.some((match) => matchWon(match) === true);
}

/**
 * Defers to `isWorking` / `isAnalysisReady` rather than testing status strings
 * itself, so a state that pulses here is a state that animates on the match
 * page. `uploaded` is the one that catches people out: in flight, but with
 * nothing moving, so it reads as `no-video`'s neighbour rather than `working`.
 */
export function entryState(entry: EventEntry): EntryState {
  if (entry.matches.length === 0) return "empty";
  if (entry.matches.some((match) => isAnalysisFailed(match.status))) return "failed";
  if (entry.matches.some((match) => isWorking(match.status))) return "working";
  if (entry.matches.some((match) => isAnalysisReady(match.status) && match.hasVideo)) {
    return "ready";
  }
  return "no-video";
}

/**
 * A dual's team score, computed from the lines.
 *
 * ITA rules: six singles points, and ONE doubles point to whoever takes two of
 * the three doubles. Never stored — a stored team score is a number that stops
 * agreeing with the rows above it the first time a result is corrected.
 */
export function dualScore(entries: EventEntry[]): {
  us: number;
  them: number;
  decided: boolean;
} {
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  let us = singles.filter(entryWon).length;
  let them = singles.filter((entry) => entryPlayed(entry) && !entryWon(entry)).length;

  const doublesWon = doubles.filter(entryWon).length;
  const doublesLost = doubles.filter(
    (entry) => entryPlayed(entry) && !entryWon(entry)
  ).length;
  if (doublesWon >= 2) us += 1;
  else if (doublesLost >= 2) them += 1;

  return { us, them, decided: entries.length > 0 && entries.every(entryPlayed) };
}

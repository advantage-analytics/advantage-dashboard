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
  isInFlight,
  isWorking,
} from "@/lib/data/match-analysis";
import type { EntryMatch, EventEntry } from "./types";

export type EntryState =
  /** Nobody has recorded anything. No match row exists yet. */
  | "empty"
  /** Played and scored, but no video was ever sent. */
  | "no-video"
  /**
   * Sent, and nothing is moving yet.
   *
   * Exactly the two idle-in-flight states, `uploaded` and `processed` — the
   * ones `isWorking` excludes because nothing is running. `queued` is NOT here:
   * the vendor has it, so it reads as working and pulses, which is what it does
   * on the match page too.
   *
   * Without this state both fell through to `no-video`, which told a coach
   * there was no video for a line they had just uploaded one for, and hid a job
   * whose submission had failed and needed a retry.
   */
  | "waiting"
  /** Something is happening right now — this is the state that pulses. */
  | "working"
  /** There is a report to read. */
  | "ready"
  | "failed"
  /**
   * One side forfeited — the line is decided without a match ever being played.
   *
   * `entry.forfeit` says WHICH side: `'ours'` awards the point to them,
   * `'theirs'` awards it to us. A forfeited line must never mint a match, enter
   * the analysis pipeline, or carry an invented set score.
   */
  | "forfeited";

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

/**
 * Can this line be sent for video analysis?
 *
 * No, if it is doubles. `job-request.ts` rejects a doubles match_type outright
 * with "Video analysis supports singles matches only", so offering a doubles
 * line an Upload button produces a 422 the coach only meets after picking a
 * multi-gigabyte file. A doubles line can still take a SwingVision export —
 * that path parses numbers and never goes near the vision pipeline.
 *
 * No, if it is forfeited. A forfeited line has no match to analyse.
 *
 * The frames in round 22 draw a doubles video (`doubles2.mp4 → D2`) because
 * they were designed before the vendor's singles-only limit was known. This is
 * the correction.
 */
export function supportsVideo(entry: EventEntry): boolean {
  return entry.discipline === "singles" && entry.forfeit === null;
}

/** Did we win this match? Null when it has no score, or the sets are level. */
export function matchWon(match: EntryMatch): boolean | null {
  const sets = setsWon(match);
  if (!sets || sets.us === sets.them) return null;
  return sets.us > sets.them;
}

/**
 * Did we win this line via forfeit?
 *
 * `'theirs'` = opponent forfeited = point to us = we won.
 * `'ours'` = our side forfeited = point to them = we lost.
 * Null when the line is not forfeited.
 */
export function forfeitWon(entry: EventEntry): boolean | null {
  if (entry.forfeit === "theirs") return true;
  if (entry.forfeit === "ours") return false;
  return null;
}

/**
 * Has this line been played at all — is there a decided match under it?
 *
 * A forfeited line counts as decided: the point is awarded, and the line is
 * done. This is what makes `dualScore`'s `decided` turn true once every line
 * is either played or forfeited.
 *
 * **Only ever an answer about the rows it was handed.** To this function, and
 * to everything built on it, a line RLS withheld and a line nobody has played
 * are the same line: `entry.matches` is empty either way, and there is nothing
 * in the entry to tell them apart. That is not a defect to fix here — the
 * distinction genuinely is not in the data — but it is a false `false` waiting
 * for any caller that reduces a whole card to one figure.
 *
 * `program_event_entries` and `matches` used to be readable at different
 * widths, which made that hazard real: a player read every line of a dual and
 * received one match. `20260830120000_matches_visible_to_members` closed it at
 * the policy level — every member of a program reads that program's matches —
 * so the two now come back together and there is no narrowed read left to
 * guard against. Widen `matches` no further than `program_event_entries`
 * without re-reading this comment.
 */
export function entryPlayed(entry: EventEntry): boolean {
  if (entry.forfeit !== null) return true;
  return entry.matches.some((match) => matchWon(match) !== null);
}

/**
 * Did our side take this line? A tournament entry is "won" if any match was.
 *
 * A forfeit where `entry.forfeit === 'theirs'` counts as a win for us.
 */
function entryWon(entry: EventEntry): boolean {
  if (entry.forfeit === "theirs") return true;
  if (entry.forfeit === "ours") return false;
  return entry.matches.some((match) => matchWon(match) === true);
}

/**
 * What ONE match is waiting for.
 *
 * A tournament entry is a whole run and renders one row per round, so a row
 * asking `entryState` about its entry gets an answer about a different match:
 * one failed round stamped "Analysis failed" on every other round, and one
 * ready round gave videoless rounds a "Report" link into an empty stats page
 * while suppressing their "Add video" action. A dual is unaffected — one match
 * per entry — which is why it survived review.
 *
 * Defers to `isWorking` / `isAnalysisReady` rather than testing status strings
 * itself, so a state that pulses here is a state that animates on the match
 * page. `uploaded` is the one that catches people out: in flight, but with
 * nothing moving, so it reads as `no-video`'s neighbour rather than `working`.
 */
export function matchState(match: EntryMatch): EntryState {
  if (isAnalysisFailed(match.status)) return "failed";
  if (isWorking(match.status)) return "working";
  if (isAnalysisReady(match.status) && match.hasVideo) return "ready";
  if (match.hasVideo && isInFlight(match.status)) return "waiting";
  return "no-video";
}

/**
 * What a whole line is waiting for — the loudest thing any of its matches is.
 *
 * Written over `matchState` so the rules exist once. The precedence order is
 * the same one this used to spell out inline: failed, then working, then
 * ready, then waiting, and no-video when none of them apply. It is the right
 * answer for a summary (the schedule list, the upload queue) and the wrong one
 * for a single row — use `matchState` there.
 *
 * A forfeited entry shortcuts before match analysis: a forfeit is decided, and
 * nothing about the matches underneath matters.
 */
const STATE_PRECEDENCE = ["failed", "working", "ready", "waiting"] as const;

export function entryState(entry: EventEntry): EntryState {
  if (entry.forfeit !== null) return "forfeited";
  if (entry.matches.length === 0) return "empty";
  const states = entry.matches.map(matchState);
  return STATE_PRECEDENCE.find((s) => states.includes(s)) ?? "no-video";
}

/**
 * A dual's team score, computed from the lines.
 *
 * ITA rules: six singles points, and ONE doubles point to whoever takes two of
 * the three doubles. Never stored — a stored team score is a number that stops
 * agreeing with the rows above it the first time a result is corrected.
 *
 * A forfeited line counts as a decided point for the non-forfeiting side, so a
 * dual whose nine lines include forfeits still totals 9 and reads `decided`
 * once every line is either played or forfeited.
 *
 * **Counted over the entries given, and it cannot tell that they are all of
 * them.** Every branch here goes through `entryPlayed` / `entryWon`, so a read
 * RLS narrowed would produce a confident, wrong, low score: 0–1 on a dual won
 * 4–3, with `decided` false and six played lines counted as unplayed. No such
 * read exists today — the `matches` policy is now as wide as the entries' —
 * but do not call this on behalf of a reader who may not see every line. See
 * `entryPlayed` above.
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

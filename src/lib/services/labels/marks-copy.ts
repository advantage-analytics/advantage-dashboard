/**
 * The words of a mark: its two-or-three-word label — a `count` mark's chip, a
 * `hint`'s word on the open point's quiet line — and the hover line.
 *
 * A `hidden` mark (marks.ts `LABEL_MARK_META`) is drawn nowhere; its words
 * are kept because the scorecard names every code by them
 * (labels/scorecard.ts), and so a code that is promoted again needs no copy.
 *
 * Board 08m is the source and the copy is its, word for word — the label
 * names the doubt, not the rule; the hover says what was seen, then what was
 * done or what to check, using the players' names. The board writes its
 * sample players ("Ace", "Goodman"); here the names come from `names`, keyed
 * by the side the mark's `params` carry.
 *
 * Pure, and importable from the client bundle: nothing from `next/`,
 * `components/` or a server file.
 */

import type { LabelMark, LabelMarkCode } from "./marks";
import type { LabelSide } from "./session";

/**
 * The players' names by side. Structurally the console's `SideNames`
 * (`components/admin/labels/label-format`), declared here so `lib/` never
 * imports from `components/`.
 */
export type MarkNames = Record<LabelSide, string>;

/** A mark's words. */
export const MARK_LABEL: Record<LabelMarkCode, string> = {
  winner_disputed: "Check the ending",
  winner_to_error_by_bounce: "Winner or error?",
  ending_suspect_line: "Close to the line",
  second_serve_called_out: "Double fault?",
  same_player_consecutive: "Missing shot?",
  reserve_after_in: "Serve replayed",
  service_court_repeat: "Same side twice",
  score_side_mismatch: "Wrong side for the score",
  tiebreak_score_off_six_all: "Tiebreak score, not 6–6",
  result_type_unknown: "Ending unknown",
  net_hit_contradicts_height: "Net or out?",
  serve_fault: "Serve fault?",
  shot_after_point_end: "Shot after the point ended?",
  pick_winner: "Pick the winner",
  phantom_strokes_dropped: "1 shot removed",
  out_ball_rally_continued: "Out call ignored",
  winner_guessed: "Winner guessed",
  score_frozen: "Score not read",
  geometry_discarded: "No position",
};

/** A point score ("0-15") as the board writes one ("0–15"). */
const scoreText = (score: string) => score.replace(/\s*-\s*/g, "–");

// ── The rail header's total ─────────────────────────────────────────────────

/** "41 flags to check" — the header's open-flag count, as a sentence. */
export function toCheckLabel(count: number): string {
  if (count === 0) return "Nothing left to check";
  return `${count} ${count === 1 ? "flag" : "flags"} to check`;
}

/** "On 30 points" — how many points the header's count is spread over. */
export function onPointsDetail(count: number): string | undefined {
  if (count === 0) return undefined;
  return `On ${count} ${count === 1 ? "point" : "points"}`;
}

// ── The score chip ──────────────────────────────────────────────────────────

/** The chip's name: what is wrong, in the frame's own words. */
export const SCORE_MISMATCH_LABEL = "Score doesn’t add up";

/** The chip's words: the labelled pair, then the entered one. */
export function scoreMismatchText(labelled: string, entered: string): string {
  return `${labelled} · entered ${entered}`;
}

/** The chip's hover sentence — the banner's, in one line. */
export function scoreMismatchDetail(
  setNumber: number,
  labelled: string,
  entered: string,
): string {
  return `These points make ${labelled} in set ${setNumber}. The score entered was ${entered}. Stats are estimates until one of them is fixed.`;
}

/** The three answers, each with what choosing it does. */
export const SCORE_MISMATCH_ANSWERS = {
  fix: {
    label: "Fix the entered score",
    description: "Make the entered score what these points say.",
  },
  endsEarly: {
    label: "Video ends early",
    description: "The points stop before the match did; the score stands.",
  },
  findGap: {
    label: "Find the gap",
  },
} as const;

/** "Find the gap"'s second line: where it goes. */
export function findGapDescription(
  setNumber: number,
  reachesSet: boolean,
): string {
  return reachesSet
    ? `Goes to the first point of set ${setNumber}. The entered score is a set total, so the gap can’t be placed at a game.`
    : `The points never reach set ${setNumber}: goes to the last point labelled.`;
}

/**
 * The hover line: the board's `tip` for the mark's code, with the players'
 * names where the board writes its sample ones.
 *
 * Four lines have a second form for what the board's single sample cannot
 * show — a mark whose side or score the derivation could not read, and a
 * removal of more than one shot.
 */
export function markHover(mark: LabelMark, names: MarkNames): string {
  switch (mark.code) {
    case "winner_disputed":
      return `The score says ${names[mark.params.scoreWinner]} won, but the last shot says ${names[mark.params.lastStrokeWinner]} did. The ending is wrong more often than the winner.`;
    case "winner_to_error_by_bounce":
      return `The ball before this winner landed out. The point may be an error by ${names[mark.params.loser]} instead.`;
    case "ending_suspect_line":
      return "The ball before this winner landed within 1 m of a line. Most like this turn out to be errors.";
    case "second_serve_called_out":
      return "The second serve was called out, but one or two shots followed. Check whether it was a double fault.";
    case "same_player_consecutive":
      return `${names[mark.params.hitter]} hit twice in a row. A shot in between was probably missed.`;
    case "reserve_after_in":
      return "The first serve was in, then another serve followed. Could be a let.";
    case "service_court_repeat":
      return `Served from the ${mark.params.side ?? "same"} side two points running. A point may be missing, or this one was replayed.`;
    case "score_side_mismatch": {
      const { score, expected, actual } = mark.params;
      if (score === null || expected === null || actual === null) {
        return "The serve came from the wrong side for the score. Either the score or the serve position is wrong.";
      }
      return `At ${scoreText(score)} the serve should come from the ${expected} side. This one came from the ${actual} side.`;
    }
    case "tiebreak_score_off_six_all":
      return "This point is scored like a tiebreak, but the games aren’t 6–6. The game count has drifted.";
    case "result_type_unknown":
      return "A single serve ended the point and the server lost. No second serve was found.";
    case "net_hit_contradicts_height":
      return "Marked as hitting the net, but the ball’s height says it cleared it.";
    case "serve_fault":
      return "The first serve was called out and only one or two shots followed, with no second serve. It may be a fault the returner hit anyway.";
    case "shot_after_point_end": {
      const { landed, extra, result } = mark.params;
      const where = result === "net" ? "lands in the net" : "lands out";
      return `Shot ${landed} ${where} and one more shot follows. Shot ${extra} may be a swing after the point ended.`;
    }
    case "pick_winner":
      return "The score, the last shot and the next serve don’t agree on who won. Watch the clip and choose.";
    case "phantom_strokes_dropped": {
      const count = mark.params.eventIds.length;
      if (count > 1) {
        return `${count} shots were hit after a serve that had already faulted. Those swings aren’t part of the point, so they were removed.`;
      }
      return `${names[mark.params.hitter]} swung at a serve that had already faulted. That swing isn’t part of the point, so it was removed.`;
    }
    case "out_ball_rally_continued":
      return mark.params.nextHitter === null
        ? "The vendor called this ball out, but the rally went on, so it’s stored as in."
        : `The vendor called this ball out, but ${names[mark.params.nextHitter]} played the next shot, so it’s stored as in.`;
    case "winner_guessed":
      return "The score couldn’t be read here, so the winner comes from the last shot. That guess is right about 4 times in 5.";
    case "score_frozen":
      return "The vendor’s score stopped updating. The game and server come from where the serve was hit. The score is left blank.";
    case "geometry_discarded":
      return "The vendor placed this shot outside the court enclosure, so its position was dropped.";
  }
}

/**
 * The words of a mark: the two-or-three-word chip label and the hover line.
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

/** The chip's words. A fix that removed several shots reads through `fixLabel`. */
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
  pick_winner: "Pick the winner",
  phantom_strokes_dropped: "1 shot removed",
  out_ball_rally_continued: "Out call ignored",
  winner_guessed: "Winner guessed",
  score_frozen: "Score not read",
  geometry_discarded: "No position",
};

/**
 * A mark's label, counting what a fix removed: "1 shot removed" becomes
 * "N shots removed" past one. Every other mark reads `MARK_LABEL`.
 */
export function fixLabel(mark: LabelMark): string {
  if (
    mark.code === "phantom_strokes_dropped" &&
    mark.params.eventIds.length > 1
  ) {
    return `${mark.params.eventIds.length} shots removed`;
  }
  return MARK_LABEL[mark.code];
}

/** The vendor's point score ("0-15") as the board writes one ("0–15"). */
const scoreText = (score: string) => score.replace(/\s*-\s*/g, "–");

/**
 * The hover line: the board's `tip` for the mark's code, with the players'
 * names where the board writes its sample ones.
 *
 * Four lines have a second form for what the board's single sample cannot
 * show — a mark whose side or score the derivation could not read, and a fix
 * that removed more than one shot.
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

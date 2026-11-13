/**
 * The words of a mark: its short label (a `count` mark's chip, a `hint`'s word
 * on the open point's quiet line) and the hover line. The label names the
 * doubt, not the rule; the hover says what was seen, then what was done or what
 * to check, with the players' names from `names`. A `hidden` mark's words are
 * kept because the scorecard names every code by them.
 */

import type { LabelMark, LabelMarkCode, PlacementGap } from "./marks";
import type { LabelEnding, LabelSide } from "./session";

/**
 * The players' names by side. Structurally the console's `SideNames`
 * (`components/admin/labels/label-format`), declared here so `lib/` never
 * imports from `components/`.
 */
export type MarkNames = Record<LabelSide, string>;

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
  shot_after_point_end: "Did the point end here?",
  ending_stale: "Different ending?",
  ending_contradicts_winner: "Ending and winner disagree",
  second_serve_as_first: "Second serve?",
  last_landing_missing: "No landing on the last shot",
  last_shot_unresolved: "Ending can’t be read",
  first_serve_fault_alone: "Fault, no second serve",
  serve_in_landing_out: "Serve in, landing outside the box",
  serve_after_serve_in: "Serve after a serve in play",
  serves_from_both_sides: "Serves from both sides",
  serve_by_receiver: "Serve by the receiver",
  placement_missing: "No placement",
  pick_winner: "Pick the winner",
  last_call_overruled: "Was the last ball in?",
  last_shot_untracked: "Was the last shot real?",
  last_ball_against_game: "Was the last ball out?",
  net_by_trajectory: "Into the net?",
  phantom_strokes_dropped: "1 shot removed",
  out_ball_rally_continued: "Out call ignored",
  winner_guessed: "Winner guessed",
  score_frozen: "Score not read",
  segment_proposal_differs: "Game cut differs",
  geometry_discarded: "No position",
};

/**
 * What one stroke is missing, where `MARK_LABEL`'s "No placement" is every such
 * stroke at once. "Contact point", not "contact": "No contact" reads as a
 * swing that missed the ball.
 */
const PLACEMENT_GAP_WORDS: Record<PlacementGap, string> = {
  contact: "contact point",
  landing: "landing",
  both: "contact point or landing",
};

/** A mark's name: `MARK_LABEL`, except where the mark's own params refine it. */
export function markLabel(mark: LabelMark): string {
  return mark.code === "placement_missing"
    ? `No ${PLACEMENT_GAP_WORDS[mark.params.missing]}`
    : MARK_LABEL[mark.code];
}

/** A point score ("0-15") with an en dash ("0–15"). */
const scoreText = (score: string) => score.replace(/\s*-\s*/g, "–");

/** An ending as a noun phrase mid-sentence: "an ace", "a double fault". */
const ENDING_PHRASE: Record<LabelEnding, string> = {
  ace: "an ace",
  service_winner: "a service winner",
  double_fault: "a double fault",
  winner: "a winner",
  error: "an error",
  let_replayed: "a let, replayed",
  not_a_point: "not a point",
};

/** "an error by Goodman", or the ending alone when nobody is named. */
function endingPhrase(
  ending: LabelEnding,
  endedBy: LabelSide | null,
  names: MarkNames,
): string {
  const by = endedBy ? ` by ${names[endedBy]}` : "";
  return `${ENDING_PHRASE[ending]}${by}`;
}

/**
 * An ending as a noun phrase with its owner: "an error by Quan", "a service
 * winner by Kim" (the server's, though the receiver's miss ends it).
 */
export function ownedEndingPhrase(
  ending: LabelEnding,
  endedBy: LabelSide | null,
  winner: LabelSide | null,
  names: MarkNames,
): string {
  return endingPhrase(ending, endingOwner(ending, endedBy, winner), names);
}

/**
 * A stored ending against the winner it cannot be true of, the one sentence
 * the review hint and the Mark complete confirm share: "a winner by Quan, but
 * Kim won it", "an ace, but Kim won it and Quan served", "a double fault, but
 * Quan served and won it". A server's ending names no owner: a service winner
 * reads as the winner's (`endingOwner`), which here is the thing in doubt.
 */
export function endingContradictionPhrase(
  ending: LabelEnding,
  endedBy: LabelSide | null,
  winner: LabelSide,
  server: LabelSide | null,
  names: MarkNames,
): string {
  const won = names[winner];
  if (ending === "double_fault") {
    return `${ENDING_PHRASE[ending]}, but ${won} served and won it`;
  }
  if (ending === "ace" || ending === "service_winner") {
    const served = server ? ` and ${names[server]} served` : "";
    return `${ENDING_PHRASE[ending]}, but ${won} won it${served}`;
  }
  return `${endingPhrase(ending, endedBy, names)}, but ${won} won it`;
}

/** An ending as the start of a question: "Ace", "Double fault". */
const ENDING_NOUN: Record<LabelEnding, string> = {
  ace: "Ace",
  service_winner: "Service winner",
  double_fault: "Double fault",
  winner: "Winner",
  error: "Error",
  let_replayed: "Let, replayed",
  not_a_point: "Not a point",
};

/** Whose ending it reads as: a service winner is the server's, though the receiver's miss ends it. */
function endingOwner(
  ending: LabelEnding,
  endedBy: LabelSide | null,
  winner: LabelSide | null,
): LabelSide | null {
  return ending === "service_winner" ? (winner ?? endedBy) : endedBy;
}

/**
 * "Different ending?" as the question it is: the ending the strokes add up to,
 * asked — "Ace by Stephenson?". A question, as the other hints are: the
 * strokes can be the thing that is wrong.
 */
export function staleEndingQuestion(
  ending: LabelEnding,
  endedBy: LabelSide | null,
  names: MarkNames,
  winner: LabelSide | null = null,
): string {
  const who = endingOwner(ending, endedBy, winner);
  const by = who ? ` by ${names[who]}` : "";
  return `${ENDING_NOUN[ending]}${by}?`;
}

/** Its answer, naming the change: "Make it an ace". */
export function staleEndingAction(ending: LabelEnding): string {
  return `Make it ${ENDING_PHRASE[ending]}`;
}

/**
 * The hint's words on the quiet line: its label, and for "Did the point end
 * here?" how many strokes followed the ball called out. A question: the call
 * can be wrong by a few centimetres.
 */
export function hintLabel(mark: LabelMark, names?: MarkNames): string {
  if (mark.code === "ending_stale" && names) {
    return staleEndingQuestion(
      mark.params.ending,
      mark.params.endedBy,
      names,
      mark.params.winner,
    );
  }
  // Asked as the vendor called it, so its answer is a plain yes: "Was the
  // last ball out?" → "Yes, make it out".
  if (mark.code === "last_call_overruled") {
    return lastCallQuestion(mark.params.vendorCall);
  }
  if (mark.code === "last_ball_against_game") {
    return lastCallQuestion(mark.params.call);
  }
  const label = markLabel(mark);
  if (mark.code !== "shot_after_point_end") return label;
  const n = mark.params.after.length;
  return `${label} ${n} ${n === 1 ? "shot follows" : "shots follow"}`;
}

/**
 * The seven questions a point's review flag asks, by item id (marks-state.ts
 * `REVIEW_ITEMS`), in the order they are answered: strokes, then the last
 * ball, its ending, the winner, the game, and last the strokes still without
 * coordinates. Item 4 is put as the vendor called it (`lastCallQuestion`)
 * where "Was the last ball in?" is among its members.
 */
export const REVIEW_ITEM_QUESTION = {
  1: "Missing shot?",
  2: "Extra shots?",
  3: "Serves",
  4: "How did the last ball end?",
  5: "Who won?",
  6: "Game & serve order",
  7: "Shot placement",
} as const;

/**
 * Item 7 by what its stroke is missing. A stroke with its landing placed has
 * its placement; only where it was hit is unknown, so the flag says that.
 */
export function placementQuestion(missing: PlacementGap): string {
  return missing === "contact" ? "Contact point" : REVIEW_ITEM_QUESTION[7];
}

/** The action a live hint offers, by code; the rest offer none. */
/** "Into the net?"'s yes. */
export const MAKE_IT_NET_ACTION = "Yes, make it net";

export const HINT_ACTION_LABEL = {
  second_serve_as_first: "Make it a second serve",
  shot_after_point_end: "Split here",
  serve_after_serve_in: "Split here",
  serves_from_both_sides: "Split here",
} as const;

/** "Was the last ball in?"'s answer: the vendor's own call on that ball. */
export function lastCallAction(call: "in" | "out" | "net"): string {
  return call === "net" ? "Yes, make it a net" : `Yes, make it ${call}`;
}

/** The same question, put as the vendor's call: "Was the last ball out?" */
export function lastCallQuestion(call: "in" | "out" | "net"): string {
  return `Was the last ball ${call === "net" ? "in the net" : call}?`;
}

/**
 * "Was the last ball in?"'s evidence while the last ball has no landing
 * placed: the vendor's call alone. Its usual line reads the call against the
 * landing ("in by its landing"), which the "Place the last bounce" line beside
 * it would contradict.
 */
export function lastCallUnplacedHover(call: "in" | "out" | "net"): string {
  return `The vendor called the last ball ${call === "net" ? "in the net" : call}, and its landing isn’t placed.`;
}

/**
 * "Did the point end here?"'s yes: the ball stays (or is made) out and the N
 * strokes after it go.
 */
export function removeAfterLabel(count: number): string {
  return `Yes, remove ${count}`;
}

// ── The rail header's total ─────────────────────────────────────────────────

/** "41 points to review" — the header's count of flagged points, as a sentence. */
export function toCheckLabel(count: number): string {
  if (count === 0) return "Nothing left to check";
  return `${count} ${count === 1 ? "point" : "points"} to review`;
}

/** "12 data points" — the header's grey count, beside the amber one. */
export function dataFlagsLabel(count: number): string {
  return `${count} data ${count === 1 ? "point" : "points"}: wrong data that rarely moves the score`;
}

/** The grey list's note on a match whose vendor tracking lost many serves. */
export const THIN_TRACKING_LABEL = "Thin tracking";

/** Its hover: how many, and what it does to the numbers. */
export function thinTrackingDetail(missing: number, serves: number): string {
  return `${missing} of ${serves} serves in play came from the video with no landing. Serve placement counts only the ones with a landing.`;
}

// ── The score chip ──────────────────────────────────────────────────────────

/** The chip's name: what is wrong. */
export const SCORE_MISMATCH_LABEL = "Score doesn’t add up";

/** The chip's hover sentence. */
export function scoreMismatchDetail(
  setNumber: number,
  labelled: string,
  entered: string,
): string {
  return `These points make ${labelled} in set ${setNumber}. The score entered was ${entered}. Stats are estimates until one of them is fixed.`;
}

/**
 * The two answers, each with what choosing it does. Neither rewrites the
 * entered score: "Fix the entered score" (store what the points say) was
 * removed on 2026-10-10 after it overwrote a correct 6–4 6–4 with a mislabelled
 * 5–5 6–4 and hid the chip that could have undone it.
 */
export const SCORE_MISMATCH_ANSWERS = {
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
 * The hover line for the mark's code, with the players' names. Five lines have
 * a second form: a mark whose side, score or proposal the derivation could not
 * read (or a proposed merge), and a removal of more than one shot.
 */
export function markHover(mark: LabelMark, names: MarkNames): string {
  switch (mark.code) {
    case "winner_disputed":
      return `The score says ${names[mark.params.scoreWinner]} won, but the vendor’s last shot says ${names[mark.params.lastStrokeWinner]} did. The ending is wrong more often than the winner.`;
    case "winner_to_error_by_bounce":
      return `The vendor’s tracking had the ball before this winner landing out. The point may be an error by ${names[mark.params.loser]} instead.`;
    case "ending_suspect_line":
      return "The vendor’s tracking put the ball before this winner within 1 m of a line. Most like this turn out to be errors.";
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
    case "shot_after_point_end":
      // Several strokes follow only a miss the labeller called (marks-state.ts
      // `pointEndedEarly`): the call is theirs, so nothing is left to mark.
      if (mark.params.after.length > 1) {
        return `This shot is marked as a miss, yet ${mark.params.after.length} more strokes follow it. If the point ended here, answer yes to remove them, or split them into their own point. If the call is wrong, change the result or dismiss this.`;
      }
      return "This shot reads as out, yet one more stroke follows it. If the point ended here, answer yes to mark it out and remove that stroke, or split it into its own point. If the call is wrong, fix the landing or dismiss this.";
    case "last_call_overruled": {
      if (mark.params.vendorCall === "in") {
        return "The last ball is out by its landing, but the vendor called it in. Watch the bounce: if it was in, change the result.";
      }
      const call = mark.params.vendorCall === "net" ? "in the net" : "out";
      return `The last ball is in by its landing, but the vendor called it ${call}. Watch the bounce: if it was ${call}, change the result.`;
    }
    case "last_ball_against_game": {
      const { call, gameWinner } = mark.params;
      return `This game doesn’t add up where you set its start: ${names[gameWinner]} should win this point. If the last ball was ${call}, the point goes to ${names[gameWinner]}.`;
    }
    case "last_shot_untracked":
      return "No ball was tracked off the last shot. Most often it isn’t a shot at all, just a swing at a dead ball: delete it, and the point ends on the shot before.";
    case "net_by_trajectory":
      if (mark.params.by === "landing") {
        return "The last ball is called in but came down within a metre of the net. About four times in five that is a ball into the net: watch it, and make it net if it stayed on this side.";
      }
      return "The ball crossed the net barely above the tape, but nothing calls it a net ball. Watch the net: if the ball hit it and stayed on this side, change the result to net.";
    case "pick_winner":
      return "The score, the last shot and the next serve don’t agree on who won. Watch the clip and choose.";
    case "ending_stale": {
      const { ending, endedBy, winner } = mark.params;
      const who = endingOwner(ending, endedBy, winner);
      return `The shots add up to ${endingPhrase(ending, who, names)}, not the ending this point has. Check the clip: change it, or leave it if the shots are what's wrong.`;
    }
    case "ending_contradicts_winner": {
      const { ending, endedBy, winner, server } = mark.params;
      return `This point reads ${endingContradictionPhrase(ending, endedBy, winner, server, names)}. Check the clip and change whichever is wrong, or dismiss this if it stands.`;
    }
    case "second_serve_as_first":
      return "Follows a faulted serve, so it is the second serve.";
    case "last_landing_missing":
      return "Place the last bounce to settle Out, Net or In.";
    case "last_shot_unresolved":
      return "The last shot has no landing and no result, so the point’s ending is unknown.";
    case "first_serve_fault_alone":
      return "The point stops on a first serve that missed. Most often the serve was in: place its landing in the box. If it did miss, add the second serve.";
    case "serve_in_landing_out":
      return mark.params.landing === "net"
        ? "The serve counts as in, but its landing is on the server’s side of the net. It publishes as in with no placement: place the bounce in the box to count where it went."
        : "The serve counts as in, but its landing is outside the service box. It publishes as in with no placement: place the bounce in the box to count where it went.";
    case "serve_after_serve_in":
      return "A let that was played, or two points in one rally.";
    case "serves_from_both_sides":
      return "The same player serves from the deuce side and from the ad side in this point. A server only changes sides for a new point, so this is most often two points in one: split at the second of them.";
    case "serve_by_receiver": {
      const { hitter, server } = mark.params;
      return `${names[hitter]} is typed as hitting a serve, but ${names[server]} is serving this point. If it is a rally shot, retype it: mid-rally it is most often an overhead. If the serve is ${names[server]}’s, change who hit it. If ${names[hitter]} did serve, change the server.`;
    }
    case "placement_missing": {
      const { stroke, missing } = mark.params;
      const gap = PLACEMENT_GAP_WORDS[missing];
      const fix = {
        contact: "Place it, or dismiss this if the video doesn’t show it.",
        landing:
          "Place the bounce, or dismiss this if the video doesn’t show it.",
        both: "Place them, or dismiss this if the video doesn’t show them.",
      }[missing];
      switch (stroke) {
        case "serve":
          return `This serve has no ${gap}, so serve placement can’t count it. ${fix}`;
        case "return":
          // A landing near the centre reads "Middle" with no contact
          // (`directionZone`), so a missing contact only costs the direction.
          return missing === "contact"
            ? `This return has no ${gap}, so return placement can’t tell crosscourt from down the line. ${fix}`
            : `This return has no ${gap}, so return placement can’t count it. ${fix}`;
        case "shot":
          return `This shot has no ${gap}, so how the point opened or ended can’t be read in full. ${fix}`;
      }
    }
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
      return "The score couldn’t be read here, so the winner comes from the last shot. That guess has been wrong about half the time, so check who won.";
    case "score_frozen":
      return "The vendor’s score stopped updating. The game and server come from where the serve was hit. The score is left blank.";
    case "segment_proposal_differs": {
      const { proposedGame, proposedServer, mergedWith, systemic } =
        mark.params;
      // On most of the match the entered score is the likelier mistake.
      const tail = systemic
        ? " It differs on most of the match, so check the entered score first."
        : "";
      if (mergedWith !== null) {
        return `Re-cutting the games from the score would join this rally to the one beside it. Nothing was changed.${tail}`;
      }
      if (proposedGame === null || proposedServer === null) {
        return `Re-cutting the games from the score puts this point somewhere else. Nothing was changed.${tail}`;
      }
      return `Re-cutting the games from the score puts this point in game ${proposedGame}, served by ${names[proposedServer]}. Nothing was changed.${tail}`;
    }
    case "geometry_discarded":
      return "The vendor placed this shot outside the court enclosure, so its position was dropped.";
  }
}

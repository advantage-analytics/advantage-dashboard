/**
 * The open point's current review item, and what a flag jump arms on the
 * court for it. The current item is the first item of the point's flag
 * (`reviewFlag`, marks-state.ts) still open — a demoted flag's too: the open
 * point still asks it. The court panel asks that one item; once it is
 * answered the next open item is current, by derivation on render.
 *
 * A flag jump selects the stroke the item is about and opens the court on the
 * end it wants placed (`reviewItemTarget`), so the labeller clicks the court
 * once and moves on. Pure, so a spec reads every rule without a console.
 */

import {
  contactMissingOn,
  lastCallAnswer,
  pointRowMarkList,
} from "./marks-state";
import type { LabelMarkCode, LabelMarks } from "./marks";
import type { ReviewFlag, ReviewItem, ReviewMember } from "./marks-state";
import { liveShotsInOrder, type LabelPoint, type LabelShot } from "./session";
import { suggestionState } from "./suggestions";

/** The court's two ends (court-placement.ts `PlacementTarget`). */
export type ReviewPlace = "contact" | "landing";

/** What a jump arms: the stroke to select and the end to open, if any. */
export interface ReviewTarget {
  shotId: string | null;
  place: ReviewPlace | null;
}

const NO_TARGET: ReviewTarget = { shotId: null, place: null };

/** The flag's first open item, in id order; null with none open. */
export function currentReviewItem(
  flag: ReviewFlag | null | undefined,
): ReviewItem | null {
  return flag?.items.find((item) => item.state === "open") ?? null;
}

/** The point's first open "Missing shot?" suggestion, or null. */
export function openMissingShot(point: LabelPoint, marks: LabelMarks) {
  for (const s of marks.suggestions) {
    if (
      s.kind === "missing_shot" &&
      s.pointId === point.id &&
      suggestionState(s, point) === "open"
    ) {
      return s;
    }
  }
  return null;
}

/**
 * The stroke an open member's inline suggestion row sits under in the well,
 * if it has one: "Missing shot?" at its first open slot, "Did the point end
 * here?" at the ball called out, "Second serve?", "Serve after a serve in play"
 * and "Serve in, landing outside the box" at their own serve, and placement at
 * its stroke. Null for every other member.
 */
export function memberShotId(
  member: ReviewMember,
  point: LabelPoint,
  marks: LabelMarks,
): string | null {
  const { mark } = member;
  switch (mark.code) {
    case "same_player_consecutive":
      return openMissingShot(point, marks)?.afterShotId ?? null;
    case "shot_after_point_end":
    case "second_serve_as_first":
    case "serve_after_serve_in":
    case "serve_in_landing_out":
    case "placement_missing":
      return mark.params.shotId;
    default:
      return null;
  }
}

/**
 * Item 4's members that say only that the ending reads wrong, with no ball to
 * place first: taken after every other open member of the item.
 */
const ENDING_ONLY: ReadonlySet<LabelMarkCode> = new Set([
  "ending_stale",
  "result_type_unknown",
]);

/**
 * Where a jump to `item` lands: the stroke it is about and the end of the
 * court to open on it.
 *
 * - 1 "Same side twice": the stroke before the first open missing-shot slot,
 *   no end — its Add shot row is under it.
 * - 2: "Did the point end here?" and "Serve after a serve in play" at their
 *   stroke, a serve replayed after one in at the first stroke; no end.
 * - 3: "Serve in, landing outside the box" at its serve, on the landing;
 *   "Second serve?" at its serve, no end; "Fault, no second serve" at the last
 *   stroke and a second serve called out at the last second serve, on the
 *   landing.
 * - 4: the last ball's call at the stroke `lastCallAnswer` names (else the
 *   last), the bounce, the net call and the disputed winner at the last
 *   stroke, a line call and a winner read as an error at the ball before the
 *   winner — all on the landing; a stale or unreadable ending alone at the
 *   last stroke, no end.
 * - 5 at the last stroke, 6 at the first; no end.
 * - 7 at the stroke to place, on the landing.
 *
 * The first open member, in the item's order, that names a live stroke wins.
 * A stroke with no contact yet opens on the contact whatever the end: a
 * missing contact is filled first, and the court's click cycle then moves on
 * to the landing. No stroke: no target, and the jump selects nothing.
 */
export function reviewItemTarget(
  item: ReviewItem | null,
  point: LabelPoint,
  marks: LabelMarks,
  ghosts: boolean,
): ReviewTarget {
  if (!item) return NO_TARGET;
  const live = liveShotsInOrder(point, ghosts);
  const open = item.members.filter((member) => member.state === "open");
  const ordered = [
    ...open.filter((member) => !ENDING_ONLY.has(member.mark.code)),
    ...open.filter((member) => ENDING_ONLY.has(member.mark.code)),
  ];
  for (const member of ordered) {
    const [shot, place] = memberTarget(member, point, marks, ghosts, live);
    const stroke =
      shot === null ? null : (live.find((s) => s.id === shot) ?? null);
    if (!stroke) continue;
    return {
      shotId: stroke.id,
      place: place !== null && contactMissingOn(stroke) ? "contact" : place,
    };
  }
  return NO_TARGET;
}

function memberTarget(
  member: ReviewMember,
  point: LabelPoint,
  marks: LabelMarks,
  ghosts: boolean,
  live: readonly LabelShot[],
): [string | null, ReviewPlace | null] {
  const { mark } = member;
  const first = live[0]?.id ?? null;
  const last = live.at(-1)?.id ?? null;
  switch (mark.code) {
    case "same_player_consecutive":
    case "shot_after_point_end":
    case "serve_after_serve_in":
    case "second_serve_as_first":
      return [memberShotId(member, point, marks), null];
    case "reserve_after_in":
      return [first, null];
    case "serve_in_landing_out":
    case "placement_missing":
      return [mark.params.shotId, "landing"];
    case "first_serve_fault_alone":
      return [last, "landing"];
    case "second_serve_called_out":
      return [
        live.findLast((shot) => shot.stroke === "second_serve")?.id ?? null,
        "landing",
      ];
    case "last_call_overruled": {
      const { count } = pointRowMarkList(point, marks);
      return [lastCallAnswer(point, count, ghosts)?.shotId ?? last, "landing"];
    }
    case "last_landing_missing":
    case "last_shot_unresolved":
    case "net_hit_contradicts_height":
    case "winner_disputed":
      return [last, "landing"];
    case "ending_suspect_line":
    case "winner_to_error_by_bounce":
      return [live.at(-2)?.id ?? null, "landing"];
    // An ending that reads wrong is still the last ball's to settle: the
    // court opens on its landing, as for the other end-of-point questions.
    case "ending_stale":
    case "result_type_unknown":
      return [last, "landing"];
    case "pick_winner":
    case "winner_guessed":
      return [last, null];
    case "score_side_mismatch":
    case "service_court_repeat":
    case "tiebreak_score_off_six_all":
    case "segment_proposal_differs":
      return [first, null];
    default:
      return [null, null];
  }
}

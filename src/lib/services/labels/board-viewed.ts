import type { LabellerBoard } from "@/lib/data/label-queue-server";
import { isOverdue } from "@/lib/services/labels/queue";

/**
 * The `label_board_viewed` properties: what the `/label` board offered the
 * viewer, as counts and flags only — never a job id, a session id, a name or
 * a due time. Read from the same board the page draws, so "nothing to claim"
 * can be told apart from "jobs were there and nobody took one".
 */
export interface LabelBoardViewedProperties {
  /** Rows in the To do lane. */
  available_count: number;
  /** To do rows the viewer could press Claim on right now. */
  claimable_count: number;
  /** To do rows past their due time. */
  overdue_count: number;
  in_progress_count: number;
  /** In progress rows assigned to the viewer. */
  in_progress_mine_count: number;
  published_count: number;
  submitted_count: number;
  /** The viewer holds an open session (or a sent-back one), so cannot claim. */
  holding: boolean;
  /** One of the viewer's in-progress matches was sent back to them. */
  sent_back: boolean;
  /** The viewer is a labeller (an admin who is not one is refused a claim). */
  can_claim: boolean;
}

/**
 * Mirrors `LabelBoard`'s own reading: a sent-back match is held like any
 * other, and nothing is claimable while the viewer holds one or is not a
 * labeller.
 */
export function labelBoardViewedProperties(
  board: LabellerBoard,
  canClaim: boolean,
  now: number,
): LabelBoardViewedProperties {
  const mine = board.inProgress.filter((row) => row.mine);
  const sentBack = mine.some((row) => row.sentBack);
  const holding = board.holding || sentBack;
  return {
    available_count: board.todo.length,
    claimable_count:
      canClaim && !holding
        ? board.todo.filter((row) => row.claimable).length
        : 0,
    overdue_count: board.todo.filter((row) => isOverdue(row.dueAt, now)).length,
    in_progress_count: board.inProgress.length,
    in_progress_mine_count: mine.length,
    published_count: board.published.length,
    submitted_count: board.submitted.length,
    holding,
    sent_back: sentBack,
    can_claim: canClaim,
  };
}

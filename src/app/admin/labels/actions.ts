"use server";

import {
  seedLabelSession,
  type SeedLabelSessionResult,
} from "@/lib/services/labels/seed-session";
import {
  editLabelPoint,
  editLabelShot,
  type LabelPointEditResult,
  type LabelShotEditResult,
} from "@/lib/services/labels/edit-session";
import {
  addLabelShot,
  deleteLabelPoint,
  deleteLabelShot,
  markLabelPointChecked,
  moveLabelPoint,
  moveLabelPoints,
  removeLabelShotsAfter,
  restoreLabelPoint,
  restoreLabelShot,
  restoreLabelShots,
  unmarkLabelPointChecked,
  type LabelAddShotResult,
  type LabelCheckedResult,
  type LabelMovePointResult,
  type LabelMovePointsResult,
  type LabelPointStatusResult,
  type LabelShotStatusResult,
  type LabelShotsRemoveResult,
  type LabelShotsRestoreResult,
} from "@/lib/services/labels/operations-session";
import {
  resetLabelPoint,
  resetLabelShot,
  type LabelPointResetResult,
} from "@/lib/services/labels/reset-session";
import {
  setLabelGameServer,
  setLabelGameType,
  type LabelGameWriteResult,
} from "@/lib/services/labels/game-operations-session";
import {
  restoreLabelSiteRemoval,
  type LabelSiteRemovalRestoreResult,
} from "@/lib/services/labels/site-removal-session";
import {
  dismissLabelSuggestion,
  type LabelDismissSuggestionResult,
} from "@/lib/services/labels/suggestions-session";
import type { InsertPosition } from "@/lib/services/labels/point-insert";
import {
  insertLabelPoint,
  type LabelInsertPointResult,
} from "@/lib/services/labels/point-insert-session";
import {
  foldLabelTiebreak,
  pullLabelGamePoints,
  shiftLabelGameOverflow,
  splitLabelGame,
  type LabelGameShiftResult,
} from "@/lib/services/labels/game-shift-session";
import {
  splitLabelPoint,
  type LabelSplitPointResult,
} from "@/lib/services/labels/point-split-session";
import type { CombineDirection } from "@/lib/services/labels/point-combine";
import {
  combineLabelPoints,
  type LabelCombinePointsResult,
} from "@/lib/services/labels/point-combine-session";
import {
  switchLabelPointPlayers,
  type LabelPlayerSwitchResult,
} from "@/lib/services/labels/player-swap-session";
import type { LabelSessionFieldsPatch } from "@/lib/services/labels/session-fields";
import {
  updateLabelSessionFields,
  type LabelSessionFieldsResult,
} from "@/lib/services/labels/session-fields-session";
import {
  completeLabelSession,
  reopenLabelSession,
  type LabelSessionStatusResult,
} from "@/lib/services/labels/session-status-session";
import {
  undoLabelOp,
  type LabelUndoResult,
} from "@/lib/services/labels/undo-session";
import {
  addMissingShots,
  type LabelAddMissingShotsResult,
  type MissingShotAdd,
} from "@/lib/services/labels/add-missing-shots";
import {
  recordLabelOpenCounts,
  type LabelOpenCounts,
  type LabelOpenCountsResult,
} from "@/lib/services/labels/open-counts-session";
import { withLabelOp } from "@/lib/supabase/op-context";
import type { LabelGame } from "@/lib/services/labels/operations";
import type { LabelGameType, LabelSide } from "@/lib/services/labels/session";

/**
 * Start a hand-labelling session for an Advantage Intelligence job, or reopen
 * the one already in progress. The service re-checks the admin session and
 * names the labeller; the caller supplies only the job id.
 */
export async function seedLabelSessionAction(
  jobId: string,
): Promise<{ sessionId: string } | { error: string }> {
  const result: SeedLabelSessionResult = await seedLabelSession(jobId);
  if ("error" in result) return { error: result.error };
  return { sessionId: result.sessionId };
}

/**
 * Autosave one edit to a label shot — `hitter`, `stroke`, `result`, a
 * `contact_*` or `landing_*` pair, `video_time` or `unclear`, and nothing
 * else. Returns the status the shot now has, or why nothing was written.
 */
export async function updateLabelShot(
  shotId: string,
  patch: Record<string, unknown>,
): Promise<LabelShotEditResult> {
  return withLabelOp("Edit shot", () => editLabelShot(shotId, patch));
}

/**
 * Autosave one edit to a label point — `winner`, `ending`, `ended_by`,
 * `serve_side` or `note`, and nothing else.
 */
export async function updateLabelPoint(
  pointId: string,
  patch: Record<string, unknown>,
): Promise<LabelPointEditResult> {
  return withLabelOp("Edit point", () => editLabelPoint(pointId, patch));
}

/**
 * Delete a label shot: a tombstone with `reason` (one of the migration's
 * `delete_reason` values), never a removed row. Undo is `restoreLabelShotAction`.
 */
export async function deleteLabelShotAction(
  shotId: string,
  reason: string,
): Promise<LabelShotStatusResult> {
  return withLabelOp("Delete shot", () => deleteLabelShot(shotId, reason));
}

/** Undo a shot's delete: the status it had before comes back. */
export async function restoreLabelShotAction(
  shotId: string,
): Promise<LabelShotStatusResult> {
  return withLabelOp("Restore shot", () => restoreLabelShot(shotId));
}

/**
 * Remove every live shot after `shotId` in its point as hit after the point
 * ended (`dead_ball_after_point`): one tombstone each, never a removed row,
 * and the point's ending settled in the same call. Undo is
 * `restoreLabelShotsAction` with the ids it answers.
 */
export async function removeLabelShotsAfterAction(
  shotId: string,
): Promise<LabelShotsRemoveResult> {
  return withLabelOp("Remove shots", () => removeLabelShotsAfter(shotId));
}

/** Undo a batched removal: each tombstone's status before it comes back. */
export async function restoreLabelShotsAction(
  shotIds: string[],
): Promise<LabelShotsRestoreResult> {
  return withLabelOp("Restore shots", () => restoreLabelShots(shotIds));
}

/**
 * Add a stroke the vendor missed, after `afterShotId` (null: at the end of
 * the rally). Returns the new row.
 */
export async function addLabelShotAction(
  pointId: string,
  afterShotId: string | null,
): Promise<LabelAddShotResult> {
  return withLabelOp("Add shot", () => addLabelShot(pointId, afterShotId));
}

/** Delete a label point: a tombstone, never a removed row. */
export async function deleteLabelPointAction(
  pointId: string,
): Promise<LabelPointStatusResult> {
  return withLabelOp("Delete point", () => deleteLabelPoint(pointId));
}

/** Undo a point's delete. */
export async function restoreLabelPointAction(
  pointId: string,
): Promise<LabelPointStatusResult> {
  return withLabelOp("Restore point", () => restoreLabelPoint(pointId));
}

/**
 * Move a point into another game. Refused when someone else serves that game
 * unless `switchServer` — the console's confirmed "switch players?".
 */
export async function moveLabelPointAction(
  pointId: string,
  to: LabelGame,
  switchServer: boolean,
): Promise<LabelMovePointResult> {
  return withLabelOp("Move point", () =>
    moveLabelPoint(pointId, to, switchServer),
  );
}

/**
 * The points a dragged game header passed, into the game beside it, in one
 * write (`moveLabelPoints`); one undo step.
 */
export async function moveLabelPointsAction(
  pointIds: string[],
  to: LabelGame,
  switchServer: boolean,
): Promise<LabelMovePointsResult> {
  return withLabelOp("Move game boundary", () =>
    moveLabelPoints(pointIds, to, switchServer),
  );
}

/**
 * Set who serves game `game` of the session: every live point of the game
 * gets `server` — in a tiebreak, `server` serves point 1 and the rest follow
 * the 1-2-2 rotation. Returns each point as it now stands.
 */
export async function setLabelGameServerAction(
  sessionId: string,
  game: LabelGame,
  server: LabelSide,
): Promise<LabelGameWriteResult> {
  return withLabelOp("Set server", () =>
    setLabelGameServer(sessionId, game, server),
  );
}

/**
 * Make game `game` of the session a `type` (game, tiebreak or match
 * tiebreak), re-rotating its servers from the game's current first server.
 * Returns each point as it now stands.
 */
export async function setLabelGameTypeAction(
  sessionId: string,
  game: LabelGame,
  type: LabelGameType,
): Promise<LabelGameWriteResult> {
  return withLabelOp("Set game type", () =>
    setLabelGameType(sessionId, game, type),
  );
}

/** Mark a point checked (`checked_at` = now) or, with `checked` false, clear it. */
export async function setLabelPointCheckedAction(
  pointId: string,
  checked: boolean,
): Promise<LabelCheckedResult> {
  return checked
    ? withLabelOp("Check point", () => markLabelPointChecked(pointId))
    : withLabelOp("Uncheck point", () => unmarkLabelPointChecked(pointId));
}

/**
 * Reset an edited shot to the values it was seeded with (status back to
 * `kept`). Refused for an added or deleted shot, or one with no stored seed.
 * Its unclear marks stay as they are.
 */
export async function resetLabelShotAction(
  shotId: string,
): Promise<LabelShotStatusResult> {
  return withLabelOp("Reset shot", () => resetLabelShot(shotId));
}

/**
 * Reset an edited point's own fields — set, game, server, serve side, won by,
 * ending, ended by — to the values it was seeded with (status back to
 * `unchanged`). Its shots, note and checked mark stay as they are.
 */
export async function resetLabelPointAction(
  pointId: string,
): Promise<LabelPointResetResult> {
  return withLabelOp("Reset point", () => resetLabelPoint(pointId));
}

/**
 * Put a stroke the SITE removed (`site_removal`, board 08m's ghost) back into
 * the rally: `site_removal_restored_at` = now, and nothing else. Refused on a
 * complete session, on one labelled without marks, and on anything that is
 * not an unrestored ghost.
 */
export async function restoreLabelSiteRemovalAction(
  shotId: string,
): Promise<LabelSiteRemovalRestoreResult> {
  return withLabelOp("Restore removed shot", () =>
    restoreLabelSiteRemoval(shotId),
  );
}

/**
 * Dismiss a suggestion the marks made on a point — a stroke probably missing
 * (`missing_shot:<vendor stroke id>`) or a point (`missing_point`): the key
 * is appended to `label_points.dismissed`, and nothing else is written.
 * Refused on a complete session, on one labelled without marks, on a key of
 * any other shape and on one already dismissed.
 */
export async function dismissLabelSuggestionAction(
  pointId: string,
  key: string,
): Promise<LabelDismissSuggestionResult> {
  return withLabelOp("Dismiss suggestion", () =>
    dismissLabelSuggestion(pointId, key),
  );
}

/**
 * Add a point the vendor never saw beside `anchorPointId`: BEFORE it (the
 * default — the suggestion's slot on the second of two points served from
 * one side, and the menu's "Add point above") or AFTER it ("Add point
 * below"). The later points move up one `point_index` and the new row takes
 * the slot in the anchor's set, game and service, with no winner, no ending
 * and no shots. Writes `label_points` only. Refused on a session that is not
 * labelling and beside a deleted point; a session labelled without marks is
 * fine — this is a manual edit, not an answer to a mark.
 */
export async function insertLabelPointAction(
  sessionId: string,
  anchorPointId: string,
  position: InsertPosition = "before",
): Promise<LabelInsertPointResult> {
  return withLabelOp("Add point", () =>
    insertLabelPoint(sessionId, anchorPointId, position),
  );
}

/**
 * Move the points left over past a game's end into the next game: from the
 * game that holds `fromPointId` (one of its leftovers — the rows after the
 * one that decided it, which read "Game–30"), its leftovers take the next
 * game's set, game, server and type, and if that game then runs over, its
 * leftovers move on, down the match. With no game after, they open a new
 * one. `label_points` only, one update per moved point; no index moves.
 * Refused on a session that is not labelling and on a point inside its
 * game; a session labelled without marks is fine — the leftovers are read
 * off the labeller's own rows.
 */
export async function shiftLabelGameOverflowAction(
  sessionId: string,
  fromPointId: string,
): Promise<LabelGameShiftResult> {
  return withLabelOp("Move points to next game", () =>
    shiftLabelGameOverflow(sessionId, fromPointId),
  );
}

/**
 * Start a new game at a point: it and the rest of its game become a new game,
 * served by the other player. `label_points` (and flipped strokes) only; no
 * other game is renumbered. Refused at a game's first point and in a
 * tiebreak.
 */
export async function splitLabelGameAction(
  sessionId: string,
  atPointId: string,
): Promise<LabelGameShiftResult> {
  return withLabelOp("Start a new game", () =>
    splitLabelGame(sessionId, atPointId),
  );
}

/**
 * The mirror of the shift: pull the next game's first rows into the game
 * `gameKey` (`"set·game"`) until it is decided, and on down the match. Same
 * writes, same refusals; a game more likely missing a point is refused.
 */
export async function pullLabelGamePointsAction(
  sessionId: string,
  gameKey: string,
): Promise<LabelGameShiftResult> {
  return withLabelOp("Pull points into game", () =>
    pullLabelGamePoints(sessionId, gameKey),
  );
}

/**
 * The tiebreak at 6–6: make set `setNumber`'s next game a tiebreak, fold the
 * vendor's split games into it and set its 1-2-2 serve order.
 */
export async function foldLabelTiebreakAction(
  sessionId: string,
  setNumber: number,
): Promise<LabelGameShiftResult> {
  return withLabelOp("Fold tiebreak", () =>
    foldLabelTiebreak(sessionId, setNumber),
  );
}

/**
 * Split a point at `shotId`: that shot and every shot after it (in video
 * order, tombstones included) move to a new point right below `pointId`,
 * which takes the anchor's set, game, server and game type and the rallies
 * of the moved vendor shots; the later points move up one index and the
 * anchor becomes `edited`. `label_points` and `label_shots` only, never a
 * delete. Refused on a session that is not labelling, on a deleted point or
 * shot, and at the point's first live shot; a session labelled without
 * marks is fine — this is a manual edit.
 */
export async function splitLabelPointAction(
  pointId: string,
  shotId: string,
): Promise<LabelSplitPointResult> {
  return withLabelOp("Split point", () => splitLabelPoint(pointId, shotId));
}

/**
 * Combine `pointId` with its live neighbour `direction` in the same game:
 * the EARLIER point keeps both rows' shots and takes the later one's winner,
 * ending and ended by plus the union of their rallies; the later point
 * becomes a tombstone with no shots, which Undo then refuses. `label_points`
 * and `label_shots` only, never a delete. Refused on a session that is not
 * labelling and when there is no live neighbour that way in the game; a
 * session labelled without marks is fine.
 */
export async function combineLabelPointsAction(
  pointId: string,
  direction: CombineDirection,
): Promise<LabelCombinePointsResult> {
  return withLabelOp("Combine points", () =>
    combineLabelPoints(pointId, direction),
  );
}

/**
 * Switch a point's players by hand (`player-swap.ts`): every stroke's
 * hitter p1 ↔ p2, the winner and ended by flipped, statuses by the edit
 * rule — `server`, set and game untouched. `label_points` and `label_shots`
 * only, never a delete. Refused on a session that is not labelling, on a
 * tombstone and on a point with no stroke that names a hitter.
 */
export async function switchLabelPointPlayersAction(
  pointId: string,
): Promise<LabelPlayerSwitchResult> {
  return withLabelOp("Switch players", () => switchLabelPointPlayers(pointId));
}

/**
 * The "Score doesn't add up" banner's answers (board 08m): `final_score`
 * (the match's score as the labeller reads it, `[p1, p2]` games per set) and
 * `video_ends_early`, on `label_sessions` and nothing else — `matches` is
 * never written. Refused on a complete session, on one labelled without
 * marks, and for any other key.
 */
export async function updateLabelSessionFieldsAction(
  sessionId: string,
  patch: LabelSessionFieldsPatch,
): Promise<LabelSessionFieldsResult> {
  return updateLabelSessionFields(sessionId, patch);
}

/**
 * The console header's "Mark complete": publishes the labels to the match
 * (apply-session.ts, the replaced version backed up), then `label_sessions.status`
 * to `complete`. Refused on a session that is not labelling, and left open
 * when the publish refuses.
 */
export async function completeLabelSessionAction(
  sessionId: string,
): Promise<LabelSessionStatusResult> {
  return completeLabelSession(sessionId);
}

/**
 * The console header's "Reopen": a complete session back to `labelling`.
 * Refused while another session of the same match is open.
 */
export async function reopenLabelSessionAction(
  sessionId: string,
): Promise<LabelSessionStatusResult> {
  return reopenLabelSession(sessionId);
}

/**
 * The console's Undo: rewind the session's newest journaled action, whatever
 * it was — an edit, a delete, a split, a combine, a reset — and answer the
 * session's rows as they now stand. Every action above runs inside
 * `withLabelOp`, which is what files its writes as one step; this one does
 * not, so an undo is never itself a step to undo.
 */
export async function undoLabelOpAction(
  sessionId: string,
): Promise<LabelUndoResult> {
  return undoLabelOp(sessionId);
}

/**
 * "Add all missing shots": every open "Missing shot?" slot answered with "Add
 * shot", as one Undo step, and the session's rows answered whole.
 */
export async function addMissingShotsAction(
  sessionId: string,
  adds: MissingShotAdd[],
): Promise<LabelAddMissingShotsResult> {
  return withLabelOp("Add missing shots", () =>
    addMissingShots(sessionId, adds),
  );
}

/**
 * The console's open amber and grey counts, saved on the session for the
 * Labels list. Not a step to undo: outside `withLabelOp`.
 */
export async function recordLabelOpenCountsAction(
  sessionId: string,
  counts: LabelOpenCounts,
): Promise<LabelOpenCountsResult> {
  return recordLabelOpenCounts(sessionId, counts);
}

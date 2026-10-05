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
  restoreLabelPoint,
  restoreLabelShot,
  unmarkLabelPointChecked,
  type LabelAddShotResult,
  type LabelCheckedResult,
  type LabelMovePointResult,
  type LabelPointStatusResult,
  type LabelShotStatusResult,
} from "@/lib/services/labels/operations-session";
import {
  resetLabelPoint,
  resetLabelShot,
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
  return editLabelShot(shotId, patch);
}

/**
 * Autosave one edit to a label point — `winner`, `ending`, `ended_by`,
 * `serve_side` or `note`, and nothing else.
 */
export async function updateLabelPoint(
  pointId: string,
  patch: Record<string, unknown>,
): Promise<LabelPointEditResult> {
  return editLabelPoint(pointId, patch);
}

/**
 * Delete a label shot: a tombstone with `reason` (one of the migration's
 * `delete_reason` values), never a removed row. Undo is `restoreLabelShotAction`.
 */
export async function deleteLabelShotAction(
  shotId: string,
  reason: string,
): Promise<LabelShotStatusResult> {
  return deleteLabelShot(shotId, reason);
}

/** Undo a shot's delete: the status it had before comes back. */
export async function restoreLabelShotAction(
  shotId: string,
): Promise<LabelShotStatusResult> {
  return restoreLabelShot(shotId);
}

/**
 * Add a stroke the vendor missed, after `afterShotId` (null: at the end of
 * the rally). Returns the new row.
 */
export async function addLabelShotAction(
  pointId: string,
  afterShotId: string | null,
): Promise<LabelAddShotResult> {
  return addLabelShot(pointId, afterShotId);
}

/** Delete a label point: a tombstone, never a removed row. */
export async function deleteLabelPointAction(
  pointId: string,
): Promise<LabelPointStatusResult> {
  return deleteLabelPoint(pointId);
}

/** Undo a point's delete. */
export async function restoreLabelPointAction(
  pointId: string,
): Promise<LabelPointStatusResult> {
  return restoreLabelPoint(pointId);
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
  return moveLabelPoint(pointId, to, switchServer);
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
  return setLabelGameServer(sessionId, game, server);
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
  return setLabelGameType(sessionId, game, type);
}

/** Mark a point checked (`checked_at` = now) or, with `checked` false, clear it. */
export async function setLabelPointCheckedAction(
  pointId: string,
  checked: boolean,
): Promise<LabelCheckedResult> {
  return checked
    ? markLabelPointChecked(pointId)
    : unmarkLabelPointChecked(pointId);
}

/**
 * Reset an edited shot to the values it was seeded with (status back to
 * `kept`). Refused for an added or deleted shot, or one with no stored seed.
 * Its unclear marks stay as they are.
 */
export async function resetLabelShotAction(
  shotId: string,
): Promise<LabelShotStatusResult> {
  return resetLabelShot(shotId);
}

/**
 * Reset an edited point's own fields — set, game, server, serve side, won by,
 * ending, ended by — to the values it was seeded with (status back to
 * `unchanged`). Its shots, note and checked mark stay as they are.
 */
export async function resetLabelPointAction(
  pointId: string,
): Promise<LabelPointStatusResult> {
  return resetLabelPoint(pointId);
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
  return restoreLabelSiteRemoval(shotId);
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
  return dismissLabelSuggestion(pointId, key);
}

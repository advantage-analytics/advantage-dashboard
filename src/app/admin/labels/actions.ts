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
import type { LabelGame } from "@/lib/services/labels/operations";

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

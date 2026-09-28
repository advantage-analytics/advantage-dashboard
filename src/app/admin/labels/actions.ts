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

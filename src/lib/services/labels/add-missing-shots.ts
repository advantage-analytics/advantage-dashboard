/**
 * "Add all missing shots": every open "Missing shot?" slot answered with "Add
 * shot" in one call, so the action is one Undo step (the caller runs it inside
 * one `withLabelOp`). Each add is the console's own (`addLabelShot`), so the
 * ending sync a single add writes is written for each. Then the session's rows
 * read back whole, as Undo does.
 *
 * An add that is refused is counted and skipped, never retried: the rest still
 * land, and the labeller sees how many did not.
 */

import { isUuid } from "@/lib/admin/validation";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { addLabelShot, type LabelAddShotResult } from "./operations-session";
import type { LabelPoint } from "./session";

export interface MissingShotAdd {
  pointId: string;
  afterShotId: string;
}

export type LabelAddMissingShotsResult =
  | { ok: true; added: number; failed: number; points: LabelPoint[] }
  | { error: string };

export interface AddMissingShotsDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  addShot: (
    pointId: string,
    afterShotId: string,
  ) => Promise<LabelAddShotResult>;
  createAdminClient: () => AdminClient;
  readPoints: (
    db: AdminClient,
    sessionId: string,
  ) => Promise<LabelPoint[] | null>;
}

const defaults: AddMissingShotsDependencies = {
  requireAdmin,
  addShot: (pointId, afterShotId) => addLabelShot(pointId, afterShotId),
  createAdminClient,
  readPoints: async (db, sessionId) =>
    (await readLabelSessionRows(db, sessionId))?.session.points ?? null,
};

/** The most one call adds: a match's worth, never an unbounded loop. */
export const MAX_MISSING_SHOT_ADDS = 400;

export async function addMissingShots(
  sessionId: string,
  adds: readonly MissingShotAdd[],
  deps: AddMissingShotsDependencies = defaults,
): Promise<LabelAddMissingShotsResult> {
  const viewer = await deps.requireAdmin();
  if (!viewer) return { error: "Admin access required." };
  if (!isUuid(sessionId)) return { error: "No such session." };
  if (!Array.isArray(adds) || adds.length > MAX_MISSING_SHOT_ADDS) {
    return { error: "Too many shots to add at once." };
  }
  let added = 0;
  let failed = 0;
  // One at a time: two adds in one point read each other's rows.
  for (const add of adds) {
    if (!isUuid(add?.pointId) || !isUuid(add?.afterShotId)) {
      failed += 1;
      continue;
    }
    const result = await deps.addShot(add.pointId, add.afterShotId);
    if ("error" in result) failed += 1;
    else added += 1;
  }
  const points = await deps.readPoints(deps.createAdminClient(), sessionId);
  if (!points) return { error: "No such session." };
  return { ok: true, added, failed, points };
}

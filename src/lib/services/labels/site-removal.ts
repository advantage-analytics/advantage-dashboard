/**
 * Restoring a ghost: a vendor stroke the site removed before the transcript was
 * built (`label_shots.site_removal`), put back by the labeller.
 *
 * Restore writes one column, `site_removal_restored_at`, and leaves `status`
 * alone: a restored ghost is `kept` with the values the vendor gave it, and the
 * comparison tells the site's removal (`site_removal` set) from a labeller's
 * own (`status = 'deleted'`) by the column each uses.
 *
 * Pure: the console runs `applySiteRemovalRestore` and
 * `site-removal-session.ts` runs `planSiteRemovalRestore`. The one restore
 * with no click of its own is `ghostFreedByServeIn`, which edit-session.ts
 * runs when a serve is relabelled in.
 */

import type { LabelShotPatch } from "./edit";
import type { Planned } from "./operations";
import {
  isGhostShot,
  isMissedResult,
  isServeStroke,
  orderLabelShots,
  type LabelShot,
} from "./session";

/** What the plan reads off a shot — the console's row or the service's read. */
export type SiteRemovalShot = Pick<
  LabelShot,
  "status" | "siteRemoval" | "siteRemovalRestoredAt"
>;

export interface SiteRemovalRestoreWrite {
  site_removal_restored_at: string;
}

/**
 * Restore a ghost: an error unless the shot is one — the site removed it, the
 * labeller has not put it back, and it is not a tombstone (a labeller who
 * deleted a ghost themselves undoes THAT first, through the tombstone's Undo).
 * `at` is the moment written; the service passes now.
 */
export function planSiteRemovalRestore(
  shot: SiteRemovalShot,
  at: string,
): Planned<SiteRemovalRestoreWrite> {
  if (shot.siteRemoval === null) {
    return { error: "The site did not remove this shot." };
  }
  if (shot.siteRemovalRestoredAt !== null) {
    return { error: "This shot is already restored." };
  }
  if (shot.status === "deleted") {
    return { error: "Undo this shot's delete first." };
  }
  return { ok: true, write: { site_removal_restored_at: at } };
}

/** The console's row after Restore; a shot that is not a ghost is unchanged. */
export function applySiteRemovalRestore(
  shot: LabelShot,
  at: string,
): LabelShot {
  if (!isGhostShot(shot)) return shot;
  return { ...shot, siteRemovalRestoredAt: at };
}

/**
 * The ghost a serve relabelled in frees: the site removed a swing at a serve
 * it took for a fault (`hit_after_fault`), so a labeller who marks that serve
 * in has said the swing was a return after all. The stroke right after the
 * serve in video order (tombstones are not strokes) — when it is such a ghost
 * — is the one to put back; null otherwise. `shots` are the point's rows as
 * read, `before` the serve's stroke and result before the patch.
 */
export function ghostFreedByServeIn(
  shots: readonly LabelShot[],
  shotId: string,
  before: Pick<LabelShot, "stroke" | "result">,
  patch: LabelShotPatch,
): string | null {
  if (patch.result !== "in" || !isMissedResult(before.result)) return null;
  if (!isServeStroke("stroke" in patch ? patch.stroke : before.stroke)) {
    return null;
  }
  const strokes = orderLabelShots(shots).filter(
    (shot) => shot.status !== "deleted",
  );
  const at = strokes.findIndex((shot) => shot.id === shotId);
  if (at === -1) return null;
  const next = strokes[at + 1];
  return next && isGhostShot(next) && next.siteRemoval === "hit_after_fault"
    ? next.id
    : null;
}

/**
 * Restoring a ghost — a vendor stroke the SITE removed before the transcript
 * was built (`label_shots.site_removal`, board 08m §3), put back by the
 * labeller.
 *
 * The removal itself is the one mark applied without a click (the seed and
 * the backfill write `site_removal`); Restore is the labeller's answer, and
 * the only thing this module plans. It writes ONE column,
 * `site_removal_restored_at`, and leaves `status` alone: a restored ghost is
 * `kept` with the values the vendor gave it, and the comparison tells the
 * site's removal (`site_removal` set) from a labeller's own
 * (`status = 'deleted'`) by the column each one uses.
 *
 * Pure: the console runs `applySiteRemovalRestore` for its optimistic row and
 * `site-removal-session.ts` runs `planSiteRemovalRestore` before its write.
 */

import type { Planned } from "./operations";
import { isGhostShot, type LabelShot } from "./session";

/** What the plan reads off a shot — the console's row or the service's read. */
export type SiteRemovalShot = Pick<
  LabelShot,
  "status" | "siteRemoval" | "siteRemovalRestoredAt"
>;

/** The one column Restore writes. */
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

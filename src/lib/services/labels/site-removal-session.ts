/**
 * The console's Restore of a ghost: put a vendor stroke the site removed back
 * into the rally (`site-removal.ts`). Admin-gated like edit-session.ts, with
 * the marks gate (`checkSessionOpen` with `blind`).
 *
 * Its write on the stroke is an UPDATE of `label_shots` setting
 * `site_removal_restored_at`, matched on the id and on the two columns the plan
 * read (`site_removal is not null`, `site_removal_restored_at is null`), so two
 * tabs restoring the same ghost cannot both report success and nothing but a
 * ghost is ever touched. A ghost put back is a stroke of the rally again, so
 * the point's ending then follows (ending-session.ts).
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  defaultLabelWriteDependencies,
  racedMessage,
  readSessionGate,
  restoreGhostRow,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  endingSyncFailed,
  withSyncedPoint,
  readPointShots,
  syncEndingAfterShotChange,
} from "./ending-session";
import {
  gated,
  normaliseId,
  type LabelOpResult,
  type WithSyncedPoint,
} from "./operations-session";
import type { LabelShotStatus, LabelSiteRemoval } from "./session";
import {
  applySiteRemovalRestore,
  planSiteRemovalRestore,
} from "./site-removal";

export type LabelSiteRemovalRestoreResult = LabelOpResult<
  { siteRemovalRestoredAt: string } & WithSyncedPoint
>;

const RACED = racedMessage("row");
const BLIND =
  "This session is labelled without the site's marks, so there is nothing to restore.";

interface GhostRow {
  id: string;
  session_id: string;
  label_point_id: string;
  status: LabelShotStatus;
  site_removal: LabelSiteRemoval | null;
  site_removal_restored_at: string | null;
}

/**
 * Read the ghost, check its session, write the one column, then the point's
 * ending. Never throws.
 */
export async function writeLabelSiteRemovalRestore(params: {
  supabase: AdminClient;
  shotId: unknown;
  /** The moment written; now by default. */
  at?: string;
}): Promise<LabelSiteRemovalRestoreResult> {
  const { supabase } = params;
  const shotId = normaliseId(params.shotId);
  if (!shotId) return { error: "Invalid shot id." };

  const { data: row, error } = await supabase
    .from("label_shots")
    .select(
      "id, session_id, label_point_id, status, site_removal, site_removal_restored_at",
    )
    .eq("id", shotId)
    .maybeSingle<GhostRow>();
  if (error) return { error: `Could not read the shot: ${error.message}` };
  if (!row) return { error: "Shot not found." };

  const [gate, owned] = await Promise.all([
    readSessionGate(supabase, row.session_id, { blind: BLIND }),
    readPointShots(supabase, row.label_point_id),
  ]);
  if ("error" in gate) return gate;
  if ("error" in owned) return owned;

  const at = params.at ?? new Date().toISOString();
  const plan = planSiteRemovalRestore(
    {
      status: row.status,
      siteRemoval: row.site_removal,
      siteRemovalRestoredAt: row.site_removal_restored_at,
    },
    at,
  );
  if ("error" in plan) return plan;

  const ghost = await restoreGhostRow(
    supabase,
    shotId,
    plan.write.site_removal_restored_at,
  );
  if ("error" in ghost) {
    return { error: `Could not restore the shot: ${ghost.error}` };
  }
  if (!ghost.restored) return { error: RACED };
  const synced = await syncEndingAfterShotChange({
    supabase,
    pointId: row.label_point_id,
    ghosts: gate.ghosts,
    before: owned.shots,
    after: owned.shots.map((shot) =>
      shot.id === shotId ? applySiteRemovalRestore(shot, at) : shot,
    ),
  });
  if ("error" in synced) return { error: endingSyncFailed(synced.error) };
  return {
    ok: true,
    siteRemovalRestoredAt: plan.write.site_removal_restored_at,
    ...withSyncedPoint(synced),
  };
}

export function restoreLabelSiteRemoval(
  shotId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSiteRemovalRestoreResult> {
  return gated(
    deps,
    (supabase) => writeLabelSiteRemovalRestore({ supabase, shotId }),
    "restore the shot",
  );
}

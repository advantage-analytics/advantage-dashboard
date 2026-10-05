/**
 * The labelling console's Restore of a ghost, admin-gated: put a vendor
 * stroke the SITE removed back into the rally (`site-removal.ts`).
 *
 * Same shape as operations-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a `complete`
 * session, and decides what to write with the pure rule in site-removal.ts —
 * the one the console ran for its optimistic update.
 *
 * Two things are this write's own. It also refuses a session whose
 * `marks_enabled` is false (`checkSessionOpen` with `blind`, the gate every
 * marks write shares): that session's labels were made blind to the derivation and
 * carry no ghost to restore — the ground-truth match is never written from
 * here. And its ONE write is an UPDATE of `label_shots` setting
 * `site_removal_restored_at`, matched on the id AND on the two columns the
 * plan read (`site_removal is not null`, `site_removal_restored_at is null`),
 * so two tabs restoring the same ghost cannot both report success, and
 * nothing but a ghost is ever touched. No other table, no other column, no
 * delete. `tests/label-operations.spec.ts` scans this file for a delete call.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  gated,
  normaliseId,
  racedMessage,
  type LabelOpResult,
} from "./operations-session";
import type { LabelShotStatus, LabelSiteRemoval } from "./session";
import { planSiteRemovalRestore } from "./site-removal";

export type LabelSiteRemovalRestoreResult = LabelOpResult<{
  siteRemovalRestoredAt: string;
}>;

const RACED = racedMessage("row");
const BLIND =
  "This session is labelled without the site's marks, so there is nothing to restore.";

interface GhostRow {
  id: string;
  session_id: string;
  status: LabelShotStatus;
  site_removal: LabelSiteRemoval | null;
  site_removal_restored_at: string | null;
}

/** Read the ghost, check its session, write the one column. Never throws. */
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
    .select("id, session_id, status, site_removal, site_removal_restored_at")
    .eq("id", shotId)
    .maybeSingle<GhostRow>();
  if (error) return { error: `Could not read the shot: ${error.message}` };
  if (!row) return { error: "Shot not found." };

  const refused = await checkSessionOpen(supabase, row.session_id, {
    blind: BLIND,
  });
  if (refused) return { error: refused };

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

  const { data: written, error: writeError } = await supabase
    .from("label_shots")
    .update({ ...plan.write })
    .eq("id", shotId)
    .not("site_removal", "is", null)
    .is("site_removal_restored_at", null)
    .select("id");
  if (writeError) {
    return { error: `Could not restore the shot: ${writeError.message}` };
  }
  if (!written || written.length === 0) return { error: RACED };
  return {
    ok: true,
    siteRemovalRestoredAt: plan.write.site_removal_restored_at,
  };
}

/** The admin-gated entry point behind `restoreLabelSiteRemovalAction`. */
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

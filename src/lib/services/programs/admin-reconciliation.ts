import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import { UUID_RE } from "@/lib/admin/validation";

export type AdminReconcileMode = "abandon" | "complete";
export type AdminReconcileResult =
  | {
      ok: true;
      mode: AdminReconcileMode;
      kind: "video" | "file";
      matchId: string | null;
      /** True when the console-created match was purged and deleted. */
      matchDeleted: boolean;
    }
  | { ok: false; message: string };

interface Dependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => SupabaseClient;
  purgeMatchStorage: (
    supabase: SupabaseClient,
    matchIds: string[],
    label?: string,
  ) => Promise<void>;
}
const defaults: Dependencies = {
  requireAdmin,
  createAdminClient,
  purgeMatchStorage: (supabase, matchIds, label) =>
    purgeMatchStorage(supabase, matchIds, label),
};

/** `admin_reconcile_submission_item`'s refusal codes, in operator words. */
const REFUSALS: Record<string, string> = {
  "admin-required": "Administrator access is required.",
  "mode-invalid": "Choose abandon or complete.",
  "operation-not-found": "This submission no longer exists.",
  "item-not-found": "This submission item no longer exists.",
  "kind-unsupported":
    "Only video and SwingVision file attempts can be reconciled.",
  "attempt-missing":
    "This item has no live attempt. It was never admitted or is already reconciled.",
  "linkage-mismatch":
    "This item's match, job or file no longer agree. Reconcile it by hand.",
  "mode-unsupported":
    "A video completes only through the vendor. It can be abandoned, not marked complete.",
  "attempt-active":
    "The vendor has accepted this video, so it cannot be abandoned.",
  "quota-held":
    "This video still holds a processing reservation. Release the reservation first.",
  "attempt-completed": "This attempt already completed.",
  "attempt-not-processing": "Only a processing file can be marked complete.",
  "analysis-missing":
    "The analysis has not landed: this match has no points or statistics yet.",
  "analysis-present":
    "The analysis already landed for this match. Mark it complete instead.",
};

/**
 * Administrator reconciliation of a stuck console attempt (T22).
 *
 * The RPC does every database write in one transaction and names the session
 * actor in its audit row. When it abandons an item whose match the console
 * itself created (`consoleCreated`), that match now has no console reference
 * and is ordinary storage to clear: purge its objects, then delete the row.
 * The purge comes first and a throw stops before the delete — the RPC's
 * reversion stays, and the match is left as an ordinary manual match rather
 * than a row whose storage was never cleared.
 */
export async function reconcileAdminSubmission(
  input: { operationId: unknown; itemId: unknown; mode: unknown },
  deps: Dependencies = defaults,
): Promise<AdminReconcileResult> {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  const { operationId, itemId, mode } = input;
  if (
    typeof operationId !== "string" ||
    !UUID_RE.test(operationId) ||
    typeof itemId !== "string" ||
    !UUID_RE.test(itemId) ||
    (mode !== "abandon" && mode !== "complete")
  )
    return { ok: false, message: "Invalid reconciliation request." };
  const admin = deps.createAdminClient();
  const { data, error } = await admin.rpc("admin_reconcile_submission_item", {
    p_actor_id: actor.id,
    p_operation_id: operationId.toLowerCase(),
    p_item_id: itemId.toLowerCase(),
    p_mode: mode,
  });
  if (error || !data || typeof data !== "object")
    return {
      ok: false,
      message:
        (error && REFUSALS[error.message]) ??
        "We couldn't reconcile this item. Try again.",
    };
  const result = data as {
    kind: "video" | "file";
    programId: string;
    matchId: string | null;
    consoleCreated: boolean;
  };
  let matchDeleted = false;
  if (mode === "abandon" && result.consoleCreated === true && result.matchId) {
    try {
      await deps.purgeMatchStorage(admin, [result.matchId], "console abandon");
    } catch (e) {
      return {
        ok: false,
        message: `The attempt was abandoned, but its match could not be deleted: ${
          e instanceof Error ? e.message : "storage purge failed."
        }`,
      };
    }
    const deleted = await admin
      .from("matches")
      .delete()
      .eq("id", result.matchId)
      .eq("program_id", result.programId);
    if (deleted.error)
      return {
        ok: false,
        message:
          "The attempt was abandoned and its files removed, but the match row could not be deleted.",
      };
    matchDeleted = true;
  }
  return {
    ok: true,
    mode,
    kind: result.kind,
    matchId: result.matchId,
    matchDeleted,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "./admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import { releaseStoragePurgeClaims } from "@/lib/services/matches/release-storage-purge-claim";
import { MATCH_DATA_BUCKET } from "@/lib/services/upload/storage.service";
import { UUID_RE } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { submitAdminDualResults } from "./admin-dual-submission";
import { submitAdminTournamentResult } from "./admin-tournament-submission";
import type {
  AdminDualSubmissionResult,
  AdminTournamentSubmissionResult,
} from "@/lib/admin/results/types";

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
 * actor in its audit row. When it abandons a file attempt it deletes the
 * `match_files` row — the only other record of the `.xlsx`'s path — and hands
 * the path back as `storagePath`, so the object is removed here, right after
 * the RPC and before any purge (which reads `match_files` by match id and so
 * cannot find it, and which an attachment abandon never runs). That removal
 * is best-effort, like the purge's own lanes: nothing references the object
 * once the RPC commits, the path is kept under `result->'abandoned'` for a
 * retry by hand, and a storage failure must not fail a reconcile that already
 * committed. When the abandoned item's match was the console's own
 * (`consoleCreated`), that match now has no console reference and is ordinary
 * storage to clear: purge its objects, then delete the row. The purge comes
 * first and a throw stops before the delete — the RPC's reversion stays, and
 * the match is left as an ordinary manual match rather than a row whose
 * storage was never cleared.
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
    /** The abandoned `match_files.storage_path`; non-null only on a file abandon. */
    storagePath: string | null;
    consoleCreated: boolean;
  };
  if (
    mode === "abandon" &&
    result.kind === "file" &&
    typeof result.storagePath === "string" &&
    result.storagePath.length > 0
  ) {
    try {
      const { error: removeError } = await admin.storage
        .from(MATCH_DATA_BUCKET)
        .remove([result.storagePath]);
      if (removeError)
        console.error(
          `[console abandon] could not remove ${result.storagePath} from ${MATCH_DATA_BUCKET}:`,
          removeError.message,
        );
    } catch (e) {
      console.error("[console abandon] file removal threw:", e);
    }
  }
  let matchDeleted = false;
  if (mode === "abandon" && result.consoleCreated === true && result.matchId) {
    try {
      await deps.purgeMatchStorage(admin, [result.matchId], "console abandon");
    } catch (e) {
      return {
        ok: false,
        message: `The attempt was abandoned, but its match could not be deleted: ${
          e instanceof Error ? e.message : "storage purge failed."
        } Reload the page to see the updated item.`,
      };
    }
    const deleted = await admin
      .from("matches")
      .delete()
      .eq("id", result.matchId)
      .eq("program_id", result.programId);
    if (deleted.error) {
      await releaseStoragePurgeClaims(
        admin,
        [result.matchId],
        "console abandon",
      );
      return {
        ok: false,
        message:
          "The attempt was abandoned and its files removed, but the match row could not be deleted. Reload the page to see the updated item.",
      };
    }
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

// ─── Dual and tournament result operations (T25) ────────────────────────────

interface ResultDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  /** Session client: the provenance and batch tables have admin SELECT RLS only. */
  createClient: () => Promise<SupabaseClient>;
  createAdminClient: () => SupabaseClient;
  submitAdminDualResults: (
    input: unknown,
  ) => Promise<AdminDualSubmissionResult>;
  submitAdminTournamentResult: (
    input: unknown,
  ) => Promise<AdminTournamentSubmissionResult>;
}
const resultDefaults: ResultDependencies = {
  requireAdmin,
  createClient,
  createAdminClient,
  submitAdminDualResults: (input) => submitAdminDualResults(input),
  submitAdminTournamentResult: (input) => submitAdminTournamentResult(input),
};

export type AdminResumeResult =
  | { ok: true; kind: "dual"; result: AdminDualSubmissionResult & { ok: true } }
  | {
      ok: true;
      kind: "tournament";
      result: AdminTournamentSubmissionResult & { ok: true };
    }
  | { ok: false; message: string };

/**
 * Resume a dual or tournament submission whose browser closed between prepare
 * and the last apply.
 *
 * The request is the one `admin_prepare_*` froze in `admin_dual_batches` /
 * `admin_tournament_batches` — read through the session client, whose admin
 * SELECT RLS is the only grant those tables have — and it is handed to the
 * submit service unmodified, so the prepare RPC's replay equality check sees
 * exactly what it stored. Nothing but the operation id is taken from the
 * caller. Only the operation's own actor may resume: `admin_prepare_*`
 * refuses anyone else with `operation-unavailable`, so the refusal is made
 * here first, before any submit call.
 */
export async function resumeAdminResults(
  operationId: unknown,
  deps: ResultDependencies = resultDefaults,
): Promise<AdminResumeResult> {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  if (typeof operationId !== "string" || !UUID_RE.test(operationId))
    return { ok: false, message: "Invalid resume request." };
  const id = operationId.toLowerCase();
  const session = await deps.createClient();
  const submission = await session
    .from("admin_upload_submissions")
    .select("operation_id, actor_user_id, kind")
    .eq("operation_id", id)
    .maybeSingle();
  if (submission.error)
    return {
      ok: false,
      message: "We couldn't load this submission. Try again.",
    };
  const row = submission.data as {
    actor_user_id: string | null;
    kind: string;
  } | null;
  if (!row) return { ok: false, message: "This submission no longer exists." };
  if (row.kind !== "dual" && row.kind !== "tournament")
    return {
      ok: false,
      message: "Only dual and tournament results can be resumed.",
    };
  if (row.actor_user_id !== actor.id)
    return {
      ok: false,
      message:
        "Only the administrator who started this submission can resume it. Abandon its pending results instead.",
    };
  const batch = await session
    .from(
      row.kind === "dual" ? "admin_dual_batches" : "admin_tournament_batches",
    )
    .select("request")
    .eq("operation_id", id)
    .maybeSingle();
  if (batch.error)
    return {
      ok: false,
      message: "We couldn't load this submission. Try again.",
    };
  const request = (batch.data as { request: unknown } | null)?.request;
  if (request == null || typeof request !== "object")
    return {
      ok: false,
      message:
        "This submission has no saved request, so it cannot be resumed. Abandon its pending results instead.",
    };
  if (row.kind === "dual") {
    const result = await deps.submitAdminDualResults(request);
    return result.ok ? { ok: true, kind: "dual", result } : result;
  }
  const result = await deps.submitAdminTournamentResult(request);
  return result.ok ? { ok: true, kind: "tournament", result } : result;
}

/** `admin_abandon_result_items`' refusal codes, in operator words. */
const ABANDON_REFUSALS: Record<string, string> = {
  "admin-required": "Administrator access is required.",
  "operation-not-found": "This submission no longer exists.",
  "kind-unsupported": "Only dual and tournament results can be abandoned here.",
};

export type AdminAbandonResultsResult =
  { ok: true; abandonedItemIds: string[] } | { ok: false; message: string };

/**
 * Abandon every still-pending item of a dual or tournament submission (T24's
 * RPC), releasing the lines those items reserve. Any current administrator
 * may abandon — the original actor may be gone — and the RPC's audit row
 * names the session actor, never a caller-supplied one.
 */
export async function abandonAdminResults(
  operationId: unknown,
  deps: Pick<
    ResultDependencies,
    "requireAdmin" | "createAdminClient"
  > = resultDefaults,
): Promise<AdminAbandonResultsResult> {
  const actor = await deps.requireAdmin();
  if (!actor)
    return { ok: false, message: "Administrator access is required." };
  if (typeof operationId !== "string" || !UUID_RE.test(operationId))
    return { ok: false, message: "Invalid abandon request." };
  const { data, error } = await deps
    .createAdminClient()
    .rpc("admin_abandon_result_items", {
      p_actor_id: actor.id,
      p_operation_id: operationId.toLowerCase(),
    });
  if (error || !data || typeof data !== "object")
    return {
      ok: false,
      message:
        (error && ABANDON_REFUSALS[error.message]) ??
        "We couldn't abandon these results. Try again.",
    };
  const ids = (data as { abandonedItemIds?: unknown }).abandonedItemIds;
  return {
    ok: true,
    abandonedItemIds: Array.isArray(ids) ? ids.map(String) : [],
  };
}

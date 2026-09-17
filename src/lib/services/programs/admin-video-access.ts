import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import type { Workspace } from "@/lib/workspace/types";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";

export interface AdminVideoAuthorization {
  jobId: string;
  matchId: string;
  programId: string;
  workspace: Workspace;
  roster: readonly RosterIdentity[];
}

/** Always discover provenance, including calls made through dashboard endpoints. */
export async function authorizeAdminVideo(
  admin: SupabaseClient,
  actorId: string,
  matchId: string,
  jobId: string | null,
  action: "read" | "upload",
): Promise<AdminVideoAuthorization | null> {
  const { data, error } = await admin.rpc("admin_video_access", {
    p_actor_id: actorId,
    p_match_id: matchId,
    p_job_id: jobId,
    p_action: action,
  });
  if (error) throw new Error("This video operation is unavailable.");
  if (!data) return null;
  const resolved = await getAdminUploadContext(data.programId);
  if (!resolved.ok || resolved.context.actorId !== actorId)
    throw new Error("This program's video context is unavailable.");
  const context = resolved.context;
  return {
    ...data,
    workspace: context.workspace,
    roster: context.roster.map((player) => ({
      playerId: player.playerId,
      userId: player.userId ?? null,
    })),
  };
}

/** Only used after the handler claims this durable job. No client account IDs. */
export async function reserveAdminVideoQuota(
  admin: SupabaseClient,
  params: { jobId: string; userId: string; seconds: number },
): Promise<import("@/lib/services/splitstep/quota").QuotaReservation> {
  const { currentBillingMonth, getMonthlyCapSeconds } =
    await import("@/lib/services/splitstep/config");
  const { data, error } = await admin.rpc("admin_reserve_video_quota", {
    p_actor_id: params.userId,
    p_job_id: params.jobId,
    p_seconds: params.seconds,
    p_billing_month: currentBillingMonth(),
    p_program_cap: getMonthlyCapSeconds("program"),
    p_individual_cap: getMonthlyCapSeconds("individual"),
  });
  const row = data?.[0];
  if (error || !row)
    return {
      ok: false,
      usedSeconds: 0,
      capSeconds: 0,
      permission: true,
      message:
        "This video's allowance could not be reserved safely. Reload the operation before retrying.",
    };
  return row.ok
    ? { ok: true, usedSeconds: row.used_seconds, capSeconds: row.cap_seconds }
    : {
        ok: false,
        usedSeconds: row.used_seconds,
        capSeconds: row.cap_seconds,
        message: "This program's monthly video allowance is exhausted.",
      };
}

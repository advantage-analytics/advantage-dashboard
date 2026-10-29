import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdminPersonalUploadContext,
  getAdminUploadContext,
} from "@/lib/data/admin-upload-server";
import type { AdminUploadBilling } from "@/lib/admin/uploads/types";
import type { Workspace } from "@/lib/workspace/types";
import type { RosterIdentity } from "@/lib/workspace/upload-eligibility";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";

export interface AdminVideoAuthorization {
  jobId: string;
  matchId: string;
  /** Null for a player's personal workspace — then `ownerId` is set. */
  programId: string | null;
  /**
   * The player a personal console video belongs to: the match's own
   * `created_by` and `player1_id`. The handlers ask the upload contract on
   * their behalf (`viewerId`), since the session is the administrator's.
   */
  ownerId?: string | null;
  workspace: Workspace;
  roster: readonly RosterIdentity[];
}

interface AccessRow {
  jobId: string;
  matchId: string;
  programId: string | null;
  personalUserId: string | null;
  billing: AdminUploadBilling | null;
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
  const access = data as AccessRow;
  if (access.personalUserId) {
    const resolved = await getAdminPersonalUploadContext(
      access.personalUserId,
      access.billing === "player" ? "player" : "free",
    );
    if (!resolved.ok || resolved.context.actorId !== actorId)
      throw new Error("This player's video context is unavailable.");
    return {
      jobId: access.jobId,
      matchId: access.matchId,
      programId: null,
      ownerId: access.personalUserId,
      workspace: resolved.context.workspace,
      roster: [],
    };
  }
  const resolved = await getAdminUploadContext(access.programId ?? "");
  if (!resolved.ok || resolved.context.actorId !== actorId)
    throw new Error("This program's video context is unavailable.");
  const context = resolved.context;
  return {
    jobId: access.jobId,
    matchId: access.matchId,
    programId: access.programId,
    ownerId: null,
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
  params: {
    jobId: string;
    userId: string;
    seconds: number;
    workspace: Workspace;
  },
): Promise<import("@/lib/services/splitstep/quota").QuotaReservation> {
  const { currentBillingMonth, getMonthlyCapSeconds } =
    await import("@/lib/services/splitstep/config");
  const personal = params.workspace.kind === "personal";
  const { data, error } = await admin.rpc("admin_reserve_video_quota", {
    p_actor_id: params.userId,
    p_job_id: params.jobId,
    p_seconds: params.seconds,
    p_billing_month: currentBillingMonth(),
    p_program_cap: getMonthlyCapSeconds("program"),
    // A personal target's own figure (pilot, admin or the 2h default; the SQL
    // lets the hours override win). Read by the RPC only when the stored
    // billing is the player's; free never consults it.
    p_individual_cap: personal
      ? monthlyCapSecondsFor(params.workspace)
      : getMonthlyCapSeconds("individual"),
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
        message: personal
          ? "This player's free hours and credits don't cover this video. Upload it free instead, or shorten the trim."
          : "This program's monthly video allowance is exhausted.",
      };
}

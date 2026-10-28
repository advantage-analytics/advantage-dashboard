import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminPersonalUploadContext,
  getAdminUploadContext,
} from "@/lib/data/admin-upload-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import {
  getProgramSchedule,
  readScheduleWithClient,
} from "@/lib/data/schedule-server";
import type { RosterIdRow } from "@/lib/data/roster-ids";

/** Client intent only. Every action resolves this again against the session. */
export type WizardLookupScope =
  | { source: "admin"; programId: string }
  /** A player's personal workspace, uploaded into from the admin console. */
  | { source: "admin"; userId: string }
  | { source: "dashboard"; programId?: string };

interface Dependencies {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  getAdminUploadContext: typeof getAdminUploadContext;
  /** Optional so test seams written before it keep compiling. */
  getAdminPersonalUploadContext?: typeof getAdminPersonalUploadContext;
  getWorkspaceContext: typeof getWorkspaceContext;
}

/** No cookies or memberships are changed by selecting a console program. */
export async function resolveWizardLookupScope(
  scope?: WizardLookupScope,
  deps: Dependencies = {
    createClient,
    createAdminClient,
    getAdminUploadContext,
    getAdminPersonalUploadContext,
    getWorkspaceContext,
  },
) {
  // Reject malformed explicit scopes instead of falling back to the cookie.
  if (
    scope !== undefined &&
    (!scope || !["admin", "dashboard"].includes(scope.source))
  )
    return null;
  if (scope?.source === "admin" && "userId" in scope) {
    if (typeof scope.userId !== "string") return null;
    // Billing does not change what a lookup reads; the player's own matches
    // are the personal workspace's, read as the dashboard reads them.
    const resolvePersonal =
      deps.getAdminPersonalUploadContext ?? getAdminPersonalUploadContext;
    const result = await resolvePersonal(scope.userId, "free");
    if (!result.ok) return null;
    return {
      source: "admin" as const,
      programId: null,
      actorId: result.context.workspace.id,
      canReadSchedule: false,
      client: deps.createAdminClient(),
      rosterIds: null,
    };
  }
  if (scope?.source === "admin") {
    if (!("programId" in scope) || typeof scope.programId !== "string")
      return null;
    const result = await deps.getAdminUploadContext(scope.programId);
    if (!result.ok) return null;
    const { context } = result;
    const client = deps.createAdminClient();
    return {
      source: "admin" as const,
      programId: context.workspace.id,
      actorId: context.actorId,
      canReadSchedule: true,
      client,
      rosterIds: context.roster.map((row): RosterIdRow => ({
        player_id: row.playerId,
        user_id: row.userId,
      })),
    };
  }
  const workspace = await deps.getWorkspaceContext();
  if (!workspace) return null;
  const programId =
    workspace.active.kind === "team" ? workspace.active.id : null;
  if (scope?.programId !== undefined && scope.programId !== programId)
    return null;
  const client = await deps.createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || user.id !== workspace.viewer.id) return null;
  return {
    source: "dashboard" as const,
    programId,
    actorId: user.id,
    canReadSchedule:
      workspace.active.kind === "team" &&
      canManageTeamSchedule(workspace.active),
    client,
    rosterIds: null,
  };
}

export type ResolvedWizardLookupScope = NonNullable<
  Awaited<ReturnType<typeof resolveWizardLookupScope>>
>;

export async function readWizardSchedule(scope: ResolvedWizardLookupScope) {
  if (!scope.programId || !scope.canReadSchedule)
    throw new Error("Schedule access required");
  return scope.source === "admin"
    ? readScheduleWithClient(scope.client, scope.programId)
    : getProgramSchedule(scope.programId);
}

export async function readWizardRosterIds(
  scope: ResolvedWizardLookupScope,
): Promise<RosterIdRow[]> {
  if (!scope.programId || !scope.canReadSchedule) return [];
  if (scope.rosterIds) return scope.rosterIds;
  const { data } = await scope.client.rpc("program_roster_full", {
    p_program_id: scope.programId,
  });
  return (data ?? []) as RosterIdRow[];
}

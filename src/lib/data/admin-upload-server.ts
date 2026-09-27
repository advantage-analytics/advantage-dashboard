import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type {
  Viewer,
  Workspace,
  WorkspaceContextValue,
} from "@/lib/workspace/types";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import {
  eligibleRosterOptions,
  type OwnProfileRow,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { RosterFullRow, RosterPlayerOption } from "./roster-shared";

/** Server-only through the server/admin imports, enforced by client-bundle-boundary.spec.ts. */
export interface AdminUploadContext {
  source: "admin";
  actorId: string;
  viewer: Viewer;
  /**
   * An admin capability projection for the shared wizard, NOT a membership.
   * Never put this in the dashboard switcher or use it to authorize a write:
   * every admin write must independently re-check the session and target.
   */
  workspace: Workspace;
  roster: RosterPlayerOption[];
  videoAllowance: {
    accountId: string;
    accountType: "program";
    billingMonth: string;
    usedSeconds: number;
    capSeconds: number;
    remainingSeconds: number;
  };
}

export type AdminUploadContextResult =
  | { ok: true; context: AdminUploadContext }
  | {
      ok: false;
      reason:
        | "admin-required"
        | "invalid-program-id"
        | "program-not-found"
        | "read-failed";
      message: string;
    };

interface Dependencies {
  requireAdmin: typeof requireAdmin;
  createAdminClient: () => SupabaseClient;
  getWorkspaceContext: () => Promise<WorkspaceContextValue | null>;
  now: () => Date;
}

interface Profile extends OwnProfileRow {
  archived_at: string | null;
}
interface Member {
  user_id: string;
  role: string;
  ladder_position: number | null;
}
interface UserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  class: string | null;
}

/** Read every page: PostgREST caps each response, including service reads. */
async function readAll<T>(query: {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>;
}): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await query.range(offset, offset + pageSize - 1);
    if (result.error) throw new Error("context read failed");
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/**
 * Mirrors E1's program_roster_full player and safety arms, plus the existing
 * eligibleRosterOptions own-profile exception. Archived non-merged profiles
 * still suppress the safety arm; otherwise an archived athlete reappears as
 * a login ID. Staff seats alone never become athlete choices.
 */
async function readRoster(
  admin: SupabaseClient,
  programId: string,
  actorId: string,
) {
  const [profilesResult, membersResult] = await Promise.all([
    readAll(
      admin
        .from("program_players")
        .select(
          "id, program_id, first_name, last_name, email, class_year, lineup_spot, claimed_by_user_id, archived_at",
        )
        .eq("program_id", programId)
        .is("merged_into_id", null)
        .order("id"),
    ),
    readAll(
      admin
        .from("program_members")
        .select("user_id, role, ladder_position")
        .eq("program_id", programId)
        .order("user_id"),
    ),
  ]);
  const profiles = profilesResult as Profile[];
  const members = membersResult as Member[];
  const ids = [
    ...new Set(
      [
        ...profiles.map((p) => p.claimed_by_user_id),
        ...members.map((m) => m.user_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const userRows: UserRow[] = [];
  // Bound the URL as well as the response when a large roster has login IDs.
  for (let offset = 0; offset < ids.length; offset += 200) {
    userRows.push(
      ...(await readAll<UserRow>(
        admin
          .from("users")
          .select("id, first_name, last_name, email, class")
          .in("id", ids.slice(offset, offset + 200))
          .order("id"),
      )),
    );
  }
  const users = new Map(userRows.map((u) => [u.id, u]));
  const seats = new Map(members.map((m) => [m.user_id, m]));
  const rows: RosterFullRow[] = profiles
    .filter((p) => {
      const role = p.claimed_by_user_id
        ? seats.get(p.claimed_by_user_id)?.role
        : undefined;
      return p.archived_at === null && (!role || role === "player");
    })
    .map((p) => {
      const user = p.claimed_by_user_id
        ? users.get(p.claimed_by_user_id)
        : undefined;
      return {
        player_id: p.id,
        user_id: p.claimed_by_user_id,
        display_name: `${p.first_name} ${p.last_name}`.trim(),
        email: p.email ?? user?.email ?? null,
        role: "player",
        class_year: p.class_year ?? user?.class ?? null,
        lineup_spot: p.lineup_spot,
        managed_by: p.claimed_by_user_id ? "self" : "coach",
      };
    });
  for (const member of members) {
    const user = users.get(member.user_id);
    if (
      member.role !== "player" ||
      !user ||
      profiles.some((p) => p.claimed_by_user_id === member.user_id)
    )
      continue;
    rows.push({
      player_id: member.user_id,
      user_id: member.user_id,
      display_name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
      email: user.email,
      role: "player",
      class_year: user.class,
      lineup_spot: member.ladder_position,
      managed_by: "self",
    });
  }
  return eligibleRosterOptions(
    rows,
    profiles.find(
      (p) => p.archived_at === null && p.claimed_by_user_id === actorId,
    ),
    programId,
    actorId,
  );
}

/**
 * Resolve a target independently of the active-workspace cookie. Authorization
 * precedes service-client creation, including for malformed IDs. Read failures
 * refuse the whole context, never invent an empty roster or unused allowance.
 * The dependency seam exists only for focused keyless authorization tests.
 *
 * `cache()`d because `/admin/uploads/new` resolves this for the page and again
 * inside `loadAdminTournamentAction` in the same request — without memoizing,
 * that is a second `programs` read and roster/usage sweep for an identical
 * answer. Keyed on the arguments, so the test seam's explicit `deps` never
 * shares a result with the default call, and per-request: a server action that
 * writes and then needs fresh roster or usage runs in a request of its own.
 */
export const getAdminUploadContext = cache(
  async (
    programId: string,
    deps: Dependencies = {
      requireAdmin,
      createAdminClient,
      getWorkspaceContext,
      now: () => new Date(),
    },
  ): Promise<AdminUploadContextResult> => {
    const actor = await deps.requireAdmin();
    if (!actor)
      return {
        ok: false,
        reason: "admin-required",
        message: "Administrator access is required.",
      };
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        programId,
      )
    ) {
      return {
        ok: false,
        reason: "invalid-program-id",
        message: "Choose a valid program.",
      };
    }
    try {
      const session = await deps.getWorkspaceContext();
      if (!session || session.viewer.id !== actor.id)
        return {
          ok: false,
          reason: "admin-required",
          message: "Administrator access is required.",
        };
      const admin = deps.createAdminClient();
      const program = await admin
        .from("programs")
        .select(
          "id, school_name, team, status, players_can_upload, upload_policy, events_policy, org_type, time_zone",
        )
        .eq("id", programId)
        .maybeSingle();
      if (program.error) throw new Error("program read failed");
      if (!program.data)
        return {
          ok: false,
          reason: "program-not-found",
          message: "That program no longer exists.",
        };
      const p = program.data;
      const workspace: Workspace = {
        id: p.id,
        kind: "team",
        name: p.school_name,
        team: p.team,
        orgType: p.org_type,
        timeZone: p.time_zone,
        programStatus: p.status,
        canSubmitVideo: p.status === "active",
        playersCanUpload: p.players_can_upload,
        uploadPolicy: p.upload_policy,
        eventsPolicy: p.events_policy,
        role: "owner",
        memberUploadEnabled: true,
        myPlayerId: null,
        mark: p.school_name.trim().charAt(0).toUpperCase(),
        iconUrl: null,
      };
      const billingMonth = currentBillingMonth(deps.now());
      const [roster, usage] = await Promise.all([
        readRoster(admin, programId, actor.id),
        readAll(
          admin
            .from("processing_usage")
            .select("actual_seconds, reserved_seconds")
            .eq("account_id", programId)
            .eq("account_type", "program")
            .eq("billing_month", billingMonth)
            .eq("released", false)
            .order("id"),
        ),
      ]);
      const usedSeconds = usage.reduce(
        (sum, row) =>
          sum + Number(row.actual_seconds ?? row.reserved_seconds ?? 0),
        0,
      );
      const capSeconds = monthlyCapSecondsFor(workspace);
      return {
        ok: true,
        context: {
          source: "admin",
          actorId: actor.id,
          viewer: session.viewer,
          workspace,
          roster,
          videoAllowance: {
            accountId: programId,
            accountType: "program",
            billingMonth,
            usedSeconds,
            capSeconds,
            remainingSeconds: Math.max(0, capSeconds - usedSeconds),
          },
        },
      };
    } catch {
      return {
        ok: false,
        reason: "read-failed",
        message: "We couldn't load this program's upload context. Try again.",
      };
    }
  },
);

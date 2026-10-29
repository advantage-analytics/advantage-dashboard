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
import {
  monthlyCapSecondsFor,
  peekQuota,
} from "@/lib/services/splitstep/quota";
import { getInitials } from "@/lib/data/match-utils";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import { UNLIMITED_CAP_SECONDS } from "@/lib/data/usage-format";
import type { AdminUploadBilling } from "@/lib/admin/uploads/types";
import {
  eligibleRosterOptions,
  type OwnProfileRow,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { RosterFullRow, RosterPlayerOption } from "./roster-shared";
import { readAllPages } from "./admin-range-read";
import { UUID_RE } from "@/lib/admin/validation";
import { adminCanUploadFor } from "@/lib/admin/uploads/approval";

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
  /**
   * Set only when the target is a player's PERSONAL workspace
   * (`workspace.kind === "personal"`, `workspace.id` = the player's user id);
   * null for a team. The wizard treats `owner.viewer` as the person the
   * personal match belongs to; the administrator stays `viewer`/`actorId`.
   */
  owner: AdminUploadOwner | null;
  /**
   * What this upload spends. A team's program ledger; for a personal target
   * either the administrator's own uncapped account (`billing: "free"`) or the
   * player's free hours plus credits (`"player"`), already summed into
   * `remainingSeconds`.
   */
  videoAllowance: {
    accountId: string;
    accountType: "program" | "individual";
    billingMonth: string;
    usedSeconds: number;
    capSeconds: number;
    remainingSeconds: number;
  };
}

export interface AdminUploadOwner {
  /** A display projection of the player, never a session. */
  viewer: Viewer;
  hand: string | null;
  backhand: string | null;
  billing: AdminUploadBilling;
  /**
   * The player's own allowance this month, whichever billing is chosen — the
   * toggle quotes it beside "Player's allowance". `remainingSeconds` is free
   * hours left plus usable credits; their hours override already applied.
   */
  playerAllowance: {
    usedSeconds: number;
    capSeconds: number;
    creditSeconds: number;
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
        | "player-not-found"
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
    readAllPages(
      admin
        .from("program_players")
        .select(
          "id, program_id, first_name, last_name, email, class_year, lineup_spot, claimed_by_user_id, archived_at",
        )
        .eq("program_id", programId)
        .is("merged_into_id", null)
        .order("id"),
      "context read failed",
    ),
    readAllPages(
      admin
        .from("program_members")
        .select("user_id, role, ladder_position")
        .eq("program_id", programId)
        .order("user_id"),
      "context read failed",
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
  // Bound the URL as well as the response when a large roster has login IDs.
  // Each chunk is independent, so every chunk's page-through runs concurrently.
  const idChunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 200)
    idChunks.push(ids.slice(offset, offset + 200));
  const userRows = (
    await Promise.all(
      idChunks.map((chunk) =>
        readAllPages<UserRow>(
          admin
            .from("users")
            .select("id, first_name, last_name, email, class")
            .in("id", chunk)
            .order("id"),
          "context read failed",
        ),
      ),
    )
  ).flat();
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
    if (!UUID_RE.test(programId)) {
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
          "id, school_name, team, status, players_can_upload, upload_policy, events_policy, org_type, pilot_eligible, time_zone",
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
        pilotEligible: p.pilot_eligible === true,
        timeZone: p.time_zone,
        programStatus: p.status,
        // Not the dashboard's rule: the console uploads for teams that are not
        // approved yet. See `adminCanUploadFor()`.
        canSubmitVideo: adminCanUploadFor(p.status),
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
        readAllPages(
          admin
            .from("processing_usage")
            .select("actual_seconds, reserved_seconds")
            .eq("account_id", programId)
            .eq("account_type", "program")
            .eq("billing_month", billingMonth)
            .eq("released", false)
            .order("id"),
          "context read failed",
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
          owner: null,
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

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_path: string | null;
  hand: string | null;
  backhand: string | null;
  individual_pilot: boolean | null;
  is_admin: boolean | null;
  video_hours_override: number | string | null;
}

/**
 * A player's PERSONAL workspace as a console upload target — the sibling of
 * `getAdminUploadContext()` for "Upload for: a player". Same guard order:
 * the session must be an administrator before any service-role read, and a
 * failed read refuses the whole context rather than inventing an allowance.
 *
 * `billing` is the administrator's choice and shapes only the projection the
 * wizard reads (`videoAllowance`, `workspace.unlimitedVideo`). What is spent
 * is decided again by `admin_reserve_video_quota` from the billing stored on
 * the submission, never from this.
 */
export const getAdminPersonalUploadContext = cache(
  async (
    userId: string,
    billing: AdminUploadBilling,
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
    if (!UUID_RE.test(userId) || (billing !== "free" && billing !== "player"))
      return {
        ok: false,
        reason: "invalid-program-id",
        message: "Choose a valid player.",
      };
    try {
      const session = await deps.getWorkspaceContext();
      if (!session || session.viewer.id !== actor.id)
        return {
          ok: false,
          reason: "admin-required",
          message: "Administrator access is required.",
        };
      const admin = deps.createAdminClient();
      const read = await admin
        .from("users")
        .select(
          "id, first_name, last_name, email, avatar_path, hand, backhand, individual_pilot, is_admin, video_hours_override",
        )
        .eq("id", userId)
        .maybeSingle();
      if (read.error) throw new Error("player read failed");
      const row = read.data as PlayerRow | null;
      if (!row)
        return {
          ok: false,
          reason: "player-not-found",
          message: "That player no longer exists.",
        };
      const email = row.email ?? "";
      const localPart = email.split("@")[0] ?? "";
      // The fallback `admin_submit_match_video` records: names, else the
      // email's local part. With neither it refuses, so this does too.
      const name =
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        localPart;
      if (!name)
        return {
          ok: false,
          reason: "player-not-found",
          message:
            "This player has no name or email to record the match under.",
        };
      const initials = getInitials(name) || localPart.slice(0, 2).toUpperCase();
      const avatarUrl = row.avatar_path
        ? admin.storage.from(USER_AVATARS_BUCKET).getPublicUrl(row.avatar_path)
            .data.publicUrl
        : null;
      const override =
        row.video_hours_override == null
          ? null
          : Number(row.video_hours_override);
      // The player's own workspace exactly as the dashboard builds it, so the
      // cap and the peek are the figures the player would see themselves.
      const own: Workspace = {
        id: row.id,
        kind: "personal",
        name: "Personal",
        team: null,
        orgType: null,
        timeZone: "UTC",
        role: "owner",
        mark: initials,
        iconUrl: avatarUrl,
        canSubmitVideo: true,
        individualPilot: row.individual_pilot === true,
        unlimitedVideo: row.is_admin === true,
        videoHoursOverride: Number.isFinite(override) ? override : null,
        programStatus: null,
        playersCanUpload: false,
        uploadPolicy: "everyone",
        eventsPolicy: "staff",
        memberUploadEnabled: true,
        myPlayerId: null,
      };
      const peek = await peekQuota(admin, own);
      const playerAllowance = {
        usedSeconds: peek.usedSeconds,
        capSeconds: peek.capSeconds,
        creditSeconds: peek.creditSeconds,
        remainingSeconds: peek.remainingSeconds,
      };
      // Free: nothing of the player's is spent, so the wizard sees an
      // uncapped workspace and never asks the player's allowance.
      const workspace: Workspace =
        billing === "free"
          ? { ...own, unlimitedVideo: true, videoHoursOverride: null }
          : own;
      const billingMonth = currentBillingMonth(deps.now());
      return {
        ok: true,
        context: {
          source: "admin",
          actorId: actor.id,
          viewer: session.viewer,
          workspace,
          roster: [],
          owner: {
            viewer: {
              ...session.viewer,
              id: row.id,
              email,
              name,
              firstName: row.first_name?.trim() || null,
              initials,
              avatarUrl,
            },
            hand: row.hand,
            backhand: row.backhand,
            billing,
            playerAllowance,
          },
          videoAllowance:
            billing === "free"
              ? {
                  accountId: actor.id,
                  accountType: "individual",
                  billingMonth,
                  usedSeconds: 0,
                  capSeconds: UNLIMITED_CAP_SECONDS,
                  remainingSeconds: UNLIMITED_CAP_SECONDS,
                }
              : {
                  accountId: row.id,
                  accountType: "individual",
                  billingMonth,
                  ...playerAllowance,
                },
        },
      };
    } catch {
      return {
        ok: false,
        reason: "read-failed",
        message: "We couldn't load this player's upload context. Try again.",
      };
    }
  },
);

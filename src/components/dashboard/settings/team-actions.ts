"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { generateToken, hashToken, INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * The writes Settings › Team performs.
 *
 * Every one goes through a SECURITY DEFINER function that checks
 * `is_program_staff` itself, so authorization is asked once, in SQL, where the
 * row is. Repeating the check here would be a second answer that can drift
 * from the first — and the first is the one that actually stops the write.
 *
 * The raw invite token is minted here and never returned. Only its hash goes to
 * the database, which is the same rule the claim flow follows: a database dump
 * must not be a set of working links into someone's program.
 *
 * None of these take a program id. Which program is being edited is server
 * state — a cookie-backed workspace the context already resolves — so accepting
 * it from the form meant every caller relaying a value back that the server was
 * about to look up anyway, and a parameter that had to be treated as untrusted
 * on arrival. `revokeInvite` never took one; the rest now match it.
 */

const SETTINGS_PATH = "/dashboard/settings/team";

/** The program the caller is currently in, or null if they are not in one. */
async function activeProgramId(): Promise<string | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") return null;
  return workspace.active.id;
}

const NOT_IN_PROGRAM = "Switch to your team workspace to change it.";

/** Postgres RAISE messages are written for people; pass them straight through. */
function toMessage(error: { message: string } | null, fallback: string): string {
  const raw = error?.message?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

export interface TeamSettingsInput {
  schoolName: string;
  team: "mens" | "womens";
  conference: string;
  homeVenue: string;
  defaultSurface: string | null;
  season: string;
  rosterVisible: boolean;
  playersCanUpload: boolean;
}

export async function saveTeamSettings(
  input: TeamSettingsInput
): Promise<ActionResult> {
  const programId = await activeProgramId();
  if (!programId) return { ok: false, error: NOT_IN_PROGRAM };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_program_settings", {
    p_program_id: programId,
    p_school_name: input.schoolName,
    p_team: input.team,
    p_conference: input.conference,
    p_home_venue: input.homeVenue,
    p_default_surface: input.defaultSurface,
    p_season: input.season,
    p_roster_visible: input.rosterVisible,
    p_players_can_upload: input.playersCanUpload,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't save team settings.") };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Record an invitation.
 *
 * `create_program_invite` upserts on the one-open-invite index, so inviting an
 * address that already has an outstanding invite refreshes it rather than
 * minting a second working token — which is also what makes "Resend" this same
 * call rather than a third code path.
 */
export async function inviteMember(input: {
  email: string;
  role: MemberRole;
}): Promise<ActionResult> {
  const programId = await activeProgramId();
  if (!programId) return { ok: false, error: NOT_IN_PROGRAM };

  const supabase = await createClient();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: programId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hashToken(generateToken()),
    p_expires_at: expiresAt,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't send that invite.") };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_program_invite", {
    p_invite_id: inviteId,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't withdraw that invite.") };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const programId = await activeProgramId();
  if (!programId) return { ok: false, error: NOT_IN_PROGRAM };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_program_member", {
    p_program_id: programId,
    p_user_id: userId,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't remove that member.") };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

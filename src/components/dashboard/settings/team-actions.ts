"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
 */

const SETTINGS_PATH = "/dashboard/settings/team";

/** Postgres RAISE messages are written for people; pass them straight through. */
function toMessage(error: { message: string } | null, fallback: string): string {
  const raw = error?.message?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

export interface TeamSettingsInput {
  programId: string;
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
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_program_settings", {
    p_program_id: input.programId,
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
  programId: string;
  email: string;
  role: MemberRole;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: input.programId,
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

export async function removeMember(input: {
  programId: string;
  userId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_program_member", {
    p_program_id: input.programId,
    p_user_id: input.userId,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't remove that member.") };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

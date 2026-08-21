"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { generateToken, hashToken, INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";
import { programInviteEmail, sendEmail } from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type { MemberRole } from "@/lib/data/team-settings-server";
import type { Workspace } from "@/lib/workspace/types";

/**
 * The writes Settings › Team performs.
 *
 * Every one goes through a SECURITY DEFINER function that checks
 * `is_program_staff` itself, so authorization is asked once, in SQL, where the
 * row is. Repeating the check here would be a second answer that can drift
 * from the first — and the first is the one that actually stops the write.
 *
 * The raw invite token is minted here and goes to exactly one place: the email.
 * Only its hash reaches the database, which is the same rule the claim flow
 * follows — a database dump must not be a set of working links into someone's
 * program. It is never returned to the caller either, because the caller is a
 * client component and a token that reaches the browser has been handed to
 * whoever is looking at the screen rather than to the person invited.
 *
 * None of these take a program id. Which program is being edited is server
 * state — a cookie-backed workspace the context already resolves — so accepting
 * it from the form meant every caller relaying a value back that the server was
 * about to look up anyway, and a parameter that had to be treated as untrusted
 * on arrival. `revokeInvite` never took one; the rest now match it.
 */

const SETTINGS_PATH = "/dashboard/settings/team";
const TEAM_HOME_PATH = "/dashboard/team";

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

/**
 * Every standing that can be handed out by invitation.
 *
 * `owner` is excluded here because it is excluded by
 * `program_invites_role_check` — ownership moves by transfer, never by
 * invitation, and a program with two owners has no answer to "who decides".
 * The RPC raises on it, so this is the same rule stated where a caller can see
 * it before shipping rather than after.
 */
type InvitableRole = Exclude<MemberRole, "owner">;

/**
 * What to call this program in an email.
 *
 * `Workspace.name` is the school on its own, because the switcher shows the
 * squad beside it on its own line. Mail has no such context, so it goes through
 * the shared name — see `programDisplayName`, which the join screen uses too so
 * the invitation and the page it opens agree on what the program is called.
 */
function programLabel(workspace: Workspace): string {
  return programDisplayName(workspace.name, workspace.team);
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
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * Record an invitation, and send it.
 *
 * `create_program_invite` upserts on the one-open-invite index, so inviting an
 * address that already has an outstanding invite refreshes it rather than
 * minting a second working token — which is also what makes "Resend" this same
 * call rather than a third code path. That upsert is what makes a failed send
 * recoverable: pressing invite again mints a fresh token and tries again,
 * rather than leaving a dead row behind a live one.
 *
 * ── Why a failed send is not a failed invite ────────────────────────────────
 * The row is written before the mail goes out and is NOT rolled back when the
 * mail fails. The row is the source of truth — it is what the roster screen
 * lists, what acceptance looks up, and what resend refreshes — so discarding
 * it because a third-party API was briefly unreachable would throw away the
 * durable half of the work to tidy up after the fragile half.
 *
 * What must not happen is a green tick over an email that never left. Hence
 * the third outcome: `ok: true` with a warning, meaning the invite exists and
 * the coach has to press resend.
 */
export type InviteResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

export async function inviteMember(input: {
  email: string;
  role: InvitableRole;
}): Promise<InviteResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: NOT_IN_PROGRAM };
  }

  const { active, viewer } = workspace;
  const supabase = await createClient();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  );

  // Minted here and held, rather than inlined into the hash as it used to be.
  // `hashToken(generateToken())` discarded the only copy of the token in the
  // same expression that created it, so the row was unopenable by anyone —
  // there was no acceptance path, because there was nothing to accept with.
  const token = generateToken();

  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: active.id,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't send that invite.") };
  }

  // Normalised the same way the RPC normalises it, so the address printed in
  // the mail is the address acceptance will compare against.
  const sent = await sendEmail(
    programInviteEmail({
      to: input.email.trim().toLowerCase(),
      programName: programLabel(active),
      inviterName: viewer.name,
      role: input.role,
      token,
      expiresAt,
    })
  );

  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);

  if (!sent.ok) {
    return {
      ok: true,
      warning: `${sent.error} The invite is saved — press resend to try again.`,
    };
  }

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
  revalidatePath(TEAM_HOME_PATH);
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
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * Flip one permission without opening the settings page.
 *
 * The invite dialog states this rule at the moment it becomes true for
 * somebody — "off, their matches still appear when you send them" — so the
 * switch beside that sentence has to be the real permission, not a copy of it
 * that Settings could contradict an hour later.
 *
 * It re-reads the row and writes it back through the same RPC rather than
 * patching one column, because `update_program_settings` is where the staff
 * check lives. The read is the program's own row, which staff may read; the
 * write is refused in SQL if they may not.
 */
export async function setPlayersCanUpload(
  next: boolean
): Promise<ActionResult> {
  const programId = await activeProgramId();
  if (!programId) return { ok: false, error: NOT_IN_PROGRAM };

  const supabase = await createClient();
  const { data: program, error: readError } = await supabase
    .from("programs")
    .select(
      "school_name, team, conference, home_venue, default_surface, season, roster_visible"
    )
    .eq("id", programId)
    .maybeSingle();

  if (readError || !program) {
    return { ok: false, error: "Couldn't read the program's settings." };
  }

  const { error } = await supabase.rpc("update_program_settings", {
    p_program_id: programId,
    p_school_name: program.school_name,
    p_team: program.team,
    p_conference: program.conference ?? "",
    p_home_venue: program.home_venue ?? "",
    p_default_surface: program.default_surface,
    p_season: program.season ?? "",
    p_roster_visible: program.roster_visible,
    p_players_can_upload: next,
  });

  if (error) {
    return {
      ok: false,
      error: toMessage(error, "Couldn't change that permission."),
    };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  generateToken,
  hashToken,
  INVITE_TTL_HOURS,
} from "@/lib/services/programs/tokens";
import {
  ownershipTransferredEmail,
  programInviteEmail,
  sendEmail,
} from "@/lib/services/email";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import { programDisplayName } from "@/lib/data/programs-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type { MemberRole } from "@/lib/data/team-settings-server";
import type {
  EventsPolicy,
  UploadPolicy,
  Viewer,
  Workspace,
} from "@/lib/workspace/types";

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
 * ── Which program ───────────────────────────────────────────────────────────
 * The roster's actions (`inviteMember`, `removeMember`, `setPlayersCanUpload`)
 * take no program id: the roster is a page of the ACTIVE workspace, so the
 * program is server state the context already resolves. Settings › Teams is
 * not — it shows every program the viewer belongs to, so its actions carry the
 * id. It is checked against `available` on arrival (a forged id becomes a
 * clean refusal rather than a PostgREST error string, and the match yields
 * the `Workspace` the email needs) and then again, for real, in SQL.
 */

const SETTINGS_PATH = "/dashboard/settings/teams";
const TEAM_HOME_PATH = "/dashboard/team";
const ROSTER_PATH = "/dashboard/team/roster";

/** Settings › Teams and every program page beneath it. */
function revalidateTeams(): void {
  revalidatePath(SETTINGS_PATH, "layout");
  revalidatePath(TEAM_HOME_PATH);
}

/** The program the caller is currently in, or null if they are not in one. */
async function activeProgramId(): Promise<string | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") return null;
  return workspace.active.id;
}

const NOT_IN_PROGRAM = "Switch to your team workspace to change it.";
const NOT_A_MEMBER = "You're not on that program.";

/**
 * The team workspace a Settings › Teams action names, if the viewer belongs
 * to it. Null is a refusal: an id that is not in `available` is not one this
 * person may act on, whatever the RPC would go on to say.
 */
async function memberWorkspace(
  programId: string,
): Promise<{ program: Workspace; viewer: Viewer } | null> {
  const context = await getWorkspaceContext();
  if (!context) return null;
  const program = context.available.find(
    (workspace) => workspace.kind === "team" && workspace.id === programId,
  );
  return program ? { program, viewer: context.viewer } : null;
}

/** Postgres RAISE messages are written for people; pass them straight through. */
function toMessage(
  error: { message: string } | null,
  fallback: string,
): string {
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
  /** The whole ladder; `players_can_upload` is derived from it in SQL. */
  uploadPolicy: UploadPolicy;
  /** Owner-only to change; the RPC refuses anyone else in words. */
  eventsPolicy: EventsPolicy;
}

/**
 * One save for identity and policy — they are one row in `programs`.
 *
 * The RPC is where the rules live: any staff may change venue, surface and
 * season; only the owner may change name, squad or conference, and it says so
 * in words the form can show. `/dashboard` is revalidated as a layout because
 * a rename changes the switcher's label, which lives nowhere under settings.
 */
export async function saveTeamSettings(
  input: TeamSettingsInput & { programId: string },
): Promise<ActionResult> {
  const member = await memberWorkspace(input.programId);
  if (!member) return { ok: false, error: NOT_A_MEMBER };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_program_settings", {
    p_program_id: input.programId,
    p_school_name: input.schoolName,
    p_team: input.team,
    p_conference: input.conference,
    p_home_venue: input.homeVenue,
    p_default_surface: input.defaultSurface,
    p_season: input.season,
    p_players_can_upload: input.uploadPolicy === "everyone",
    p_upload_policy: input.uploadPolicy,
    p_events_policy: input.eventsPolicy,
  });

  if (error) {
    return {
      ok: false,
      error: toMessage(error, "Couldn't save team settings."),
    };
  }

  revalidateTeams();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Change one member's standing. Immediate — a role is not part of the
 * identity draft, and a coach who has just been promoted should not be
 * waiting on a Save button two cards down.
 *
 * The RPC holds every rule (owner sets anyone but themselves; a coach moves
 * people between staff and player only; `owner` is never assignable; nobody
 * edits their own row) and says each refusal in words the card shows.
 */
export async function setProgramMemberRole(input: {
  programId: string;
  userId: string;
  role: Exclude<MemberRole, "owner">;
}): Promise<ActionResult> {
  const member = await memberWorkspace(input.programId);
  if (!member) return { ok: false, error: NOT_A_MEMBER };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_program_member_role", {
    p_program_id: input.programId,
    p_user_id: input.userId,
    p_role: input.role,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't change that role.") };
  }

  revalidateTeams();
  revalidatePath(ROSTER_PATH);
  // Their `Workspace.role` changed, and with it every staff gate they see.
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export type TransferResult =
  { ok: true; warning?: string } | { ok: false; error: string };

/**
 * Hand the program to a coach or staff member. The caller stays on as a coach.
 *
 * `transfer_program_ownership` is the authority — it refuses a non-owner, a
 * player, a stranger and the caller themselves, and moves both the member
 * rows and `programs.owner_user_id` under one lock. The email is a courtesy
 * sent afterwards, the same shape as an invite: the row is the truth, a
 * failed send is a warning, never a failed transfer. The recipient's address
 * is read from the roster here, never taken from the form.
 *
 * `/dashboard` as a layout: the caller's `Workspace.role` just changed, and
 * that drives every `isProgramStaff(active)` gate in the product.
 */
export async function transferProgramOwnership(input: {
  programId: string;
  newOwnerUserId: string;
}): Promise<TransferResult> {
  const member = await memberWorkspace(input.programId);
  if (!member) return { ok: false, error: NOT_A_MEMBER };
  if (member.program.role !== "owner") {
    return { ok: false, error: "Only the owner can transfer this program." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_program_ownership", {
    p_program_id: input.programId,
    p_new_owner: input.newOwnerUserId,
  });

  if (error) {
    return {
      ok: false,
      error: toMessage(error, "Couldn't transfer ownership."),
    };
  }

  revalidateTeams();
  revalidatePath(ROSTER_PATH);
  revalidatePath("/dashboard", "layout");

  const { data: roster } = await supabase.rpc("program_roster", {
    p_program_id: input.programId,
  });
  const recipient = (
    (roster ?? []) as {
      user_id: string;
      display_name: string | null;
      email: string;
    }[]
  ).find((row) => row.user_id === input.newOwnerUserId);

  if (!recipient) {
    return {
      ok: true,
      warning: "Ownership moved, but we couldn't find an address to notify.",
    };
  }

  const sent = await sendEmail(
    ownershipTransferredEmail({
      to: recipient.email,
      recipientName: recipient.display_name,
      programName: programLabel(member.program),
      programId: input.programId,
      previousOwnerName: member.viewer.name,
    }),
  );

  if (!sent.ok) {
    const reason = sent.error.replace(/\.$/, "");
    return {
      ok: true,
      warning: `Ownership moved, but we couldn't email ${recipient.display_name ?? recipient.email} (${reason}). Let them know yourself.`,
    };
  }

  return { ok: true };
}

const CREST_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** The bucket's own limit, restated so the refusal is a sentence, not a 413. */
const CREST_MAX_BYTES = 524_288;

/**
 * Replace the program's crest.
 *
 * A `FormData` action because the input is a file. Validated here first — the
 * bucket's `allowed_mime_types` and `file_size_limit` are the second fence,
 * not the first. The key carries a stamp rather than reusing `crest.png`: a
 * fixed key behind the CDN shows the old image for the cache's lifetime, and
 * a png→svg swap would orphan the old object. So: upload the new one, point
 * the row at it, then remove whatever it replaced.
 */
export async function uploadProgramCrest(
  formData: FormData,
): Promise<ActionResult> {
  const programId = String(formData.get("programId") ?? "");
  const file = formData.get("file");

  const member = await memberWorkspace(programId);
  if (!member) return { ok: false, error: NOT_A_MEMBER };
  if (member.program.role === "player") {
    return {
      ok: false,
      error: "Only the coaching staff can change the crest.",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image first." };
  }
  const ext = CREST_TYPES[file.type];
  if (!ext) {
    return { ok: false, error: "Use a PNG, JPG, WebP or SVG." };
  }
  if (file.size > CREST_MAX_BYTES) {
    return { ok: false, error: "Keep the crest under 512 KB." };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("programs")
    .select("crest_path")
    .eq("id", programId)
    .maybeSingle();
  const previous = (current?.crest_path as string | null | undefined) ?? null;

  const path = `${programId}/crest-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PROGRAM_CRESTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return {
      ok: false,
      error: `Couldn't upload the crest: ${uploadError.message}`,
    };
  }

  const { error } = await supabase.rpc("set_program_crest", {
    p_program_id: programId,
    p_crest_path: path,
  });

  if (error) {
    // The object is up but the row does not point at it. Take it back down so
    // a failed save does not leave a stray file under the program's prefix.
    await supabase.storage.from(PROGRAM_CRESTS_BUCKET).remove([path]);
    return { ok: false, error: toMessage(error, "Couldn't save the crest.") };
  }

  if (previous && previous !== path) {
    await supabase.storage.from(PROGRAM_CRESTS_BUCKET).remove([previous]);
  }

  revalidateTeams();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Back to the initials mark. Row first, then the object it pointed at. */
export async function removeProgramCrest(
  programId: string,
): Promise<ActionResult> {
  const member = await memberWorkspace(programId);
  if (!member) return { ok: false, error: NOT_A_MEMBER };
  if (member.program.role === "player") {
    return {
      ok: false,
      error: "Only the coaching staff can change the crest.",
    };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("programs")
    .select("crest_path")
    .eq("id", programId)
    .maybeSingle();
  const previous = (current?.crest_path as string | null | undefined) ?? null;

  const { error } = await supabase.rpc("set_program_crest", {
    p_program_id: programId,
    p_crest_path: null,
  });
  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't remove the crest.") };
  }

  if (previous) {
    await supabase.storage.from(PROGRAM_CRESTS_BUCKET).remove([previous]);
  }

  revalidateTeams();
  revalidatePath("/dashboard", "layout");
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
  | {
      ok: false;
      error: string;
      /**
       * The duplicate tripwire fired: this address already belongs to a
       * coach-managed roster row, and `create_program_invite` refused rather
       * than minting a second profile for the same athlete. Carrying the id
       * back lets the dialog reopen with that row selected instead of asking
       * the coach to find it — the refusal becomes the next step.
       */
      linkTo?: { profileId: string };
    };

export async function inviteMember(input: {
  email: string;
  role: InvitableRole;
  /**
   * The roster row this invitation binds a login to. Undefined or null is
   * "someone new" — acceptance mints a profile instead of claiming one.
   */
  playerId?: string | null;
}): Promise<InviteResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: NOT_IN_PROGRAM };
  }

  const { active, viewer } = workspace;
  const supabase = await createClient();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  // Minted here and held, rather than inlined into the hash as it used to be.
  // `hashToken(generateToken())` discarded the only copy of the token in the
  // same expression that created it, so the row was unopenable by anyone —
  // there was no acceptance path, because there was nothing to accept with.
  const token = generateToken();

  // Six keys, always — including an explicit null. PostgREST resolves an
  // overload by the set of parameter NAMES in the body, so this reaches the
  // targeting form every time and the five-argument wrapper exists only for a
  // deployed build that has not caught up yet.
  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: active.id,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt.toISOString(),
    p_player_id: input.playerId ?? null,
  });

  if (error) {
    // The tripwire refusal is not a dead end — it names the row this invitation
    // should have been attached to. `hint` and `detail` both survive PostgREST.
    const linkTo =
      error.hint === "link_player" && error.details
        ? { profileId: String(error.details) }
        : undefined;
    return {
      ok: false,
      error: toMessage(error, "Couldn't send that invite."),
      ...(linkTo ? { linkTo } : {}),
    };
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
    }),
  );

  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  revalidatePath(ROSTER_PATH);

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
    return {
      ok: false,
      error: toMessage(error, "Couldn't revoke that invite."),
    };
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
    return {
      ok: false,
      error: toMessage(error, "Couldn't remove that member."),
    };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * Flip one permission without opening the settings page.
 *
 * The Roster page's invite dialog states this rule at the moment it becomes
 * true for somebody — "off, their matches still appear when you send them" — so
 * the switch beside that sentence has to be the real permission, not a copy of
 * it that Settings could contradict an hour later.
 *
 * It re-reads the row and writes it back through the same RPC rather than
 * patching one column, because `update_program_settings` is where the
 * permission check lives — staff to read the row, but owner-only
 * (`upload_policy_owner_only`) once the resolved policy actually changes.
 * The dialog only calls this when `canChangeUploadPolicy` is true, so a
 * non-owner never reaches the write the RPC would refuse.
 */
export async function setPlayersCanUpload(
  next: boolean,
): Promise<ActionResult> {
  const programId = await activeProgramId();
  if (!programId) return { ok: false, error: NOT_IN_PROGRAM };

  const supabase = await createClient();
  const { data: program, error: readError } = await supabase
    .from("programs")
    .select(
      "school_name, team, conference, home_venue, default_surface, season",
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
  // The Roster page prints this rule in its own footer line, and the dialog
  // that flips it lives on that page — without this the sentence under the
  // table contradicts the switch the coach just moved.
  revalidatePath(ROSTER_PATH);
  return { ok: true };
}

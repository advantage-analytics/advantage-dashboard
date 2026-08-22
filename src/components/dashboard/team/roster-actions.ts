"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import type { ActionResult } from "@/components/dashboard/settings/actions";

/**
 * The writes the Roster page performs that Settings › Team does not.
 *
 * Invite, resend, revoke and remove already exist in `settings/team-actions.ts`
 * and are imported from there rather than copied. Two implementations of
 * "revoke an invitation" is how one of them quietly stops revalidating the page
 * the other one revalidates.
 *
 * What belongs here is everything about a PLAYER PROFILE — the roster row that
 * needs no account. Settings › Team is a list of seats and has no opinion about
 * a freshman who has never signed in.
 *
 * `set_member_upload_enabled` has existed since the membership migration and
 * has never had a caller: there was no screen with a per-person control on it,
 * because there was no roster. This is that caller.
 */

const ROSTER_PATH = "/dashboard/team/roster";
const SETTINGS_PATH = "/dashboard/settings/team";
const TEAM_HOME_PATH = "/dashboard/team";

/**
 * Let one member spend the program's analysis budget, or stop them.
 *
 * Per-person, and deliberately not the same switch as the program-wide
 * "players can upload" default in settings. A coach wanting to hand the budget
 * to one senior without opening it to the whole squad is the ordinary case,
 * and a single program-level toggle cannot express it.
 *
 * No program id parameter. Which program is being edited is server state the
 * workspace context already resolves; accepting it from the form would mean
 * treating it as untrusted on arrival and re-checking it against exactly the
 * lookup happening here anyway.
 */
export async function setMemberUploadEnabled(
  userId: string,
  enabled: boolean
): Promise<ActionResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: "Switch to your team workspace to change it." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_upload_enabled", {
    p_program_id: workspace.active.id,
    p_user_id: userId,
    p_enabled: enabled,
  });

  if (error) {
    // The RPC raises 42501 for a non-staff caller, and its message is written
    // for a person. Pass it through rather than replacing it with a guess.
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't change that permission.",
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * Put a player on the roster now, without waiting for them to sign up.
 *
 * The counterpart to inviting. An invite sends email and waits; this creates
 * the row immediately, so a coach can record matches for a freshman who will
 * never open the app. No login, no seat — the seat starts counting only if the
 * profile is later claimed.
 *
 * Every guard lives in `add_program_player`: staff-only, both names required,
 * email shape, and the two duplicate checks that make the tripwire real. The
 * Postgres messages are written for people, so they pass straight through.
 */
/**
 * `ActionResult` plus the row that was created, so the caller can invite
 * against it in the same breath. 6c's "also send an invite to claim this
 * profile" needs the id, and re-reading the roster to find the row by name
 * would be a second query and a guess about which row it meant.
 */
export type AddPlayerResult =
  | { ok: true; profileId: string | null }
  | { ok: false; error: string };

export async function addProgramPlayer(input: {
  firstName: string;
  lastName: string;
  classYear?: string | null;
  lineupSpot?: number | null;
  email?: string | null;
}): Promise<AddPlayerResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: "Switch to your team workspace to add players." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_program_player", {
    p_program_id: workspace.active.id,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_class_year: input.classYear ?? null,
    p_lineup_spot: input.lineupSpot ?? null,
    p_email: input.email ?? null,
  });

  if (error) {
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't add that player.",
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true, profileId: typeof data === "string" ? data : null };
}

/**
 * Take a player off the roster.
 *
 * Archives rather than deletes, and the reason is in the SQL: `player1_id` has
 * no foreign key, so deleting the profile would leave every match this athlete
 * played pointing at nothing — the season would still exist and belong to
 * nobody. If the profile had been claimed, the RPC also releases its seat.
 *
 * Separate from `removeMember`, which takes a user id and can only act on
 * somebody who has an account. A coach-managed player has none.
 */
export async function archiveProgramPlayer(
  profileId: string
): Promise<ActionResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: "Switch to your team workspace to change it." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_program_player", {
    p_player_id: profileId,
  });

  if (error) {
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't remove that player.",
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * What a merge would do, straight from the database.
 *
 * The dialog's numbers come from here rather than from the client counting rows
 * it happens to be able to read. A coach approving "3 matches move" should be
 * approving what will actually happen.
 */
export interface MergePreview {
  matchesMoving: number;
  entriesMoving: number;
  invitesMoving: number;
  survivingName: string;
  absorbedName: string;
  survivingClaimed: boolean;
  absorbedClaimed: boolean;
  namesMatch: boolean;
}

export async function previewMerge(
  survivingId: string,
  absorbedId: string
): Promise<
  { ok: true; preview: MergePreview } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("preview_program_player_merge", {
      p_surviving_id: survivingId,
      p_absorbed_id: absorbedId,
    })
    .maybeSingle();

  if (error || !data) {
    const raw = error?.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't read those two profiles.",
    };
  }

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    preview: {
      matchesMoving: Number(row.matches_moving ?? 0),
      entriesMoving: Number(row.entries_moving ?? 0),
      invitesMoving: Number(row.invites_moving ?? 0),
      survivingName: String(row.surviving_name ?? ""),
      absorbedName: String(row.absorbed_name ?? ""),
      survivingClaimed: Boolean(row.surviving_claimed),
      absorbedClaimed: Boolean(row.absorbed_claimed),
      namesMatch: Boolean(row.names_match),
    },
  };
}

/**
 * Fold a duplicate roster row into the one that survives.
 *
 * The repair tool, and the only thing in this feature that writes to existing
 * match rows. Every guard is in `merge_program_players`: staff only, both names
 * must match, the operator must type the name, and it refuses outright when
 * both rows have accounts. There is no undo — the audit row records the match
 * ids so a mistake can be put right by hand, but not by a button.
 *
 * `revalidatePath` is the whole of "stats recompute once": every player-level
 * aggregate is computed at read time, and `match_stats` is keyed on the match,
 * never on a player. Nothing needs to re-run.
 */
export async function mergeProfiles(input: {
  survivingId: string;
  absorbedId: string;
  confirmName: string;
}): Promise<ActionResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return { ok: false, error: "Switch to your team workspace to merge." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_program_players", {
    p_surviving_id: input.survivingId,
    p_absorbed_id: input.absorbedId,
    p_confirm_name: input.confirmName,
  });

  if (error) {
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't merge those profiles.",
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(TEAM_HOME_PATH);
  revalidatePath("/dashboard/team/compare");
  return { ok: true };
}

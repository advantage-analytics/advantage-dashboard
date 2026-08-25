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
 * One `program_players` row, as the edit form needs it.
 *
 * The five editable columns and nothing else, already in the shapes the fields
 * hold them in — `""` for a column nobody has set, so the dialog does not
 * repeat the null handling five times.
 */
export interface PlayerFields {
  firstName: string;
  lastName: string;
  classYear: string;
  lineupSpot: string;
  email: string;
  /** A login is bound to this profile, so the address above is not their only one. */
  claimed: boolean;
}

interface DbPlayerFieldsRow {
  program_id: string;
  first_name: string;
  last_name: string;
  class_year: string | null;
  lineup_spot: number | null;
  email: string | null;
  claimed_by_user_id: string | null;
  archived_at: string | null;
  merged_into_id: string | null;
}

/**
 * `gone` is its own outcome, not a flavour of error: the dialog turns terminal
 * on it — no retry, no Save — because there is no longer a row to write to.
 */
export type PlayerFieldsResult =
  | { ok: true; fields: PlayerFields }
  | { ok: false; error: string; gone: boolean };

export type UpdatePlayerResult =
  | { ok: true }
  | { ok: false; error: string; gone: boolean };

/**
 * One sentence for a row that is not on this roster anymore, said the same way
 * whether it was already gone when the dialog opened or went while it was. What
 * to do about it belongs to the dialog, which knows which of the two happened.
 */
const GONE_MESSAGE = "This player is no longer on this roster.";

/**
 * The row's own five columns, read fresh for the edit form.
 *
 * **Not** derivable from the `RosterMember` the table already holds, and the
 * difference is not cosmetic. `program_roster_full` returns
 * `coalesce(pp.email, u.email)` and `coalesce(pp.class_year, u.class)`, so a
 * claimed player whose profile carries neither shows their *login* address and
 * their *own* class year on the roster. Seeding a form from that and saving it
 * copies both onto the profile — writing a personal login address into the
 * roster's email column, which is the field the duplicate tripwire and the
 * invite flow both key on. This reads `program_players` directly so an empty
 * column arrives empty.
 *
 * Every member of the program may select this row (the "Roster is visible to
 * program members" policy); only staff may write it, and that check lives in
 * `update_program_player`.
 */
export async function getProgramPlayerFields(
  profileId: string
): Promise<PlayerFieldsResult> {
  // Started together on purpose. The row read does not need the workspace — the
  // id is only used below, to check the row is on *this* roster — and
  // `getWorkspaceContext()` is itself an `auth.getUser()` plus two selects, so
  // awaiting it first put that whole chain in front of a read that could have
  // been in flight beside it. The coach watches a spinner for this on every
  // dialog open and every save. Reading in parallel exposes nothing: the row is
  // already RLS-scoped to program members, so a read the guard below would have
  // rejected could not have returned anything anyway.
  const supabase = await createClient();
  const [workspace, read] = await Promise.all([
    getWorkspaceContext(),
    supabase
      .from("program_players")
      .select(
        "program_id, first_name, last_name, class_year, lineup_spot, email, claimed_by_user_id, archived_at, merged_into_id"
      )
      .eq("id", profileId)
      .maybeSingle(),
  ]);

  if (!workspace || workspace.active.kind !== "team") {
    return {
      ok: false,
      error: "Switch to your team workspace to edit players.",
      gone: false,
    };
  }

  const { data, error } = read;

  if (error) {
    const raw = error.message?.trim();
    return {
      ok: false,
      error: raw && raw.length > 0 ? raw : "Couldn't read that player.",
      gone: false,
    };
  }

  const row = data as DbPlayerFieldsRow | null;
  // A coach may belong to two programs, so "readable" is not "on this roster".
  // Archived and merged rows are gone from this page's point of view as well.
  // `update_program_player` declines both of those since 20260825131815, but it
  // declines them by returning silently — refusing them here is what turns that
  // into a sentence the coach can read.
  if (
    !row ||
    row.program_id !== workspace.active.id ||
    row.archived_at !== null ||
    row.merged_into_id !== null
  ) {
    return { ok: false, error: GONE_MESSAGE, gone: true };
  }

  return {
    ok: true,
    fields: {
      firstName: row.first_name,
      lastName: row.last_name,
      classYear: row.class_year ?? "",
      lineupSpot: row.lineup_spot === null ? "" : String(row.lineup_spot),
      email: row.email ?? "",
      claimed: row.claimed_by_user_id !== null,
    },
  };
}

/**
 * Rewrite a roster row: name, class year, lineup spot, email.
 *
 * `update_program_player` overwrites all five columns on every call — its three
 * optional parameters default to NULL, so an argument left off does not mean
 * "leave it alone", it means "clear it". Every one of them is therefore passed
 * explicitly here, and the dialog holds all five in state whether or not the
 * coach touched them. Changing only the lineup spot must not silently drop the
 * class year and the email beside it.
 *
 * Guards that are the RPC's: staff-only, both names, the email shape. Its
 * messages are written for people and pass through.
 *
 * Archived rows are the database's guard now, not this file's. Migration
 * 20260825131815 added `archived_at is null` to the RPC's row lookup — the
 * three conditions `archive_program_player` had all along — so a write to
 * somebody who has left the program is refused at the one place every caller
 * comes through, including the ones that never run this code.
 *
 * The pre-flight read below is therefore defence in depth on that point, and
 * still the only guard on two others. It is what scopes the edit to the roster
 * on screen: the RPC reads the program off the row and checks staff against
 * that, so a coach who staffs two programs would otherwise edit the other
 * program's player through it, successfully, while looking at this one. And it
 * is the only thing that can say *why* a save did nothing — the RPC returns
 * silently on a row it cannot find, so without the read a vanished player would
 * close the dialog as a success instead of reaching `gone` and the terminal
 * "no longer on this roster" state.
 *
 * It is a check-then-act and not a lock: the row can still be archived in the
 * gap between the read and the RPC. What that race costs is now a success
 * message for a save that did nothing, rather than an invisible write to a row
 * that is off the roster.
 */
export async function updateProgramPlayer(input: {
  profileId: string;
  firstName: string;
  lastName: string;
  classYear: string | null;
  lineupSpot: number | null;
  email: string | null;
}): Promise<UpdatePlayerResult> {
  // Resolved here as well as inside the read below, because the program id is
  // what scopes the duplicate-email lookup on the failure path.
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") {
    return {
      ok: false,
      error: "Switch to your team workspace to edit players.",
      gone: false,
    };
  }

  // Re-read rather than trusting what the dialog was seeded with: the case this
  // is for is the other tab that archived this row while the form was open.
  const live = await getProgramPlayerFields(input.profileId);
  if (!live.ok) return { ok: false, error: live.error, gone: live.gone };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_program_player", {
    p_player_id: input.profileId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_class_year: input.classYear,
    p_lineup_spot: input.lineupSpot,
    p_email: input.email,
  });

  if (error) {
    return {
      ok: false,
      error: await describeUpdateFailure(
        error.message,
        workspace.active.id,
        input
      ),
      gone: false,
    };
  }

  revalidatePath(ROSTER_PATH);
  revalidatePath(`${ROSTER_PATH}/${input.profileId}`);
  revalidatePath(TEAM_HOME_PATH);
  return { ok: true };
}

/**
 * Turn what Postgres refused into a sentence.
 *
 * `update_program_player` has no duplicate-email check of its own — unlike
 * `add_program_player`, which turns the collision into prose before it can
 * happen — so a repeated address reaches `program_players_email_key`, the
 * partial unique index on `(program_id, lower(email))` over live rows, and
 * comes back as `duplicate key value violates unique constraint
 * "program_players_email_key"`. That string is not something to show a coach.
 *
 * The clashing row is looked up only on this path, so the ordinary save costs
 * no extra query and the roster's rules are still stated once, in SQL. The
 * wording matches `add_program_player`'s, because it is the same collision
 * arriving from the other direction.
 */
async function describeUpdateFailure(
  message: string | undefined,
  programId: string,
  input: { profileId: string; email: string | null }
): Promise<string> {
  const raw = message?.trim() ?? "";
  // Two questions, not one. Postgres writes the constraint name *into* the
  // duplicate-key sentence, so a single `includes` on the sentence would also
  // swallow a violation of some future unique index on this table and report it
  // as an email clash; a single `includes` on the name would let that same
  // violation fall through and hand the coach the raw string. Ask separately:
  // this constraint gets the specific sentence, any other duplicate still gets
  // a written one.
  const isDuplicate = raw.includes(
    "duplicate key value violates unique constraint"
  );
  const isEmailClash = raw.includes("program_players_email_key");

  // A CHECK the RPC does not pre-validate reaches here as Postgres prose. The
  // RPC guards the names and the email *shape*, but `program_players` also
  // carries `program_players_contributed_no_email` (an email on a contributed
  // row) and `program_players_lineup_check` (`lineup_spot > 0`) — the first
  // reachable from this form as soon as a roster holds a contributed player,
  // the second only from a hand-made call, since a server action's arguments
  // are the caller's. Either would otherwise show the coach
  // `new row for relation "program_players" violates check constraint …`.
  const isConstraint =
    raw.includes("violates check constraint") ||
    raw.includes("violates not-null constraint");

  if (!isEmailClash) {
    if (isDuplicate) return "That change collides with another roster row.";
    if (isConstraint) return "That combination of details isn't allowed here.";
    return raw.length > 0 ? raw : "Couldn't save that player.";
  }

  const address = input.email?.trim().toLowerCase() ?? "";
  if (address !== "") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("program_players")
      .select("first_name, last_name")
      // Scoped to the program, not just to what RLS permits: a coach who runs
      // two squads may read both, and naming somebody from the other one would
      // be a sentence about a roster that is not on screen.
      .eq("program_id", programId)
      // Stored lowercased by every RPC that writes the column, so an exact
      // match is the case-insensitive one — and `eq` cannot be fooled by an
      // address carrying `%` or `_`, which `ilike` would read as wildcards.
      .eq("email", address)
      .neq("id", input.profileId)
      .is("archived_at", null)
      .is("merged_into_id", null)
      .maybeSingle();

    const clash = data as { first_name: string; last_name: string } | null;
    if (clash) {
      const name = `${clash.first_name} ${clash.last_name}`.trim();
      return `${name} is already on this roster with that email.`;
    }
  }

  return "Somebody else on this roster already has that email address.";
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
  return { ok: true };
}

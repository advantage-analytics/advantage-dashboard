"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";
import { resolveRequest } from "./admin-actions";
import { generateToken, hashToken, INVITE_TTL_HOURS } from "./tokens";
import {
  ownershipTransferredEmail,
  programInviteEmail,
  sendEmail,
} from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import { displayName } from "./invite-acceptance";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import type { MemberRole } from "@/lib/data/team-settings-server";
import { getAdminTeam } from "@/lib/data/admin-team-server";
import { emptyProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";

/**
 * The writes the admin console performs on somebody else's program.
 *
 * Every one of these is the Settings › Teams action from
 * `components/dashboard/settings/team-actions.ts` with exactly two things
 * changed, and nothing else:
 *
 *  1. **The gate.** The member-facing actions resolve the caller's workspace
 *     and refuse an id that is not in `available`. An admin is by definition
 *     NOT a member of the program they are repairing, so that check would
 *     refuse every legitimate call. `requireAdmin()` replaces it — the same
 *     guard every other admin action in this directory uses, returning
 *     `{ ok: false }` rather than throwing, because these are called from
 *     client components that render the message.
 *
 *  2. **Which RPC, and through which client.** T4 widened
 *     `set_program_member_role`, `set_program_crest`, `create_program_invite`
 *     and `revoke_program_invite` in place to also accept `is_admin()`, so
 *     those are called exactly as the member-facing actions call them.
 *     Ownership is the exception: `transfer_program_ownership` demotes *the
 *     caller* and refuses `p_new_owner = auth.uid()`, which is nonsense for an
 *     admin acting on a program they are not in, so T4 added the separate
 *     `admin_transfer_program_ownership`.
 *
 * ── Session client vs. service role ─────────────────────────────────────────
 * **Every RPC goes through the SESSION client.** All four widened functions
 * are `security definer` and write `program_audit_log.actor_user_id` from
 * `auth.uid()`. Calling them with the service-role key would put a null — or
 * the service identity — in the actor column of the row that records who
 * changed a collegiate program's ownership. The audit log is the whole point
 * of doing this through RPCs rather than table writes, so it has to name the
 * human who pressed the button.
 *
 * **Reads and storage go through the SERVICE-ROLE client**, because they are
 * the things RLS and the bucket policy genuinely will not let a non-member do:
 * the `program-crests` bucket's policy is member-scoped, and reading the
 * target user's email address for the ownership mail is a row an admin has no
 * membership path to. `createAdminClient` never reaches a client bundle — this
 * module is `"use server"`.
 */

/** Everything under the admin console re-renders after any of these. */
const ADMIN_PATH = "/admin";

export type AdminTeamOutcome = { ok: true } | { ok: false; error: string };

export type AdminTransferResult =
  { ok: true; warning?: string } | { ok: false; error: string };

export type AdminInviteResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string; linkTo?: { profileId: string } };

const NOT_AUTHORIZED = "Not authorized.";

/** Postgres RAISE messages are written for people; pass them straight through. */
function toMessage(
  error: { message: string } | null,
  fallback: string,
): string {
  const raw = error?.message?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

/**
 * What to call this program in an email — the same shared name the
 * member-facing actions use, so an admin-sent invitation and a coach-sent one
 * name the program identically.
 */
async function programLabel(
  db: ReturnType<typeof createAdminClient>,
  programId: string,
): Promise<string | null> {
  const { data } = await db
    .from("programs")
    .select("school_name, team")
    .eq("id", programId)
    .maybeSingle();
  if (!data) return null;
  return programDisplayName(
    data.school_name as string,
    (data.team as string | null) ?? null,
  );
}

/**
 * Change one member's standing, as an admin.
 *
 * Mirrors `setProgramMemberRole`. The RPC still holds every rule — `owner` is
 * never assignable, the owner's own row moves by transfer, nobody edits their
 * own row — and T4's one added line is what lets an admin past the
 * membership gate while leaving all of them in force.
 */
export async function adminSetProgramMemberRole(input: {
  programId: string;
  userId: string;
  role: Exclude<MemberRole, "owner">;
}): Promise<AdminTeamOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  // SESSION client: `set_program_member_role` stamps `auth.uid()` into
  // `program_audit_log.actor_user_id`.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_program_member_role", {
    p_program_id: input.programId,
    p_user_id: input.userId,
    p_role: input.role,
  });

  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't change that role.") };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/**
 * Hand a program to one of its coaches or staff, as an admin.
 *
 * `admin_transfer_program_ownership` is the authority: it demotes whoever
 * currently holds the role (rather than the caller, who holds nothing here),
 * copes with a program that has no owner row at all — the state this console
 * exists to repair — and moves both the member rows and
 * `programs.owner_user_id` under one lock.
 *
 * The email is a courtesy sent afterwards, exactly as in
 * `transferProgramOwnership`: the row is the truth, a failed send is a
 * warning, never a failed transfer. The recipient's address is read from
 * `users` with the service-role client — an admin who is not a member has no
 * RLS path to it, and `program_roster` is staff-gated.
 *
 * `previousOwnerName` is the OUTGOING owner, not the admin. The template's
 * sentence is "X transferred ownership to you", and naming the platform admin
 * there would tell the new owner about a person they have never dealt with.
 * Read before the RPC, because the RPC is what stops them being the owner.
 */
export async function adminTransferProgramOwnership(input: {
  programId: string;
  newOwnerUserId: string;
}): Promise<AdminTransferResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const db = createAdminClient();

  // SERVICE ROLE, and before the write: after it, this person is a coach.
  const { data: outgoing } = await db
    .from("program_members")
    .select(
      "user:users!program_members_user_id_fkey(first_name, last_name, email)",
    )
    .eq("program_id", input.programId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  const outgoingUser = (
    outgoing as {
      user:
        | {
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }
        | {
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }[]
        | null;
    } | null
  )?.user;
  const previousOwner = Array.isArray(outgoingUser)
    ? (outgoingUser[0] ?? null)
    : (outgoingUser ?? null);

  // SESSION client: the audit row's `actor_user_id` must be this admin.
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_transfer_program_ownership", {
    p_program_id: input.programId,
    p_new_owner: input.newOwnerUserId,
  });

  if (error) {
    return {
      ok: false,
      error: toMessage(error, "Couldn't transfer ownership."),
    };
  }

  revalidatePath(ADMIN_PATH, "layout");

  const programName = await programLabel(db, input.programId);

  // SERVICE ROLE: the new owner's address, read from the row rather than taken
  // from the caller.
  const { data: recipient } = await db
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", input.newOwnerUserId)
    .maybeSingle();

  const to = (recipient?.email as string | null)?.trim();
  if (!to || !programName) {
    return {
      ok: true,
      warning: "Ownership moved, but we couldn't find an address to notify.",
    };
  }

  const recipientName = displayName(
    (recipient?.first_name as string | null) ?? null,
    (recipient?.last_name as string | null) ?? null,
  );

  const sent = await sendEmail(
    ownershipTransferredEmail({
      to,
      recipientName,
      programName,
      programId: input.programId,
      previousOwnerName: previousOwner
        ? displayName(
            (previousOwner.first_name as string | null) ?? null,
            (previousOwner.last_name as string | null) ?? null,
          )
        : null,
      hadPreviousOwner: previousOwner !== null,
    }),
  );

  if (!sent.ok) {
    const reason = sent.error.replace(/\.$/, "");
    return {
      ok: true,
      warning: `Ownership moved, but we couldn't email ${recipientName ?? to} (${reason}). Let them know yourself.`,
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
 * Replace a program's crest, as an admin.
 *
 * The same three-step sequence as `uploadProgramCrest`, including the
 * rollback: upload the new object, point the row at it, then remove whatever
 * it replaced — and if the row write fails, take the new object back down so a
 * failed save does not leave a stray file under the program's prefix. The key
 * carries a stamp for the same reason: a fixed key behind the CDN serves the
 * old image for the cache's lifetime, and a png→svg swap would orphan the old
 * object.
 *
 * SERVICE ROLE for all three storage calls and the `crest_path` read — the
 * `program-crests` bucket's policy is member-scoped, so a non-member admin's
 * session key is refused by the bucket no matter what `is_admin()` says.
 * SESSION client for `set_program_crest`, which is where the authorization
 * actually happens (T4 widened its staff gate to `or public.is_admin()`) and
 * which enforces that the path lives under the program's own prefix.
 */
export async function adminUploadProgramCrest(
  formData: FormData,
): Promise<AdminTeamOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const programId = String(formData.get("programId") ?? "");
  const file = formData.get("file");

  if (!programId) return { ok: false, error: "No program named." };
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

  const db = createAdminClient();
  const { data: current } = await db
    .from("programs")
    .select("crest_path")
    .eq("id", programId)
    .maybeSingle();
  const previous = (current?.crest_path as string | null | undefined) ?? null;

  const path = `${programId}/crest-${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from(PROGRAM_CRESTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return {
      ok: false,
      error: `Couldn't upload the crest: ${uploadError.message}`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_program_crest", {
    p_program_id: programId,
    p_crest_path: path,
  });

  if (error) {
    // The object is up but the row does not point at it. Take it back down.
    await db.storage.from(PROGRAM_CRESTS_BUCKET).remove([path]);
    return { ok: false, error: toMessage(error, "Couldn't save the crest.") };
  }

  if (previous && previous !== path) {
    await db.storage.from(PROGRAM_CRESTS_BUCKET).remove([previous]);
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/** Back to the initials mark. Row first, then the object it pointed at. */
export async function adminRemoveProgramCrest(
  programId: string,
): Promise<AdminTeamOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const db = createAdminClient();
  const { data: current } = await db
    .from("programs")
    .select("crest_path")
    .eq("id", programId)
    .maybeSingle();
  const previous = (current?.crest_path as string | null | undefined) ?? null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_program_crest", {
    p_program_id: programId,
    p_crest_path: null,
  });
  if (error) {
    return { ok: false, error: toMessage(error, "Couldn't remove the crest.") };
  }

  if (previous) {
    await db.storage.from(PROGRAM_CRESTS_BUCKET).remove([previous]);
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/**
 * Invite somebody into a program, as an admin.
 *
 * Mirrors `inviteMember` step for step: mint the token here and hold it, write
 * only its hash through `create_program_invite` (six keys always, including an
 * explicit null, because PostgREST resolves the overload by parameter names),
 * then send the mail. The row is written before the mail goes out and is NOT
 * rolled back when the mail fails — the row is what the roster lists and what
 * acceptance looks up, so a briefly unreachable mail API is not a reason to
 * throw the durable half away. Hence the third outcome: `ok: true` with a
 * warning.
 *
 * The RPC still enforces seats, the already-a-member refusal and the
 * `link_player` tripwire; T4 only widened its staff gate. The tripwire's
 * `hint`/`detail` are carried back the same way, so an admin dialog can reopen
 * on the roster row the invitation should attach to.
 *
 * `inviterName` is deliberately null — "Advantage Analytics invited you" is
 * what the template falls back to, and naming a platform admin to a recruit
 * who has never heard of them is worse than naming nobody.
 */
export async function adminInviteMember(input: {
  programId: string;
  email: string;
  role: Exclude<MemberRole, "owner">;
  /** The roster row this invitation binds a login to, if any. */
  playerId?: string | null;
}): Promise<AdminInviteResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const db = createAdminClient();
  const programName = await programLabel(db, input.programId);
  if (!programName) {
    return { ok: false, error: "That program no longer exists." };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
  const token = generateToken();

  // SESSION client: `create_program_invite` writes `invited_by` and the
  // `invite.created` audit row from `auth.uid()`.
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: input.programId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt.toISOString(),
    p_player_id: input.playerId ?? null,
  });

  if (error) {
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

  // Normalised the way the RPC normalises it, so the address printed in the
  // mail is the address acceptance compares against.
  const sent = await sendEmail(
    programInviteEmail({
      to: input.email.trim().toLowerCase(),
      programName,
      inviterName: null,
      role: input.role,
      token,
      expiresAt,
    }),
  );

  revalidatePath(ADMIN_PATH, "layout");

  if (!sent.ok) {
    return {
      ok: true,
      warning: `${sent.error} The invite is saved — press resend to try again.`,
    };
  }

  return { ok: true };
}

/** Withdraw an outstanding invitation. T4 widened the RPC's staff gate. */
export async function adminRevokeInvite(
  inviteId: string,
): Promise<AdminTeamOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

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

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/**
 * Close one open join request — `program_requests` kind `invite_request`.
 *
 * The same two outcomes the roster's own review dialog offers, for the same
 * reason spelled out on `approveJoinRequest`: membership is only ever
 * self-created (`program_members.user_id` is NOT NULL and every insert path
 * keys on `auth.uid()`), so a request carrying an email and no account cannot
 * be turned straight into a member. "Invite" therefore does what a coach would
 * do by hand — send a player invitation, which reserves a seat now and mints
 * the membership on acceptance — and only then clears the request.
 *
 * Order matters and is the roster's: the invite is the durable half and goes
 * first. A refusal leaves the request OPEN on purpose — a full program, a
 * duplicate address, the `link_player` tripwire are all things somebody has to
 * fix before this person can be let in, and a request resolved without an
 * invitation behind it vanishes from the one list that still says they are
 * waiting.
 *
 * The role is hard-coded to `player`, exactly as `approveJoinRequest` does.
 * `program_requests.role` holds a CLAIM role (`head_coach`, `assistant`…),
 * which is not the same vocabulary as `program_members.role`; letting it
 * through would bind a coach's login to an athlete's match history on a
 * mismatch.
 *
 * The address is read from the request's own row with the service-role client
 * and never taken from the caller, and `resolveRequest` — which already
 * re-checks admin, filters to `status = 'open'`, and sends the decline mail on
 * the dismiss path — closes the row.
 */
export async function adminResolveJoinRequest(
  requestId: string,
  action: "invite" | "dismiss",
): Promise<AdminInviteResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  if (action === "dismiss") {
    // `resolveRequest` owns the decline email and the open-only filter.
    const dismissed = await resolveRequest(requestId, "dismissed");
    if (!dismissed.ok) return dismissed;
    revalidatePath(ADMIN_PATH, "layout");
    return { ok: true };
  }

  const db = createAdminClient();
  const { data: request } = await db
    .from("program_requests")
    .select("id, email, program_id, kind, status")
    .eq("id", requestId)
    .maybeSingle();

  if (
    !request ||
    request.kind !== "invite_request" ||
    request.status !== "open"
  ) {
    return { ok: false, error: "That request is no longer open." };
  }
  if (!request.program_id) {
    return { ok: false, error: "That request doesn't name a program." };
  }

  const invite = await adminInviteMember({
    programId: request.program_id as string,
    email: request.email as string,
    role: "player",
  });
  if (!invite.ok) return invite;

  const resolved = await resolveRequest(requestId, "resolved");
  if (!resolved.ok) {
    // The invite is out and the seat is held; only closing the request failed.
    // Re-inviting simply refreshes the same row — `create_program_invite`
    // upserts on the one-open-invite index — so this is a note, not an error
    // over an invitation that actually went.
    return {
      ok: true,
      warning: `Invite sent, but the request stayed in the queue: ${resolved.error}`,
    };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return invite;
}

/**
 * Re-read one program's ledger for a different month, as an admin.
 *
 * Mirrors `loadProgramUsage` (`components/dashboard/settings/usage-actions.ts`)
 * for `ProgramUsageCard`'s month stepper, with the same two changes as every
 * other action in this file: `requireAdmin()` instead of a membership lookup,
 * and a program this admin is not a member of has to resolve anyway.
 *
 * A read, not a write — nothing here changes a row, so unlike the actions
 * above there is no `revalidatePath` call.
 *
 * Built on `getAdminTeam(programId)`'s `usageByMonth`, not a second
 * `readUsage` implementation: that function already carries the program's
 * `orgType` (the processing cap depends on it) and is `cache()`-wrapped, so
 * calling it here dedupes with the Usage page's own call within the same
 * request rather than re-querying `programs`.
 */
export async function adminLoadProgramUsage(
  programId: string,
  month: string,
): Promise<ProgramUsage> {
  const admin = await requireAdmin();
  if (!admin) return emptyProgramUsage(month);

  const data = await getAdminTeam(programId);
  if (!data) return emptyProgramUsage(month);

  return data.usageByMonth(month);
}

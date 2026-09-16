"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";
import { programStatusFor, type ClaimStatus } from "./claim-state";
import { programKeyFor, schoolGroupFor } from "./program-key";
import { displayName } from "./invite-acceptance";
import { generateToken, hashToken, INVITE_TTL_HOURS } from "./tokens";
import {
  programClaimInviteEmail,
  programInviteEmail,
  sendEmail,
} from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
import { getConferenceOptions } from "@/lib/data/team-settings-server";

/**
 * Seeding a program from the admin console.
 *
 * The directory is 1,941 collegiate rows the ITA gave us, and every one of
 * them arrived by import. This is the hand path beside it: a school that is
 * not in the data, a club running a pilot, a coach on the phone right now who
 * cannot claim a row that does not exist. `admin_create_program` (T4) writes
 * the row itself; everything in this file is what has to happen AROUND that
 * insert so the program is not just a row nobody can reach.
 *
 * ── Membership is only ever self-created ────────────────────────────────────
 * `program_members.user_id` is NOT NULL and every insert path keys on
 * `auth.uid()`, so "make this person the owner" is only a real instruction
 * when that person already has an account. That single fact is what splits the
 * owner handling into three branches rather than one, and the branches are not
 * degraded versions of each other — they are the three genuinely different
 * situations:
 *
 *   1. **The coach has an account.** Write the claim, the owner membership and
 *      the program's own owner columns. They sign in and the workspace is
 *      there.
 *   2. **No account, and it is a college.** A college row carries a
 *      `program_key`, so `/claim/[programKey]` can reach it — send them there
 *      and let the claim flow, which already knows how to verify a coach, do
 *      the verifying. Nothing is written in their name.
 *   3. **No account, and it is a custom org.** `programs_college_fields_check`
 *      forbids a `program_key` on a non-college row, so there IS no claim URL.
 *      The only route in is an invitation, and `create_program_invite` refuses
 *      the `owner` role by design (ownership moves by transfer, never by
 *      invitation). So they are invited as a coach and the admin promotes them
 *      on the Team page once they have accepted — which the dialog says out
 *      loud rather than leaving as a surprise.
 *
 * ── Session client vs. service role ─────────────────────────────────────────
 * The same split `admin-team-actions.ts` documents at length. **RPCs go
 * through the SESSION client** — `admin_create_program` and
 * `create_program_invite` are both `security definer` and read `auth.uid()`
 * for their own gate and for `program_audit_log.actor_user_id`; the service
 * key would put the service identity in the actor column of the row recording
 * who created a collegiate program. **Table reads and writes an admin has no
 * membership path to go through the SERVICE ROLE**: `program_claims`,
 * `program_members` and `programs` are all RLS-scoped to members, and
 * `program_contacts` has no policy and no grant at all, so only the service
 * role can touch it. `createAdminClient` never reaches a client bundle — this
 * module is `"use server"`.
 */

const ADMIN_PATH = "/admin";

const NOT_AUTHORIZED = "Not authorized.";

/** Both unique indexes a create can land on: the key, and (group, team). */
const DUPLICATE_SQLSTATE = "23505";
const DUPLICATE_MESSAGE = "That program already exists.";

export type ProgramOrgType =
  "college" | "club" | "high_school" | "academy" | "other";

export interface CreateProgramInput {
  orgType: ProgramOrgType;
  schoolName: string;
  /** `mens` / `womens`. Required for a college, meaningless anywhere else. */
  team: "mens" | "womens" | null;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  /** The school's mail domain — what the claim flow's domain check reads. */
  primaryDomain: string | null;
  /** The head coach this program is being created for. Optional. */
  ownerEmail: string | null;
  /** "Start the pilot": approve them on the spot instead of queueing a review. */
  startPilot: boolean;
}

/**
 * What became of the owner's email, so the dialog can say what happens next
 * instead of "Created." — three different things happened and the admin's next
 * move differs in each.
 */
export type CreateProgramOwnerOutcome =
  /** No address was given; the program is directory data until somebody claims it. */
  | "none"
  /** They had an account: they are the owner now. */
  | "owner"
  /** College, no account: the claim link is in their inbox. */
  | "claim-invited"
  /** Custom org, no account: invited as a coach, to be promoted after they accept. */
  | "coach-invited";

export type CreateProgramResult =
  | {
      ok: true;
      programId: string;
      owner: CreateProgramOwnerOutcome;
      /** The program exists; something beside it did not. Never a failed create. */
      warning?: string;
    }
  | { ok: false; error: string };

/** Postgres RAISE messages are written for people; pass them straight through. */
function toMessage(
  error: { message: string } | null,
  fallback: string,
): string {
  const raw = error?.message?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

/** The fast no. `admin_create_program` and the RPCs re-check everything. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * The directory's conferences for one division, for the create dialog.
 *
 * `getConferenceOptions` is a loader and the dialog is a client component, so
 * it needs an action to reach it — the list is refetched whenever the division
 * changes, because the answer is different per division (a D-I conference in a
 * D-III program's record is a program other schools will never match).
 *
 * Gated all the same. `programs` is publicly readable and this leaks nothing,
 * but an un-gated export in an admin action module is a habit worth not
 * forming.
 */
export async function conferenceOptionsFor(
  division: string | null,
): Promise<string[]> {
  const admin = await requireAdmin();
  if (!admin) return [];
  return getConferenceOptions("college", division);
}

/**
 * Create a program and wire up whoever is going to run it.
 *
 * The program row is the durable half and is written first. Nothing after it
 * can un-create it: a failed claim write, a refused invitation or an
 * unreachable mail API all come back as `ok: true` with a `warning`, because
 * the row exists either way and telling the admin it failed would leave them
 * creating it a second time — onto a unique index that now refuses.
 */
export async function createProgram(
  input: CreateProgramInput,
): Promise<CreateProgramResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const schoolName = input.schoolName.trim();
  if (schoolName.length < 2) {
    return { ok: false, error: "Give the program a name." };
  }

  const isCollege = input.orgType === "college";
  const team = isCollege ? input.team : null;
  if (isCollege && !team) {
    return { ok: false, error: "A college program needs a squad." };
  }

  const state = input.state?.trim().toUpperCase() || null;
  // Only a college row may carry these, and it must (`programs_college_fields_check`).
  const programKey = isCollege ? programKeyFor(schoolName, team) : null;
  const schoolGroup = isCollege ? schoolGroupFor(schoolName, state) : null;

  const ownerEmail = input.ownerEmail?.trim() ?? "";
  if (ownerEmail && !looksLikeEmail(ownerEmail)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  // SESSION client: `admin_create_program` gates on `is_admin()` from `auth.uid()`.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_program", {
    p_org_type: input.orgType,
    p_school_name: schoolName,
    p_team: team,
    p_program_key: programKey,
    p_school_group: schoolGroup,
    p_division: input.division,
    p_conference: input.conference,
    p_city: input.city,
    p_state: state,
    p_primary_domain: input.primaryDomain,
  });

  if (error) {
    // Both unique indexes say the same thing to an admin — this school's squad
    // is already in the directory — and neither says it in English on its own.
    if (error.code === DUPLICATE_SQLSTATE) {
      return { ok: false, error: DUPLICATE_MESSAGE };
    }
    return { ok: false, error: toMessage(error, "Couldn't create that team.") };
  }

  const programId = typeof data === "string" ? data : null;
  if (!programId) {
    return { ok: false, error: "Couldn't create that team." };
  }

  revalidatePath(ADMIN_PATH, "layout");

  if (!ownerEmail) {
    return { ok: true, programId, owner: "none" };
  }

  const programName = programDisplayName(schoolName, team);
  const wired = await wireOwner({
    programId,
    programName,
    programKey,
    ownerEmail,
    startPilot: input.startPilot,
    adminId: admin.id,
  });

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, programId, ...wired };
}

/**
 * The three owner branches, off the one question that separates them: does an
 * account already exist at this address?
 */
async function wireOwner(args: {
  programId: string;
  programName: string;
  programKey: string | null;
  ownerEmail: string;
  startPilot: boolean;
  adminId: string;
}): Promise<{ owner: CreateProgramOwnerOutcome; warning?: string }> {
  const db = createAdminClient();
  const email = args.ownerEmail.toLowerCase();

  // `ilike` and not `eq`, because `users.email` is not stored lowercased — but
  // the wildcards are escaped first. An address containing `_` is legal and
  // common, and `_` is a single-character wildcard in LIKE, so an unescaped
  // `a_b@x.com` would also match `axb@x.com`. This decides who ends up owning
  // a program; resolving to the wrong account is not a cosmetic bug.
  // (Copied deliberately from `reopenClaim` — one escaping rule, one shape.)
  const pattern = args.ownerEmail.trim().replace(/([\\%_])/g, "\\$1");
  const { data: user } = await db
    .from("users")
    .select("id, first_name, last_name, email")
    .ilike("email", pattern)
    .maybeSingle();

  if (user?.id) {
    return adoptExistingUser({ ...args, db, email, user });
  }

  // A college row carries a `program_key`, so the claim flow can reach it.
  if (args.programKey) {
    return inviteToClaim({ ...args, db, email });
  }

  return inviteAsCoach({ ...args, email });
}

/**
 * Branch 1 — the coach already has an account, so they can simply be made the
 * owner. Three writes in the order the claim flow itself uses: the claim (the
 * record of WHY they own it), the membership (what the app reads), then the
 * program's own owner columns.
 *
 * `status` is derived, never hand-written: `programStatusFor('approved')` is
 * `active` and `programStatusFor('pending_review')` is `claim_pending`. The
 * pilot switch chooses between those two claim states and nothing else —
 * with it off, the claim lands in the review queue exactly as a self-serve one
 * would, and the admin (or another) decides it there.
 */
async function adoptExistingUser(args: {
  programId: string;
  programName: string;
  startPilot: boolean;
  adminId: string;
  db: ReturnType<typeof createAdminClient>;
  email: string;
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}): Promise<{ owner: CreateProgramOwnerOutcome; warning?: string }> {
  const { db, user } = args;
  const claimStatus: ClaimStatus = args.startPilot
    ? "approved"
    : "pending_review";

  const { error: claimError } = await db.from("program_claims").insert({
    program_id: args.programId,
    claimant_user_id: user.id,
    claimed_email: args.email,
    // NOT NULL. The account's name where there is one, the address where there
    // is not — the queue prints this, and an empty cell is a row nobody can act on.
    claimant_name: displayName(user.first_name, user.last_name) ?? args.email,
    claimant_role: "head_coach",
    match_reason: "Created by admin",
    status: claimStatus,
    // Nothing was checked, so nothing is asserted: no domain match, no
    // recorded contact, no skipped review. The reason above is the honest one.
    domain_matched: false,
    skips_manual_review: false,
    contact_matched: false,
    // Only on the decided path. A `pending_review` row has not been reviewed.
    reviewed_by: args.startPilot ? args.adminId : null,
  });

  if (claimError) {
    return {
      owner: "none",
      warning: `The team is created, but we couldn't record the claim (${claimError.message}). Set the owner from the team's page.`,
    };
  }

  const { error: memberError } = await db.from("program_members").upsert(
    {
      program_id: args.programId,
      user_id: user.id,
      role: "owner",
      upload_enabled: true,
    },
    { onConflict: "program_id,user_id" },
  );

  if (memberError) {
    return {
      owner: "none",
      warning: `The team is created and the claim is recorded, but the owner's membership didn't save (${memberError.message}).`,
    };
  }

  const now = new Date().toISOString();
  await db
    .from("programs")
    .update({
      owner_user_id: user.id,
      claimed_at: now,
      status: programStatusFor(claimStatus),
      updated_at: now,
    })
    .eq("id", args.programId);

  return { owner: "owner" };
}

/**
 * Branch 2 — a college with no account behind the address. Point them at
 * `/claim/[programKey]` and let the existing claim flow verify them.
 *
 * ── What the pilot switch does here ─────────────────────────────────────────
 * It writes a `program_contacts` row for the same address. That table is the
 * recorded-staff list, and `complete_program_claim` checks it with an exact,
 * non-freemail match: a hit lands the claim in `objection_window` — live and
 * usable — instead of `pending_review`. So the admin's "start the pilot"
 * decision, made now, is honoured automatically when the coach finishes,
 * without anyone having to be watching the queue at that moment.
 *
 * `is_freemail` is false for the same reason it is a column: a gmail address
 * recorded here would be announced to but must never count as evidence. An
 * admin typing an address into the console IS the evidence, which is what
 * makes writing this row honest rather than a way of faking a match.
 *
 * The row goes in BEFORE the send, so the state the email promises is already
 * true when it arrives.
 */
async function inviteToClaim(args: {
  programId: string;
  programName: string;
  programKey: string | null;
  startPilot: boolean;
  db: ReturnType<typeof createAdminClient>;
  email: string;
}): Promise<{ owner: CreateProgramOwnerOutcome; warning?: string }> {
  const programKey = args.programKey;
  if (!programKey) return { owner: "none" };

  let pilot = args.startPilot;
  if (args.startPilot) {
    const { error } = await args.db.from("program_contacts").insert({
      program_id: args.programId,
      email: args.email,
      is_freemail: false,
      role: "Head coach",
    });
    // Downgrade rather than fail: the claim still works, it just waits for a
    // human. Promising the pilot in the email would be the real error.
    if (error) pilot = false;
  }

  const sent = await sendEmail(
    programClaimInviteEmail({
      to: args.email,
      programName: args.programName,
      programKey,
      pilot,
    }),
  );

  if (!sent.ok) {
    return {
      owner: "claim-invited",
      warning: `The team is created, but we couldn't email ${args.email} (${sent.error.replace(/\.$/, "")}). Send them /claim/${programKey} yourself.`,
    };
  }

  const warning =
    args.startPilot && !pilot
      ? "The team is created and the link is sent, but the pilot contact didn't save — their claim will go to the review queue."
      : undefined;

  return { owner: "claim-invited", ...(warning ? { warning } : {}) };
}

/**
 * Branch 3 — a custom org with no account behind the address. There is no
 * claim URL (a non-college row may not carry a `program_key`), so the only
 * route in is an invitation.
 *
 * `coach`, not `owner`: `create_program_invite` refuses the owner role
 * outright — ownership moves by transfer, and a program with two owners has no
 * answer to "who decides". So this gets them inside with staff standing, and
 * the admin promotes them from the Team page's transfer action once they have
 * an account. The dialog says so; an admin who does not know that would leave
 * a club permanently ownerless.
 *
 * Mirrors `adminInviteMember` step for step — six keys always, including the
 * explicit null, because PostgREST resolves the overload by parameter names —
 * rather than calling it, because that action revalidates and re-checks admin
 * on its own and this is already inside both.
 */
async function inviteAsCoach(args: {
  programId: string;
  programName: string;
  email: string;
}): Promise<{ owner: CreateProgramOwnerOutcome; warning?: string }> {
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
  const token = generateToken();

  // SESSION client: `create_program_invite` writes `invited_by` and the
  // `invite.created` audit row from `auth.uid()`.
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_program_invite", {
    p_program_id: args.programId,
    p_email: args.email,
    p_role: "coach",
    p_token_hash: hashToken(token),
    p_expires_at: expiresAt.toISOString(),
    p_player_id: null,
  });

  if (error) {
    return {
      owner: "none",
      warning: `The team is created, but the invitation didn't send (${error.message}). Invite them from the team's page.`,
    };
  }

  const sent = await sendEmail(
    programInviteEmail({
      to: args.email,
      programName: args.programName,
      // Naming a platform admin to someone who has never dealt with them is
      // worse than naming nobody; the template falls back to the product.
      inviterName: null,
      role: "coach",
      token,
      expiresAt,
    }),
  );

  if (!sent.ok) {
    return {
      owner: "coach-invited",
      warning: `${sent.error} The invitation is saved — resend it from the team's page.`,
    };
  }

  return { owner: "coach-invited" };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  sendEmail,
  claimApprovedEmail,
  claimDeclinedEmail,
  inviteRequestDeclinedEmail,
} from "@/lib/services/email";
import { claimRoleLabel } from "./claim-roles";
import {
  addHours,
  nextClaimStatus,
  programStatusFor,
  OBJECTION_WINDOW_HOURS,
  type ClaimStatus,
} from "./claim-state";

export type AdminOutcome = { ok: true } | { ok: false; error: string };

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * Every admin write re-checks the session.
 *
 * The spec's original design was an emailed approve/reject link. Even there it
 * said the link is "a shortcut to a page, not the authorization itself" — so
 * the check lives here, on the action, and a leaked URL can no more approve a
 * claim than a stranger walking past a screen can.
 *
 * `is_admin` is a real column on `users` with a `false` default; it is not
 * inferred from an email domain.
 */
async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data?.is_admin ? { id: user.id } : null;
}

/**
 * UTC, for the same reason the invite's expiry is formatted in UTC.
 *
 * The window closes at an absolute instant that Postgres compares against
 * `now()`. Formatting it in whatever zone the server happens to run in prints
 * a date the database disagrees with by up to a day — and the day it disagrees
 * is the day a coach reads "you have until the 4th" about a window that shut on
 * the 3rd.
 */
function formatWindowClose(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Tell the claimant what was decided — after the decision is already durable.
 *
 * This is what makes /claim/review's "We'll email you either way" true. Until
 * it existed, a claim routed to a human was decided in silence: the claimant
 * saw a waiting screen and then nothing, whichever way it went.
 *
 * **A failed send never fails the decision.** The claim has moved, the program
 * has changed hands, and the membership is written or deleted; a mail service
 * being briefly unreachable is not a reason to tell an admin their approval
 * failed and have them click it again. `sendEmail` never throws and has
 * already logged the technical cause — this adds the one thing it cannot know,
 * which is the claim now sitting decided with nobody told. Same warn-and-carry
 * posture as `inviteMember`.
 *
 * **What travels is the recipient's own, and NEVER `review_notes`.** The
 * decline carries only `claimantMessage` — the note an admin wrote in the
 * review row's "they'll see this" field — so internal commentary kept on the
 * claim cannot leak to the person declined. The one email that would have gone
 * to somebody else, the objection notice, was cut before launch.
 */
async function notifyClaimant(
  db: AdminDb,
  claim: {
    claimId: string;
    programId: string;
    to: string;
    claimantRole: string;
    outcome: ClaimStatus;
    /**
     * The CLAIMANT-FACING message, from the review row's disclosed field. This
     * is the only note that may appear in the mail. `review_notes` is internal
     * and is deliberately not even passed in here.
     */
    claimantMessage: string | null;
    /** Set only on the approval path, and the value written to the row. */
    windowEndsAt: Date | null;
  }
): Promise<void> {
  const { data: program } = await db
    .from("programs")
    .select("school_name, team, program_key")
    .eq("id", claim.programId)
    .maybeSingle();

  if (!program) return;

  const programName = programDisplayName(
    program.school_name as string,
    (program.team as string | null) ?? null
  );

  let message;

  if (claim.outcome === "objection_window" && claim.windowEndsAt) {
    message = claimApprovedEmail({
      to: claim.to,
      programName,
      // The stored value is `head_coach`; the label is what they picked.
      claimantTitle: claimRoleLabel(claim.claimantRole),
      windowClosesOn: formatWindowClose(claim.windowEndsAt),
    });
  } else if (claim.outcome === "rejected" || claim.outcome === "objected") {
    // The decline's whole point is the way forward, and that link is built
    // from the program key. Without one there is no alternative route to
    // offer, so say nothing rather than send a button to nowhere.
    const programKey = program.program_key as string | null;
    if (!programKey) {
      console.warn("[admin] no program key, claim decline not sent", {
        claimId: claim.claimId,
      });
      return;
    }
    message = claimDeclinedEmail({
      to: claim.to,
      programName,
      // The claimant-facing message ONLY. Never `review_notes`.
      reason: claim.claimantMessage,
      programKey,
    });
  } else {
    return;
  }

  const sent = await sendEmail(message);
  if (!sent.ok) {
    console.warn("[admin] claim outcome email not sent", {
      claimId: claim.claimId,
      outcome: claim.outcome,
    });
  }
}

/**
 * Move a claim, and move the program with it.
 *
 * The transition goes through `nextClaimStatus`, so an out-of-order click —
 * approving something already rejected, say — returns null and changes
 * nothing, rather than writing a state the machine does not allow. The
 * program's own status is derived by `programStatusFor` rather than written by
 * hand, because two columns that must agree are two columns that eventually
 * will not.
 */
async function transition(
  claimId: string,
  event: { type: "approve" } | { type: "reject" } | { type: "object" },
  fields: {
    /** Internal. Kept on the claim, shown only in the queue, NEVER emailed. */
    notes: string | null;
    /**
     * Claimant-facing. Written from the review row's "they'll see this" field,
     * and the only note that may reach the claimant — carried into the decline
     * email below. Null on the approval path.
     */
    claimantMessage: string | null;
  }
): Promise<AdminOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const db = createAdminClient();
  const { data: claim } = await db
    .from("program_claims")
    .select(
      "id, status, program_id, claimant_user_id, claimed_email, claimant_role"
    )
    .eq("id", claimId)
    .maybeSingle();

  if (!claim) return { ok: false, error: "That claim no longer exists." };

  const next = nextClaimStatus(claim.status as ClaimStatus, event);
  if (!next) {
    return { ok: false, error: `A ${claim.status} claim cannot be ${event.type}ed.` };
  }

  // An approval opens the objection window, and the approval email states the
  // day it shuts. Written to the row in the same update rather than only
  // printed into the mail: the claimant has been given a date, so the date has
  // to exist somewhere other than their inbox. `complete_program_claim` sets
  // the same column (now() + 24h) on the auto-approved path.
  const windowEndsAt =
    next === "objection_window"
      ? addHours(new Date(), OBJECTION_WINDOW_HOURS)
      : null;

  const { error } = await db
    .from("program_claims")
    .update({
      status: next,
      reviewed_by: admin.id,
      // Two distinct audiences, two distinct columns. `review_notes` is
      // internal; `claimant_message` is the disclosed, claimant-visible note.
      review_notes: fields.notes,
      claimant_message: fields.claimantMessage,
      ...(windowEndsAt
        ? { objection_window_ends_at: windowEndsAt.toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  if (error) {
    console.error("[admin] claim transition failed", { error: error.message });
    return { ok: false, error: "Could not update that claim." };
  }

  const programStatus = programStatusFor(next);

  // A rejection hands the program back so the right person can claim it, and
  // takes the membership with it — otherwise a rejected claimant keeps an owner
  // row on a program the directory shows as unclaimed.
  if (programStatus === "unclaimed") {
    await db
      .from("programs")
      .update({ status: "unclaimed", owner_user_id: null, claimed_at: null })
      .eq("id", claim.program_id);
    if (claim.claimant_user_id) {
      await db
        .from("program_members")
        .delete()
        .eq("program_id", claim.program_id)
        .eq("user_id", claim.claimant_user_id);
    }
  } else {
    await db
      .from("programs")
      .update({ status: programStatus })
      .eq("id", claim.program_id);
  }

  revalidatePath("/admin/claims");

  // Last, and unconditionally ok: see `notifyClaimant`. Every write above is
  // already committed, so there is nothing left for a send to invalidate.
  await notifyClaimant(db, {
    claimId: claim.id as string,
    programId: claim.program_id as string,
    to: claim.claimed_email as string,
    claimantRole: claim.claimant_role as string,
    outcome: next,
    claimantMessage: fields.claimantMessage,
    windowEndsAt,
  });

  return { ok: true };
}

/**
 * Approving sends the claimant the "you're in" email — the one that closes the
 * loop /claim/review opened with "we'll email you either way". No claimant-
 * facing message: the approval copy is fixed and carries no reviewer line.
 */
export async function approveClaim(claimId: string, notes?: string): Promise<AdminOutcome> {
  return transition(claimId, { type: "approve" }, {
    notes: notes?.trim() || null,
    claimantMessage: null,
  });
}

/**
 * Rejection is terminal and the claimant is told, with a reply path. The most
 * likely cause of a rejection is our own stale data rather than anything they
 * did, so leaving them at a dead end would be the wrong ending.
 *
 * `claimantMessage` is the review row's "they'll see this" field and is the
 * only note that reaches them; `notes` stays internal.
 */
export async function rejectClaim(
  claimId: string,
  notes?: string,
  claimantMessage?: string
): Promise<AdminOutcome> {
  return transition(claimId, { type: "reject" }, {
    notes: notes?.trim() || null,
    claimantMessage: claimantMessage?.trim() || null,
  });
}

/**
 * Undo an automatic approval.
 *
 * A claim that matched a recorded staff contact is already live, and neither
 * `approve` nor `reject` is a legal move out of `objection_window` — the state
 * machine only accepts `object`. That is deliberate rather than an oversight:
 * the one failure mode auto-approval has is a coach who has since left the
 * school claiming the program they used to run, and `object` is the transition
 * written for exactly that.
 *
 * It lands on `objected`, which derives to an `unclaimed` program, so the
 * membership goes with it and the right person can claim it.
 *
 * Like a rejection, this declines the claimant, so it takes the same
 * claimant-facing message and the same internal note.
 */
export async function handBackClaim(
  claimId: string,
  notes?: string,
  claimantMessage?: string
): Promise<AdminOutcome> {
  return transition(claimId, { type: "object" }, {
    notes: notes?.trim() || null,
    claimantMessage: claimantMessage?.trim() || null,
  });
}

/**
 * Put a settled claim back in the queue, and give the program back with it.
 *
 * The mirror of a rejection or an objection, and it has to be a separate
 * function rather than another `transition()` event because the side effects
 * run the other way. Rejecting DELETES the membership and clears the owner;
 * `transition()` only ever tears down. Reopening has to rebuild both, or the
 * claim returns to the queue pointing at a program nobody owns and approving it
 * would grant nothing.
 *
 * It lands on `pending_review`, never straight back to live — see
 * `nextClaimStatus`. The admin still has to approve, which is the same decision
 * they would make on any other claim in the queue.
 */
export async function reopenClaim(claimId: string, notes?: string): Promise<AdminOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const db = createAdminClient();
  const { data: claim } = await db
    .from("program_claims")
    .select("id, status, program_id, claimant_user_id, claimed_email")
    .eq("id", claimId)
    .maybeSingle();

  if (!claim) return { ok: false, error: "That claim no longer exists." };

  const next = nextClaimStatus(claim.status as ClaimStatus, { type: "reopen" });
  if (!next) {
    return { ok: false, error: `A ${claim.status} claim cannot be reopened.` };
  }

  // GUARD: the program has to still be free. Rejecting released it, so somebody
  // else may have claimed it in the meantime — and quietly taking it back would
  // be a worse mistake than the one being undone.
  const { data: program } = await db
    .from("programs")
    .select("status")
    .eq("id", claim.program_id)
    .maybeSingle();

  if (!program) return { ok: false, error: "That program no longer exists." };
  if (program.status !== "unclaimed") {
    return {
      ok: false,
      error: "Someone else has set this program up since. Reopening would take it from them.",
    };
  }

  const { count: liveClaims } = await db
    .from("program_claims")
    .select("id", { count: "exact", head: true })
    .eq("program_id", claim.program_id)
    .not("status", "in", "(rejected,objected)")
    .neq("id", claim.id);

  if ((liveClaims ?? 0) > 0) {
    return { ok: false, error: "Another claim on this program is already open." };
  }

  // The claimant. `program_claims.claimant_user_id` is ON DELETE SET NULL, so a
  // claimant who deleted their account and signed up again leaves the claim
  // orphaned — the address is the durable identity here, and it is the one that
  // was actually verified. Re-resolve from it and write the id back.
  let ownerId = claim.claimant_user_id as string | null;
  if (!ownerId) {
    // `ilike` and not `eq`, because `users.email` is not stored lowercased —
    // but the wildcards are escaped first. An address containing `_` is legal
    // and common, and `_` is a single-character wildcard in LIKE, so an
    // unescaped `a_b@x.com` would also match `axb@x.com`. This function hands
    // over ownership of a program; resolving to the wrong account here is not a
    // cosmetic bug.
    const pattern = (claim.claimed_email as string)
      .trim()
      .replace(/([\\%_])/g, "\\$1");
    const { data: user } = await db
      .from("users")
      .select("id")
      .ilike("email", pattern)
      .maybeSingle();
    ownerId = user?.id ?? null;
  }

  if (!ownerId) {
    return {
      ok: false,
      error: "That claimant no longer has an account, so there is nobody to give the program back to.",
    };
  }

  const { error: claimError } = await db
    .from("program_claims")
    .update({
      status: next,
      claimant_user_id: ownerId,
      reviewed_by: admin.id,
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  if (claimError) {
    console.error("[admin] reopen failed", { error: claimError.message });
    return { ok: false, error: "Could not reopen that claim." };
  }

  // Derived, not hand-written — `programStatusFor('pending_review')` is
  // 'claim_pending', which also stops anyone else claiming it while it is being
  // reconsidered.
  await db
    .from("programs")
    .update({
      status: programStatusFor(next),
      owner_user_id: ownerId,
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.program_id);

  // Rebuilt because the rejection deleted it. `pending_review` withholds video
  // submission on its own, so this restores the workspace without restoring the
  // budget.
  await db
    .from("program_members")
    .upsert(
      { program_id: claim.program_id, user_id: ownerId, role: "owner", upload_enabled: true },
      { onConflict: "program_id,user_id" }
    );

  revalidatePath("/admin/claims");
  return { ok: true };
}

/**
 * "They asked and the answer is no."
 *
 * Only for a dismissed INVITE REQUEST. The other two kinds get nothing: an
 * ownership dispute is a conversation a person is already having, and an
 * unlisted-program submission has no program to name in the mail.
 *
 * There is no matching "you're in" email, by design — letting somebody in
 * sends them a real invitation, and two messages about one decision is one too
 * many. See `templates/invite-request.ts`.
 */
async function notifyRequestDeclined(
  db: AdminDb,
  request: { requestId: string; to: string; programId: string | null }
): Promise<void> {
  if (!request.programId) return;

  const { data: program } = await db
    .from("programs")
    .select("school_name, team")
    .eq("id", request.programId)
    .maybeSingle();

  if (!program) return;

  const sent = await sendEmail(
    inviteRequestDeclinedEmail({
      to: request.to,
      programName: programDisplayName(
        program.school_name as string,
        (program.team as string | null) ?? null
      ),
      // Null on purpose. `program_requests.note` is the REQUESTER's OWN words,
      // and there is no admin-authored reviewer note on a request — printing
      // the requester's sentence back to them under "What they said" would
      // misattribute it to the coaching staff. No internal text is emailed.
      reason: null,
    })
  );

  if (!sent.ok) {
    console.warn("[admin] invite-request decline email not sent", {
      requestId: request.requestId,
    });
  }
}

/** Close an invite request, dispute, or unlisted-program submission. */
export async function resolveRequest(
  requestId: string,
  status: "resolved" | "dismissed"
): Promise<AdminOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const db = createAdminClient();
  // Only an OPEN request moves, and the row it moved comes back with it. The
  // queue lists nothing else, so the filter costs that screen nothing — and it
  // is what stops a second click from a stale tab mailing the same person the
  // same decision twice. Matching nothing is not a failure: the request is
  // already closed, which is what the admin was asking for.
  const { data: resolved, error } = await db
    .from("program_requests")
    .update({ status, resolved_by: admin.id, resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id, kind, email, program_id")
    .maybeSingle();

  if (error) {
    console.error("[admin] could not resolve request", { error: error.message });
    return { ok: false, error: "Could not update that request." };
  }

  revalidatePath("/admin/claims");

  // "Dismissed" is the decline — the Dismiss button in the queue. "Resolved"
  // is Done, which means they were dealt with, usually by being invited. The
  // recipient is the address recorded on the request the reviewer just closed,
  // never anything a caller supplies here.
  if (resolved && status === "dismissed" && resolved.kind === "invite_request") {
    await notifyRequestDeclined(db, {
      requestId: resolved.id as string,
      to: resolved.email as string,
      programId: (resolved.program_id as string | null) ?? null,
    });
  }

  return { ok: true };
}

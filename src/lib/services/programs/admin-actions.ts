"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  nextClaimStatus,
  programStatusFor,
  type ClaimStatus,
} from "./claim-state";

export type AdminOutcome = { ok: true } | { ok: false; error: string };

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
  notes: string | null
): Promise<AdminOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const db = createAdminClient();
  const { data: claim } = await db
    .from("program_claims")
    .select("id, status, program_id, claimant_user_id")
    .eq("id", claimId)
    .maybeSingle();

  if (!claim) return { ok: false, error: "That claim no longer exists." };

  const next = nextClaimStatus(claim.status as ClaimStatus, event);
  if (!next) {
    return { ok: false, error: `A ${claim.status} claim cannot be ${event.type}ed.` };
  }

  const { error } = await db
    .from("program_claims")
    .update({
      status: next,
      reviewed_by: admin.id,
      review_notes: notes,
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
  return { ok: true };
}

export async function approveClaim(claimId: string, notes?: string): Promise<AdminOutcome> {
  return transition(claimId, { type: "approve" }, notes?.trim() || null);
}

/**
 * Rejection is terminal and the claimant is told, with a reply path. The most
 * likely cause of a rejection is our own stale data rather than anything they
 * did, so leaving them at a dead end would be the wrong ending.
 */
export async function rejectClaim(claimId: string, notes?: string): Promise<AdminOutcome> {
  return transition(claimId, { type: "reject" }, notes?.trim() || null);
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
 */
export async function handBackClaim(claimId: string, notes?: string): Promise<AdminOutcome> {
  return transition(claimId, { type: "object" }, notes?.trim() || null);
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

/** Close an invite request, dispute, or unlisted-program submission. */
export async function resolveRequest(
  requestId: string,
  status: "resolved" | "dismissed"
): Promise<AdminOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const db = createAdminClient();
  const { error } = await db
    .from("program_requests")
    .update({ status, resolved_by: admin.id, resolved_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    console.error("[admin] could not resolve request", { error: error.message });
    return { ok: false, error: "Could not update that request." };
  }

  revalidatePath("/admin/claims");
  return { ok: true };
}

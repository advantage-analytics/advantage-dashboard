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
  event: { type: "approve" } | { type: "reject" },
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
    return { ok: false, error: `A ${claim.status} claim cannot be ${event.type}d.` };
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

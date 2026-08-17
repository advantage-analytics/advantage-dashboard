"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkClaimEmail } from "./domain-match";
import { generateToken, hashToken } from "./tokens";
import { CLAIM_LINK_TTL_HOURS, addHours } from "./claim-state";

export type ClaimSubmitResult =
  | { ok: true; skipsReview: boolean }
  | { ok: false; error: string };

/**
 * "My program isn't listed" — F3.1.
 *
 * Lands in the same queue as an unrecognized-domain claim, deliberately. All
 * 1,940 teams across every division are already in the directory, so this is
 * now the rare path: a new program, a renamed school, or a team the ITA feed
 * does not carry.
 *
 * Recorded as a `program_claims` row against a placeholder program would be
 * wrong — there is no program to claim yet. It goes to the review queue as its
 * own thing.
 */
export async function submitUnlistedProgram(input: {
  school: string;
  team: string;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const school = input.school.trim();
  const email = input.email.trim().toLowerCase();

  if (!school) return { ok: false, error: "Add the school name." };
  if (!email) return { ok: false, error: "Add an email address." };

  // TODO(email): this should notify the admin address through Resend, the same
  // way an unrecognized-domain claim does. Until that exists it is logged, so
  // a request is never silently dropped — but it is NOT a queue, and this path
  // must not be advertised publicly until it is one.
  console.log("[claim] unlisted program request", {
    school,
    team: input.team,
    email,
  });

  return { ok: true };
}

/**
 * Submit a program claim.
 *
 * The domain check runs HERE, server-side, against the program row read from
 * the database — never against anything the form posted. The claim form shows a
 * live inline note as you type, computed in the browser from the same pure
 * function, but that is a courtesy: it tells you what will probably happen, and
 * this decides what does.
 *
 * A match's only effect is skipping manual review. It does not grant access,
 * does not skip the objection window, does not assign a role. Access arrives
 * only when the emailed link is opened, which is the actual gate.
 */
export async function submitClaim(input: {
  programKey: string;
  fullName: string;
  role: string;
  email: string;
}): Promise<ClaimSubmitResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) return { ok: false, error: "Add your name." };
  if (!email) return { ok: false, error: "Add an email address." };

  const db = createAdminClient();

  const { data: program, error: programError } = await db
    .from("programs")
    .select(
      "id, school_name, team, primary_domain, athletics_domains, domain_match_skips_review, status"
    )
    .eq("program_key", input.programKey)
    .maybeSingle();

  if (programError || !program) {
    return { ok: false, error: "We could not find that program." };
  }

  // The unique partial index enforces this too; checking first turns a
  // constraint violation into a sentence someone can act on.
  if (program.status !== "unclaimed") {
    return {
      ok: false,
      error: "Someone has already started setting up this program.",
    };
  }

  const check = checkClaimEmail(email, program);

  const token = generateToken();
  const now = new Date();

  const { error: insertError } = await db.from("program_claims").insert({
    program_id: program.id,
    claimed_email: email,
    claimant_name: fullName,
    claimant_role: input.role,
    domain_matched: check.domainMatched,
    skips_manual_review: check.skipsManualReview,
    match_reason: check.reason,
    status: "pending_email",
    verification_token_hash: hashToken(token),
    token_expires_at: addHours(now, CLAIM_LINK_TTL_HOURS).toISOString(),
  });

  if (insertError) {
    // 23505 is the one-open-claim-per-program index. Somebody beat them to it
    // between the status screen and this submit.
    if (insertError.code === "23505") {
      return { ok: false, error: "Someone claimed this program a moment ago." };
    }
    console.error("[claim] insert failed", { error: insertError.message });
    return { ok: false, error: "We could not record that. Try again." };
  }

  // `programs.status` deliberately does NOT move here.
  //
  // It used to, so the directory would show "being set up" immediately. That
  // combination was a denial of service: this action is unauthenticated and
  // unthrottled, the program keys are enumerable through the public search
  // endpoint, and `program_claims_one_open_per_program` allows exactly one live
  // claim each. A loop over the 1,940 keys would have parked every program in
  // `claim_pending` with no email sent and no way back except 1,940 rows edited
  // by hand.
  //
  // The transition belongs to the link click, which the header above already
  // calls the actual gate: until someone proves they can read the address, a
  // submission is a request rather than a claim. `programStatusFor()` in
  // claim-state.ts derives the column from the live claim, so the status screen
  // stays truthful without this write.

  // TODO(email): send the magic link, and announce the claim to every other
  // address in `program_contacts` with a one-click objection link. Both go
  // through Resend and neither is wired yet — the claim is recorded and its
  // token stored hashed, so sending is the only missing step. The announcement
  // is the actual defence against a stale directory, so this flow must NOT be
  // opened publicly until it exists.

  return { ok: true, skipsReview: check.skipsManualReview };
}

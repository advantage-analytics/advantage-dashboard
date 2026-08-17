"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkClaimEmail } from "./domain-match";
import { nextClaimStatus, type ClaimStatus } from "./claim-state";

export type ActionOutcome = { ok: true } | { ok: false; error: string };

/**
 * Where a half-finished claim lives between submitting the form and clicking
 * the emailed link.
 *
 * httpOnly, so the claimant cannot edit which program they are claiming on the
 * way back. Putting it in the redirect URL would have been simpler and would
 * have let anyone swap the program key for another school's; putting it in
 * Supabase user metadata does not work at all, because `signInWithOtp`'s `data`
 * is applied on user CREATION and would be silently dropped for anyone who
 * already has an account.
 */
const PENDING_CLAIM_COOKIE = "advantage_pending_claim";
const PENDING_CLAIM_TTL_SECONDS = 60 * 60 * 24; // matches the link's own life

interface PendingClaim {
  programKey: string;
  fullName: string;
  role: string;
  email: string;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/**
 * Begin a claim. Writes NOTHING to the database.
 *
 * That is the entire point. This action is reachable without an account — it
 * has to be, since you pick your program before you have one — and the earlier
 * version inserted a `program_claims` row on submit. Combined with
 * `program_claims_one_open_per_program`, a script walking the 1,940 program
 * keys (enumerable through the public search endpoint) would have parked an
 * open claim on every program and blocked every legitimate claimant. Moving the
 * `programs.status` write out was not enough; the row itself was the problem.
 *
 * So the order is inverted: prove you can read the address, THEN create the
 * claim. Supabase Auth rate-limits OTP sends per address and per IP, so the
 * throttle this action always needed comes with it.
 */
export async function startClaim(input: {
  programKey: string;
  fullName: string;
  role: string;
  email: string;
}): Promise<ActionOutcome> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) return { ok: false, error: "Add your name." };
  if (!email) return { ok: false, error: "Add an email address." };

  // Read-only: confirms the program exists and is free before mailing anybody.
  // A claimant should not receive a link to set up a program somebody else
  // finished claiming while they filled the form in.
  const db = createAdminClient();
  const { data: program } = await db
    .from("programs")
    .select("status")
    .eq("program_key", input.programKey)
    .maybeSingle();

  if (!program) return { ok: false, error: "We could not find that program." };
  if (program.status !== "unclaimed") {
    return { ok: false, error: "Someone has already started setting up this program." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // The claimant becomes the owner, so they need the account either way.
      shouldCreateUser: true,
      // `/confirm` already exchanges the code and creates the `users` profile
      // row; this rides that rather than adding a second callback.
      emailRedirectTo: `${siteUrl()}/confirm?next=/claim/verify`,
    },
  });

  if (error) {
    console.error("[claim] could not send the link", { error: error.message });
    // Supabase returns the same shape for "rate limited" as for a bad address;
    // saying so plainly beats a generic failure the claimant cannot act on.
    return {
      ok: false,
      error: "We could not send the link. Check the address, or try again in a minute.",
    };
  }

  const store = await cookies();
  store.set(
    PENDING_CLAIM_COOKIE,
    JSON.stringify({ programKey: input.programKey, fullName, role: input.role, email }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_CLAIM_TTL_SECONDS,
    }
  );

  return { ok: true };
}

export type CompleteClaimResult =
  | { ok: true; programKey: string; schoolName: string; alreadyOwned: boolean }
  | { ok: false; error: string; needsRestart?: boolean };

/**
 * Finish a claim after the emailed link is clicked.
 *
 * The domain check runs HERE, against the program row read from the database —
 * never against anything the form posted and never against the cookie. The
 * claim form's live inline note is a courtesy that says what will probably
 * happen; this decides what does.
 */
export async function completeClaim(): Promise<CompleteClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Open the link from your email to finish." };

  const store = await cookies();
  const raw = store.get(PENDING_CLAIM_COOKIE)?.value;
  if (!raw) {
    return {
      ok: false,
      needsRestart: true,
      error: "We could not find the program you were setting up. Pick it again and we'll resend the link.",
    };
  }

  let pending: PendingClaim;
  try {
    pending = JSON.parse(raw) as PendingClaim;
  } catch {
    return { ok: false, needsRestart: true, error: "That link has expired. Start again." };
  }

  const db = createAdminClient();
  const { data: program } = await db
    .from("programs")
    .select("school_name, primary_domain, athletics_domains, domain_match_skips_review")
    .eq("program_key", pending.programKey)
    .maybeSingle();

  if (!program) return { ok: false, needsRestart: true, error: "We could not find that program." };

  // Against the verified session address, not the one typed into the form.
  const check = checkClaimEmail(user.email ?? pending.email, program);

  const { data, error } = await supabase
    .rpc("complete_program_claim", {
      p_program_key: pending.programKey,
      p_claimed_email: user.email ?? pending.email,
      p_claimant_name: pending.fullName,
      p_claimant_role: pending.role,
      p_domain_matched: check.domainMatched,
      p_skips_manual_review: check.skipsManualReview,
      p_match_reason: check.reason,
    })
    .single();

  if (error) {
    console.error("[claim] completion failed", { error: error.message });
    if (error.code === "23505") {
      return { ok: false, error: "Someone else finished setting up this program first." };
    }
    return { ok: false, error: "We could not finish setting this up. Try the link again." };
  }

  store.delete(PENDING_CLAIM_COOKIE);

  return {
    ok: true,
    programKey: pending.programKey,
    schoolName: program.school_name as string,
    alreadyOwned: Boolean((data as { already_owned?: boolean })?.already_owned),
  };
}

// ---------------------------------------------------------------------------
// The three requests that used to go nowhere
// ---------------------------------------------------------------------------

async function fileRequest(row: {
  kind: "invite_request" | "ownership_dispute" | "unlisted_program";
  programId?: string | null;
  email: string;
  name?: string | null;
  note?: string | null;
  schoolName?: string | null;
  team?: string | null;
}): Promise<ActionOutcome> {
  const db = createAdminClient();
  const { error } = await db.from("program_requests").insert({
    kind: row.kind,
    program_id: row.programId ?? null,
    email: row.email.trim().toLowerCase(),
    name: row.name?.trim() || null,
    note: row.note?.trim() || null,
    school_name: row.schoolName?.trim() || null,
    team: row.team ?? null,
  });

  if (error) {
    // The partial unique index collapses repeat clicks into the one row the
    // reviewer already has. Telling someone their second request "failed"
    // would be wrong — it is already filed.
    if (error.code === "23505") return { ok: true };
    console.error("[claim] could not file request", { kind: row.kind, error: error.message });
    return { ok: false, error: "We could not record that. Try again." };
  }
  return { ok: true };
}

async function programIdFor(programKey: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("programs")
    .select("id")
    .eq("program_key", programKey)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** F3.3 / F3.4 — "Request an invite". Reaches the owner; queues nothing for you. */
export async function requestInvite(input: {
  programKey: string;
  email: string;
  name?: string;
  note?: string;
}): Promise<ActionOutcome> {
  const email = input.email.trim();
  if (!email) return { ok: false, error: "Add an email address so they can reply." };

  const programId = await programIdFor(input.programKey);
  if (!programId) return { ok: false, error: "We could not find that program." };

  return fileRequest({
    kind: "invite_request",
    programId,
    email,
    name: input.name,
    note: input.note,
  });
}

/**
 * F3.3 "They no longer work here" and F3.4 "This isn't right".
 *
 * Two different things behind one control, and the difference is the program's
 * state. A program mid-claim gets an objection to that claim — which is where
 * `nextClaimStatus` finally has a production caller. A program already active
 * gets an ownership dispute, because there is no claim left to object to and
 * reversing ownership is not something a stranger's click should do.
 */
export async function raiseObjection(input: {
  programKey: string;
  email: string;
  note?: string;
}): Promise<ActionOutcome> {
  const email = input.email.trim();
  if (!email) return { ok: false, error: "Add an email address so we can follow up." };

  const db = createAdminClient();
  const { data: program } = await db
    .from("programs")
    .select("id, status")
    .eq("program_key", input.programKey)
    .maybeSingle();

  if (!program) return { ok: false, error: "We could not find that program." };

  if (program.status === "claim_pending") {
    const { data: claim } = await db
      .from("program_claims")
      .select("id, status")
      .eq("program_id", program.id)
      .in("status", ["pending_email", "pending_review", "objection_window"])
      .maybeSingle();

    if (claim) {
      const next = nextClaimStatus(claim.status as ClaimStatus, { type: "object" });
      if (next) {
        await db
          .from("program_claims")
          .update({ status: next, review_notes: input.note?.trim() || null })
          .eq("id", claim.id);

        // An objection does NOT reverse anything on its own — the objector
        // could themselves be the stale record. The program returns to
        // unclaimed so it is claimable again, and the dispute is filed for a
        // human either way.
        await db
          .from("programs")
          .update({ status: "unclaimed", owner_user_id: null, claimed_at: null })
          .eq("id", program.id);
      }
    }
  }

  return fileRequest({
    kind: "ownership_dispute",
    programId: program.id as string,
    email,
    note: input.note,
  });
}

/** F3.1 — the program is not in the directory. */
export async function submitUnlistedProgram(input: {
  school: string;
  team: string;
  email: string;
}): Promise<ActionOutcome> {
  const school = input.school.trim();
  const email = input.email.trim();

  if (!school) return { ok: false, error: "Add the school name." };
  if (!email) return { ok: false, error: "Add an email address." };

  // This used to console.log and return success while the form told the user
  // "we have {school}, we'll email you". Now it is a row somebody can act on.
  return fileRequest({
    kind: "unlisted_program",
    email,
    schoolName: school,
    team: input.team,
  });
}

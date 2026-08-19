"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkClaimEmail } from "./domain-match";
import { nextClaimStatus, type ClaimStatus } from "./claim-state";

export type ActionOutcome = { ok: true } | { ok: false; error: string };

/**
 * Where a half-finished claim lives between submitting the form and clicking
 * the emailed link.
 *
 * This was an httpOnly cookie, which meant the program key existed in exactly
 * one browser. A coach filling the form on a laptop and opening the mail on a
 * phone got "We lost track of which program" — the ordinary way people do this,
 * failing at the last step.
 *
 * So it lives server-side, keyed by address, and the emailed link now works from
 * any device. `pending_claims` has no constraint on the program, which is what
 * keeps this from reopening the denial of service the cookie was introduced to
 * fix — see the migration for the full argument.
 *
 * Not Supabase user metadata: `signInWithOtp`'s `data` is applied on user
 * CREATION and is silently dropped for anyone who already has an account.
 */
const PENDING_CLAIM_TTL_HOURS = 24; // matches the link's own life

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
 * Begin a claim. Creates no CLAIM, and touches no program.
 *
 * That distinction is the entire point. This action is reachable without an
 * account — it has to be, since you pick your program before you have one — and
 * the earlier version inserted a `program_claims` row on submit. Combined with
 * `program_claims_one_open_per_program`, a script walking the 1,940 program
 * keys (enumerable through the public search endpoint) would have parked an
 * open claim on every program and blocked every legitimate claimant. Moving the
 * `programs.status` write out was not enough; the row itself was the problem.
 *
 * So the order is inverted: prove you can read the address, THEN create the
 * claim. Supabase Auth rate-limits OTP sends per address and per IP, so the
 * throttle this action always needed comes with it.
 *
 * The one row this DOES write is `pending_claims`, which carries the program
 * key across to the emailed link. It is not a claim and it has no constraint on
 * the program, so no number of them blocks anybody — see the migration.
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

  // AFTER the send, deliberately. Row creation is then gated by Supabase's
  // email rate limit and its per-address and per-IP OTP throttles — pending
  // claims cannot be created faster than mail actually goes out.
  const expiresAt = new Date(Date.now() + PENDING_CLAIM_TTL_HOURS * 60 * 60 * 1000);

  const { error: pendingError } = await db.from("pending_claims").upsert(
    {
      email,
      program_key: input.programKey,
      full_name: fullName,
      role: input.role,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "email" }
  );

  if (pendingError) {
    // The link is already gone, so failing here would strand a claimant who has
    // a working email in front of them. Report it rather than pretending: the
    // link will land on "start again", which is recoverable and honest.
    console.error("[claim] could not record the pending claim", {
      error: pendingError.message,
    });
    return {
      ok: false,
      error: "We could not start that setup. Try again in a moment.",
    };
  }

  // Opportunistic sweep. There is no scheduled job on this project, and this is
  // the only path that creates these rows, so it is the natural place.
  await db.from("pending_claims").delete().lt("expires_at", new Date().toISOString());

  return { ok: true };
}

export type CompleteClaimResult =
  | {
      ok: true;
      programKey: string;
      programId: string;
      schoolName: string;
      email: string;
      alreadyOwned: boolean;
      /**
       * The address is a recorded non-freemail contact for this exact program,
       * so the claim is live and no one has to look at it. Decides which screen
       * the claimant lands on, and it is the RPC's answer — never recomputed
       * here, because the contact list has no grants and must not leave the
       * database.
       */
      autoApproved: boolean;
    }
  | { ok: false; reason: ClaimFailure };

/**
 * Why a claim could not be finished.
 *
 * A code rather than a sentence, because the failure screen is reached by
 * redirect and the reason rides in the URL. Passing the copy itself would let
 * anyone hand a coach a link that renders whatever text they chose on our own
 * domain, under our logo. The copy lives in the screen; only the code travels.
 */
export type ClaimFailure =
  | "no-session"
  | "no-pending"
  | "expired"
  | "unknown-program"
  | "taken"
  | "failed";

/** What `complete_program_claim` returns. One jsonb object, not a row. */
interface ClaimRpcResult {
  program_id: string;
  status: ClaimStatus;
  already_owned: boolean;
  contact_matched: boolean;
}

/**
 * Finish a claim after the emailed link is clicked.
 *
 * The domain check runs HERE, against the program row read from the database —
 * never against anything the form posted. The claim form's live inline note is
 * a courtesy that says what will probably happen; this decides what does.
 *
 * Which claim this is comes from the VERIFIED session address, so a link opened
 * on a phone finishes the claim started on a laptop, and there is still no id
 * anywhere for anyone to tamper with.
 */
export async function completeClaim(): Promise<CompleteClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, reason: "no-session" };

  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-session" };

  const db = createAdminClient();

  // Looked up by the VERIFIED session address, never by anything in the URL.
  // That is what makes a server-side row safe where a URL parameter would not
  // be: there is no program key to swap on the way back.
  const { data: row } = await db
    .from("pending_claims")
    .select("program_key, full_name, role, expires_at")
    .eq("email", email)
    .maybeSingle();

  if (!row) return { ok: false, reason: "no-pending" };
  if (new Date(row.expires_at as string) < new Date()) {
    await db.from("pending_claims").delete().eq("email", email);
    return { ok: false, reason: "expired" };
  }

  const pending: PendingClaim = {
    programKey: row.program_key as string,
    fullName: row.full_name as string,
    role: row.role as string,
    email,
  };
  const { data: program } = await db
    .from("programs")
    .select("school_name, primary_domain, athletics_domains, domain_match_skips_review")
    .eq("program_key", pending.programKey)
    .maybeSingle();

  if (!program) return { ok: false, reason: "unknown-program" };

  // Against the verified session address, not the one typed into the form.
  const check = checkClaimEmail(email, program);

  const { data, error } = await supabase.rpc("complete_program_claim", {
    p_program_key: pending.programKey,
    p_claimed_email: email,
    p_claimant_name: pending.fullName,
    p_claimant_role: pending.role,
    p_domain_matched: check.domainMatched,
    p_skips_manual_review: check.skipsManualReview,
    p_match_reason: check.reason,
  });

  if (error) {
    console.error("[claim] completion failed", { error: error.message });
    if (error.code === "23505") {
      return { ok: false, reason: "taken" };
    }
    return { ok: false, reason: "failed" };
  }

  // Single use. Leaving it would let a second click re-run the RPC, which is
  // idempotent for the owner but would also keep a live row naming a program
  // the claimant already owns.
  await db.from("pending_claims").delete().eq("email", email);

  const rpc = data as ClaimRpcResult | null;

  return {
    ok: true,
    programKey: pending.programKey,
    programId: rpc?.program_id ?? "",
    schoolName: program.school_name as string,
    email,
    alreadyOwned: Boolean(rpc?.already_owned),
    // `contact_matched` is the decision; `status` is what it produced. Reading
    // the decision keeps this one line ahead of any future status the machine
    // grows.
    autoApproved: Boolean(rpc?.contact_matched),
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

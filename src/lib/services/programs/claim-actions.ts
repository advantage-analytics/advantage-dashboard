"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkClaimEmail } from "./domain-match";
import { toClaimRole, type ClaimRoleValue } from "./claim-roles";
import { nextClaimStatus, type ClaimStatus } from "./claim-state";
import { siteUrl } from "@/lib/site-url";

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

/**
 * The one call to Supabase that actually mails a link, shared by `startClaim`
 * and `resendClaim` so "reuses the OTP send path" is literally true rather
 * than two copies that quietly drift apart.
 */
async function sendClaimOtp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string
) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      // The claimant becomes the owner, so they need the account either way.
      shouldCreateUser: true,
      // `/confirm` already exchanges the code and creates the `users` profile
      // row; this rides that rather than adding a second callback.
      emailRedirectTo: `${siteUrl()}/confirm?next=/claim/verify`,
    },
  });
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
  const { error } = await sendClaimOtp(supabase, email);

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

/**
 * Re-send the link for a claim `startClaim` already began.
 *
 * Reachable the same way `startClaim` is — no session, no account, just
 * whatever the check-email URL carries (`to` and `program`) — so it gets the
 * same treatment: read before mailing, mail before writing.
 *
 * The one thing it must NOT do is answer "does this address have a claim
 * pending on this program". The check-email page is a plain GET reachable
 * for any `to`/`program` pair without ever having submitted the setup form,
 * so unlike the program lookup below — whose status is already public on the
 * program's own status page — a row match here is per-address information
 * nothing else in the flow reveals.
 *
 * That is why the OTP send below runs UNCONDITIONALLY once the program
 * itself checks out, whether or not a matching `pending_claims` row exists.
 * A response that only mails — and only pays the latency of an outbound
 * call to Supabase Auth — on a genuine match would leak the same fact two
 * ways at once: a different result AND a slower one. Mailing unconditionally
 * closes both, and it is not new exposure: `startClaim` already sends a bare
 * OTP link to any address paired with any program key, no session required
 * (see the `pending_claims` migration's own note that this is inherent to
 * magic links).
 *
 * The row itself stays conditional on a genuine match — but that condition
 * is expressed as ONE `UPDATE ... WHERE email = $1 AND program_key = $2 AND
 * expires_at >= now()`, issued every time, never skipped by a branch. There
 * is deliberately no separate `pending_claims` read before it: a lookup
 * followed by "run the write, or don't" reopens exactly the timing gap the
 * unconditional send above closed, just one query cheaper. Letting the
 * WHERE clause alone decide what it touches — one row, or none — costs the
 * same either way, so the two outcomes are indistinguishable again.
 */
export async function resendClaim(input: {
  programKey: string;
  email: string;
}): Promise<ActionOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Add an email address." };
  if (!input.programKey) return { ok: false, error: "We could not find that program." };

  // Read-only, same as startClaim's own program check, and for the same
  // reason: don't mail a link into a claim that can no longer be finished.
  // This is safe to answer plainly regardless of the address — the program's
  // status is already visible on /claim/[programKey].
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
  const { error } = await sendClaimOtp(supabase, email);

  if (error) {
    console.error("[claim] could not resend the link", { error: error.message });
    // Same shape as startClaim's own failure: plain, actionable, and not
    // pretending the countdown succeeded when it did not.
    return {
      ok: false,
      error: "We could not send the link. Check the address, or try again in a minute.",
    };
  }

  // AFTER the send, same ordering as startClaim: the row's life only extends
  // once mail has actually gone out. Unconditional, single-statement update
  // — see the doc comment above for why there is no preceding read. A miss
  // (wrong program, expired, or no row at all) simply affects zero rows;
  // single-use semantics for the eventual completion are unaffected either
  // way, since completeClaim still deletes the row exactly once regardless
  // of how many times the link inside it was re-sent.
  const expiresAt = new Date(Date.now() + PENDING_CLAIM_TTL_HOURS * 60 * 60 * 1000);
  const { error: pendingError } = await db
    .from("pending_claims")
    .update({ expires_at: expiresAt.toISOString() })
    .eq("email", email)
    .eq("program_key", input.programKey)
    .gte("expires_at", new Date().toISOString());

  if (pendingError) {
    console.error("[claim] could not extend the pending claim", {
      error: pendingError.message,
    });
    return {
      ok: false,
      error: "We could not start that setup. Try again in a moment.",
    };
  }

  return { ok: true };
}

export type CompleteClaimResult =
  | {
      ok: true;
      programKey: string;
      programId: string;
      schoolName: string;
      /** "mens" | "womens" — which of the two workspaces this claim made. */
      team: string;
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
    .select("school_name, team, primary_domain, athletics_domains, domain_match_skips_review")
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

  // The OTP exchange that landed us here may have just created this account
  // (`shouldCreateUser: true` in `sendClaimOtp`), and a claim that COMPLETED
  // has answered first-run onboarding's questions. Stamp `users.onboarded_at`
  // only now, after the RPC has actually made the claim — never on the
  // early returns above. Stamping before those guards marked a claimant whose
  // claim then failed (expired, unknown program, taken) as permanently
  // onboarded: persona never captured, /onboarding unreachable, while the
  // failure screen told them nothing was created. This still runs before the
  // verify route's redirect (to /claim/ready or /claim/review), so a later
  // visit to /dashboard cannot bounce a real owner into /onboarding. The
  // write is a trusted server path holding the service role, scoped to the
  // session's own row and only when still null; it must never ride in auth
  // metadata, which any signUp() caller with the anon key can craft to
  // pre-stamp itself.
  const { error: stampError } = await db
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  if (stampError) {
    // Best effort: a miss costs one redundant onboarding screen, not the claim.
    console.error("[claim] could not mark the claimant onboarded", {
      error: stampError.message,
    });
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
    team: program.team as string,
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
  /**
   * Already allowlisted by the caller — this column is read back by admins,
   * so it takes one of the five `CLAIM_ROLES` values or nothing, never free
   * text. `program_requests_role_check` enforces the same set in the database.
   */
  role?: ClaimRoleValue | null;
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
    role: row.role ?? null,
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
  /** One of `CLAIM_ROLES`, or absent. Anything else files as "no role". */
  role?: string;
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
    // Validated against the allowlist HERE, not trusted from the form. A value
    // off the list is not an error worth failing the request over — the field
    // is optional, so it degrades to the request that was always filed.
    role: toClaimRole(input.role),
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

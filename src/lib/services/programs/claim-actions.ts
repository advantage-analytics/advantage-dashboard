"use server";

import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendEmail,
  claimVerifyAddressEmail,
  inviteRequestReceivedEmail,
} from "@/lib/services/email";
import { programDisplayName } from "@/lib/data/programs-server";
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
 * So it lives server-side, and the emailed link now works from any device.
 * `pending_claims` has no constraint on the program, which is what keeps this
 * from reopening the denial of service the cookie was introduced to fix — see
 * the migration for the full argument.
 *
 * One address maps to more than one row, on purpose. The table is carved into
 * SLOTS by `pending_claims_email_claimant_key`: one anonymous slot per email
 * (`claimant_user_id` NULL — the signed-out flow's) plus one slot per
 * (email, claimant) pair (each signed-in account's own). Every start upserts
 * `onConflict: "email,claimant_user_id"`, so a start can only ever create or
 * replace ITS OWN slot — a signed-in stranger physically cannot displace a
 * mailbox owner's in-flight anonymous claim, which was the standing denial of
 * service when email alone was the key.
 *
 * Not Supabase user metadata: `signInWithOtp`'s `data` is applied on user
 * CREATION and is silently dropped for anyone who already has an account.
 */
const PENDING_CLAIM_TTL_HOURS = 24; // matches the link's own life

/**
 * Throttles for the SIGNED-IN start and resend only. The signed-out path
 * inherits Supabase's per-address and per-IP OTP limits with its magic link;
 * the signed-in path mails through our own sender, which imposes none — so
 * the limits are ours. One send per address per minute, and at most this many
 * live pending claims per account, bound how much mail one session can cause.
 */
const SIGNED_IN_RESEND_COOLDOWN_MS = 60_000;
const SIGNED_IN_MAX_ACTIVE_CLAIMS = 5;

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
    .select("status, school_name, team")
    .eq("program_key", input.programKey)
    .maybeSingle();

  if (!program) return { ok: false, error: "We could not find that program." };
  if (program.status !== "unclaimed") {
    return { ok: false, error: "Someone has already started setting up this program." };
  }

  const supabase = await createClient();

  // Signed in? Then the OTP below is the wrong tool: `shouldCreateUser: true`
  // would mint a fresh identity for the school address — or hand the session
  // to an existing one — and the program would land on an account the coach
  // never uses. The account they are holding is the account that must own the
  // program, so the mailbox is proven with a claim-scoped emailed token
  // instead; see `startClaimSignedIn`. The branch is decided by `getUser()`,
  // which verifies the session against the auth server — nothing the client
  // posts can steer it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return startClaimSignedIn(
      db,
      user,
      { programKey: input.programKey, fullName, role: input.role, email },
      programDisplayName(program.school_name as string, program.team as string | null)
    );
  }

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
      // The NULL claimant is not an omission — it is this row's identity.
      // Together with the conflict target below it aims the write at the
      // email's one ANONYMOUS slot: `pending_claims_email_claimant_key` is
      // NULLS NOT DISTINCT, so (email, NULL) collides with (email, NULL) and
      // nothing else. A signed-in claimant's row for the same address is a
      // different key entirely — this statement can neither inherit its
      // binding (the old lockout) nor overwrite it. Within the anonymous
      // slot, last start wins, as it always has: one mailbox, one anonymous
      // claim, and the mailbox owner — the only party who can complete it —
      // decides which link is live. The token columns stay null to satisfy
      // `pending_claims_binding_all_or_nothing`: anonymous rows carry no
      // binding at all.
      claimant_user_id: null,
      token_hash: null,
      token_program_key: null,
    },
    { onConflict: "email,claimant_user_id" }
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
 * The signed-in variant of `startClaim`. Same shape — prove the mailbox, THEN
 * create the claim — different proof.
 *
 * A magic link here would switch or mint identities, so instead a 256-bit
 * token goes to the school address and only its SHA-256 hash is stored, next
 * to the claimant's user id — written from the verified session, never
 * accepted from the form. Finishing the claim (`completeClaimWithToken`)
 * demands both halves: the token, which only the school mailbox received, and
 * a session for the account recorded here. Forwarded to anyone else, the link
 * is inert; without the link, the account can do nothing. Not module state and
 * not a cookie, for the same cross-device reason as the signed-out path — the
 * link must work from any device the coach can sign in on.
 *
 * Like the signed-out start, the upsert writes the ENTIRE row — but only the
 * caller's OWN (email, claimant) slot. A start never inherits another
 * start's binding and never displaces another party's: restarting replaces
 * this account's previous link for the address, and the superseded token
 * dies with its hash, while the anonymous slot and every other account's
 * slot stay exactly as their owners left them.
 *
 * Deliberately not exported: this is a branch of `startClaim`, not an action a
 * client may target with a claimant id of its choosing.
 */
async function startClaimSignedIn(
  db: ReturnType<typeof createAdminClient>,
  user: User,
  pending: PendingClaim,
  programName: string
): Promise<ActionOutcome> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Throttle one: a live link to this address from THIS account, sent less
  // than a minute ago, means wait — matching the resend timer the check-email
  // screen shows. Scoped to the caller's own slot, for two reasons at once:
  // other slots under the address are none of this start's business (it
  // cannot write them, so their clocks are irrelevant), and an answer keyed
  // on anyone else's row was an existence oracle — any signed-in caller could
  // probe "is this address mid-claim" by reading which error came back. Every
  // fact this returns is now about a row the caller's own session created.
  const { data: existing } = await db
    .from("pending_claims")
    .select("created_at, expires_at")
    .eq("email", pending.email)
    .eq("claimant_user_id", user.id)
    .maybeSingle();

  if (
    existing &&
    new Date(existing.expires_at as string).getTime() > now &&
    now - new Date(existing.created_at as string).getTime() < SIGNED_IN_RESEND_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: "We just sent a link to that address. Give it a minute, then try again.",
    };
  }

  // Throttle two: a cap on live pending claims per account, so one session
  // cannot fan mail out across the directory.
  const { count } = await db
    .from("pending_claims")
    .select("email", { count: "exact", head: true })
    .eq("claimant_user_id", user.id)
    .gt("expires_at", nowIso);

  if ((count ?? 0) >= SIGNED_IN_MAX_ACTIVE_CLAIMS) {
    return {
      ok: false,
      error:
        "You have several setups waiting on their links already. Finish one, or let one expire, then try again.",
    };
  }

  // The token rides only in the email; the database keeps the hash. A dump of
  // `pending_claims` therefore completes nothing — same posture as Supabase's
  // own OTP storage.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(now + PENDING_CLAIM_TTL_HOURS * 60 * 60 * 1000);

  // Row BEFORE mail — the opposite order to the signed-out path, and for the
  // same underlying reason: the link must never be somewhere the row isn't.
  // There the row rides behind Supabase's throttled send; here the send is
  // ours, so the hash has to exist before the only copy of the token leaves.
  const { error: pendingError } = await db.from("pending_claims").upsert(
    {
      email: pending.email,
      program_key: pending.programKey,
      full_name: pending.fullName,
      role: pending.role,
      claimant_user_id: user.id,
      token_hash: tokenHash,
      // In the SAME statement as the hash, always. This is what lets
      // completion prove the token it holds was issued for the program it is
      // about to hand over: `pending_claims_binding_all_or_nothing` pins it
      // to `program_key`, and `complete_program_claim_with_token` re-checks
      // the equality before writing anything. A later upsert that moved this
      // row to a different program necessarily rewrote or cleared the token
      // with it — so a genuine link can never be redirected onto a program
      // its recipient did not ask for.
      token_program_key: pending.programKey,
      created_at: nowIso,
      expires_at: expiresAt.toISOString(),
    },
    // The caller's OWN slot — (email, claimant_user_id), with the id written
    // from the verified session above. Starting over for a different program
    // replaces this account's claim on this address and nothing else: the
    // anonymous slot a signed-out claimant may be mid-flight on, and every
    // other account's slot, are different keys this statement cannot reach.
    { onConflict: "email,claimant_user_id" }
  );

  if (pendingError) {
    console.error("[claim] could not record the pending claim", {
      error: pendingError.message,
    });
    return { ok: false, error: "We could not start that setup. Try again in a moment." };
  }

  const sent = await sendEmail(
    claimVerifyAddressEmail({
      to: pending.email,
      programName,
      accountEmail: user.email ?? "your signed-in account",
      token,
    })
  );

  if (!sent.ok) {
    // Take the row back out: leaving it would start the one-minute cooldown
    // for a link that never left, and the claimant is standing right here.
    await db
      .from("pending_claims")
      .delete()
      .eq("email", pending.email)
      .eq("token_hash", tokenHash);
    console.error("[claim] could not send the verification link", { error: sent.error });
    return {
      ok: false,
      error: "We could not send the link. Check the address, or try again in a minute.",
    };
  }

  // The same opportunistic sweep the signed-out path runs.
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
    .select("status, school_name, team")
    .eq("program_key", input.programKey)
    .maybeSingle();

  if (!program) return { ok: false, error: "We could not find that program." };
  if (program.status !== "unclaimed") {
    return { ok: false, error: "Someone has already started setting up this program." };
  }

  const supabase = await createClient();

  // The same fork `startClaim` makes, decided by the same verified call. A
  // signed-in claimant's link is OUR token mail; re-sending Supabase's magic
  // link instead would, on click, exchange their session for the school
  // address — the exact identity switch the signed-in path exists to prevent.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return resendClaimSignedIn(db, user, {
      email,
      programKey: input.programKey,
      programName: programDisplayName(
        program.school_name as string,
        program.team as string | null
      ),
    });
  }

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
    // Only rows the signed-out flow itself created. A bound row belongs to
    // the account that started it; extending its life from a sessionless call
    // was pure attacker value — prolong a binding you don't own — and no
    // claimant value, since the signed-in resend above serves the row's
    // actual owner. The response is the unconditional `ok` either way, so
    // the narrower WHERE leaks nothing the wider one didn't.
    .is("claimant_user_id", null)
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

/**
 * Re-send for a claim the SIGNED-IN path started.
 *
 * Serves only rows bound to the calling account. That scoping is what makes
 * the differentiated answers below safe where `resendClaim`'s signed-out
 * branch must stay unconditional: every fact this returns is about a row the
 * caller's own session created. Rows bound to someone else, rows the
 * signed-out flow made, and rows that never existed all collapse into the
 * same "start again" — a probe learns nothing that is not already its own.
 *
 * Each send ROTATES the token: the new hash lands in the same guarded UPDATE
 * that bumps the clock, so exactly one link is ever live and the superseded
 * one dies with its hash. Binding columns are untouched — the row stays the
 * same claimant's, for the same program, which is why this cannot re-open
 * the start-path hijack. `created_at` doubles as the last-send marker, which
 * is what the cooldown reads.
 *
 * Not exported, same as `startClaimSignedIn`: a branch, not a target.
 */
async function resendClaimSignedIn(
  db: ReturnType<typeof createAdminClient>,
  user: User,
  input: { email: string; programKey: string; programName: string }
): Promise<ActionOutcome> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: row } = await db
    .from("pending_claims")
    .select("created_at, expires_at")
    .eq("email", input.email)
    .eq("program_key", input.programKey)
    .eq("claimant_user_id", user.id)
    .maybeSingle();

  if (!row || new Date(row.expires_at as string).getTime() <= now) {
    return {
      ok: false,
      error: "That setup is no longer waiting on a link. Start it again from the program page.",
    };
  }

  if (now - new Date(row.created_at as string).getTime() < SIGNED_IN_RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      error: "We just sent a link to that address. Give it a minute, then try again.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(now + PENDING_CLAIM_TTL_HOURS * 60 * 60 * 1000);

  // Hash BEFORE mail, same as the start. The WHERE repeats every condition
  // the read used, so a row re-bound or spent between the two matches
  // nothing and nothing is sent — `.select()` is how we know which happened.
  const { data: rotated, error: rotateError } = await db
    .from("pending_claims")
    .update({
      token_hash: tokenHash,
      created_at: nowIso,
      expires_at: expiresAt.toISOString(),
    })
    .eq("email", input.email)
    .eq("program_key", input.programKey)
    .eq("claimant_user_id", user.id)
    .gte("expires_at", nowIso)
    .select("email");

  if (rotateError || !rotated?.length) {
    if (rotateError) {
      console.error("[claim] could not rotate the pending claim", {
        error: rotateError.message,
      });
    }
    return { ok: false, error: "We could not start that setup. Try again in a moment." };
  }

  const sent = await sendEmail(
    claimVerifyAddressEmail({
      to: input.email,
      programName: input.programName,
      accountEmail: user.email ?? "your signed-in account",
      token,
    })
  );

  if (!sent.ok) {
    // The rotation already retired the previous link, so there is nothing to
    // fall back to — and that is fine: the claimant is on the check-email
    // screen, and "in a minute" is exactly the cooldown that just restarted.
    console.error("[claim] could not resend the verification link", { error: sent.error });
    return {
      ok: false,
      error: "We could not send the link. Try again in a minute.",
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
  | "failed"
  // The two endings only the signed-in token path can reach.
  | "sign-in-first"
  | "wrong-account";

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
  //
  // And ONLY the anonymous slot. An OTP session for this address is proof of
  // the mailbox itself, and the anonymous slot is the one row that proof
  // completes — rows other accounts bound to the same address complete
  // through their own emailed tokens (`completeClaimWithToken`) and are not
  // even visible here. That is the other half of the DoS fix: a stranger's
  // signed-in start used to overwrite THE row for the email and its binding
  // then turned this very lookup away (`no-pending`) for as long as the
  // stranger cared to repeat it. Now the proven mailbox owner's claim is a
  // row no stranger's statement can touch, so there is no foreign binding
  // left to guard against — the old claimant check fell out with it.
  const { data: row } = await db
    .from("pending_claims")
    .select("program_key, full_name, role, expires_at")
    .eq("email", email)
    .is("claimant_user_id", null)
    .maybeSingle();

  if (!row) return { ok: false, reason: "no-pending" };

  if (new Date(row.expires_at as string) < new Date()) {
    await db
      .from("pending_claims")
      .delete()
      .eq("email", email)
      .is("claimant_user_id", null);
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
  // the claimant already owns. Scoped to the anonymous slot this path just
  // spent — other accounts' claims on the same address are theirs to finish
  // or let expire.
  await db
    .from("pending_claims")
    .delete()
    .eq("email", email)
    .is("claimant_user_id", null);

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

/**
 * Finish a SIGNED-IN claim after the emailed link is clicked.
 *
 * Two proofs, and both are required. The token — 256 bits, sent only to the
 * school address, matched here by hash — proves the mailbox. The session,
 * verified by `getUser()`, proves the person, and must be the same account
 * that started the claim. So a forwarded link completes nothing, a stolen
 * session completes nothing, and nothing in the URL selects WHOSE claim this
 * is or WHICH program it settles — the token merely proves possession of the
 * one email we sent, and the row it hashes to decided everything else when
 * the claim started.
 *
 * The reads here exist to compute the domain-match evidence and the screen
 * copy; the authoritative token, binding, issued-program and expiry checks
 * run AGAIN inside `complete_program_claim_with_token`, atomically with the
 * writes and the single-use delete. That RPC is executable by the service
 * role alone — it has no `auth.email()` gate of its own, so it must never be
 * reachable from a browser, with these or any arguments.
 */
export async function completeClaimWithToken(
  token: string
): Promise<CompleteClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unlike the signed-out landing, no session here is an ordinary state — the
  // school mailbox is usually read on a device that has never seen this app.
  // The link stays live; the screen says to sign in and click it again.
  if (!user) return { ok: false, reason: "sign-in-first" };

  // Shape check only — a wrong token fails the hash lookup regardless. This
  // just keeps garbage from paying for a database round trip.
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    return { ok: false, reason: "no-pending" };
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const db = createAdminClient();
  const { data: row } = await db
    .from("pending_claims")
    .select("email, program_key, claimant_user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row) return { ok: false, reason: "no-pending" };
  if (row.claimant_user_id !== user.id) return { ok: false, reason: "wrong-account" };
  if (new Date(row.expires_at as string) < new Date()) {
    // By hash, not by email: this token's row is the only one it may spend.
    // An email-wide delete here would let one expired signed-in link consume
    // the anonymous slot a signed-out claimant is still mid-flight on.
    await db.from("pending_claims").delete().eq("token_hash", tokenHash);
    return { ok: false, reason: "expired" };
  }

  const email = (row.email as string).trim().toLowerCase();

  const { data: program } = await db
    .from("programs")
    .select("school_name, team, primary_domain, athletics_domains, domain_match_skips_review")
    .eq("program_key", row.program_key)
    .maybeSingle();

  if (!program) return { ok: false, reason: "unknown-program" };

  // Against the address the token proved — the school one — never the login
  // address the session happens to carry.
  const check = checkClaimEmail(email, program);

  const { data, error } = await db.rpc("complete_program_claim_with_token", {
    p_claimant_user_id: user.id,
    p_token_hash: tokenHash,
    p_domain_matched: check.domainMatched,
    p_skips_manual_review: check.skipsManualReview,
    p_match_reason: check.reason,
  });

  if (error) {
    console.error("[claim] signed-in completion failed", { error: error.message });
    return { ok: false, reason: "failed" };
  }

  // Flow-control failures come back as a coded jsonb, re-checked atomically —
  // the reads above may be a resend or a click stale by the time the RPC runs.
  const rpc = data as (Partial<ClaimRpcResult> & { error?: string }) | null;
  if (rpc?.error) {
    const known: ClaimFailure[] = [
      "no-pending",
      "wrong-account",
      "expired",
      "unknown-program",
      "taken",
    ];
    return {
      ok: false,
      reason: known.includes(rpc.error as ClaimFailure)
        ? (rpc.error as ClaimFailure)
        : "failed",
    };
  }

  // Same stamp `completeClaim` applies, for the same reason: a claim that
  // COMPLETED has answered first-run onboarding's questions, and a completed
  // owner must never bounce into /onboarding on their next dashboard visit.
  // Most signed-in claimants predate this flow and are stamped already — the
  // `is null` guard makes that a no-op — but onboarding itself routes fresh
  // coaches here, and those arrive with the column still empty.
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

  return {
    ok: true,
    programKey: row.program_key as string,
    programId: rpc?.program_id ?? "",
    schoolName: program.school_name as string,
    team: program.team as string,
    email,
    alreadyOwned: Boolean(rpc?.already_owned),
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

/** The bits of a program the request actions need, resolved from its key. */
async function programForKey(
  programKey: string
): Promise<{ id: string; schoolName: string; team: string | null } | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("programs")
    .select("id, school_name, team")
    .eq("program_key", programKey)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    schoolName: data.school_name as string,
    team: (data.team as string | null) ?? null,
  };
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

  const program = await programForKey(input.programKey);
  if (!program) return { ok: false, error: "We could not find that program." };

  // The FILING is unchanged from before this email existed — same row, same
  // normalisation, same idempotent collapse of repeats — signed in or out.
  // Only the receipt below is new, and it is gated so it can change nothing
  // about how or when the row is written.
  const filed = await fileRequest({
    kind: "invite_request",
    programId: program.id,
    email,
    name: input.name,
    // Validated against the allowlist HERE, not trusted from the form. A value
    // off the list is not an error worth failing the request over — the field
    // is optional, so it degrades to the request that was always filed.
    role: toClaimRole(input.role),
    note: input.note,
  });

  if (!filed.ok) return filed;

  // The receipt — deliberately NOT a mail relay, and deliberately NOT a timing
  // oracle. This action is anonymous and unauthenticated: mailing whatever
  // address the form carried would let anyone send our mail to any inbox, and
  // gating the send on "did this call create a new request row" would leak,
  // through timing, whether that (address, program) pair already had one open.
  //
  // So the send turns on TWO facts, and BOTH are about the CALLER alone:
  //
  //   1. there is a signed-in session — `getUser()` verifies it against the
  //      auth server, so nothing posted from the form can fake it; and
  //   2. the address typed into the form is that session's OWN account email,
  //      compared case-insensitively.
  //
  // A signed-out requester, or a signed-in one who typed someone else's
  // address, gets the on-screen confirmation and no mail. The receipt can
  // therefore only ever reach an address its caller has already proven they
  // control — never an arbitrary, unverified inbox. And because the decision
  // reads only the session and the typed address — never a `program_requests`
  // lookup — a first submission and a duplicate submission are identical in
  // both timing and result: nothing here reveals whether a row already existed.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountEmail = user?.email?.trim();
  if (accountEmail && accountEmail.toLowerCase() === email.toLowerCase()) {
    const sent = await sendEmail(
      inviteRequestReceivedEmail({
        // The verified account address itself — provably the caller's own,
        // never anything the form could have steered.
        to: accountEmail,
        programName: programDisplayName(program.schoolName, program.team),
        // Optional on the form, so the greeting has to survive without it.
        requesterName: input.name?.trim() || null,
      })
    );

    if (!sent.ok) {
      // The row is what matters and it is already written — staff can act on
      // the request whether or not the receipt arrived. `sendEmail` logged the
      // technical cause; this names the request that went unacknowledged.
      console.warn("[claim] invite-request receipt not sent", {
        programKey: input.programKey,
      });
    }
  }

  return { ok: true };
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

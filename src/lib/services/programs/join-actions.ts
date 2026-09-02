"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassword } from "@/lib/auth/error-messages";
import { WORKSPACE_COOKIE } from "@/lib/workspace/active-workspace-server";
import { expiredInviteNudgeEmail, sendEmail } from "@/lib/services/email";
import {
  acceptPendingWithSession,
  acceptWithSession,
  accountExists,
  loadInvite,
  resolveJoinState,
  type AcceptOutcome,
  type InviteRecord,
} from "./invite-acceptance";
import { joinHref, signInThenHref } from "./join-links";

/**
 * The ways an invitation is accepted, and the one that is refused.
 *
 * Which one a person takes depends on what they already have — a session, or
 * neither session nor account — and `resolveJoinState` decides that. The third
 * case, an account with no session, is not served from this file at all: the
 * page redirects it to `/login?next=`, and it comes back holding a session as
 * the first case. Every accept finishes through `acceptWithSession` or its
 * by-id twin, so the row is re-checked at the moment of the write.
 *
 * ── The rule that matters most ──────────────────────────────────────────────
 * An invitation link may create an account. It may NEVER change the password
 * of an account that already exists. Those look like the same "set your
 * password" box and they are not: the second one is a password reset triggered
 * by anyone who can read the invited person's mail, forwarded mail included.
 * That is account takeover with a friendly wrapper, so an existing account is
 * sent to `/login` and nowhere else — this file no longer holds a password of
 * theirs even for a moment, because the sign-in happens on the page that owns
 * sessions. Password resets have their own flow, which proves control of the
 * mailbox at the moment of the reset rather than up to fourteen days earlier.
 *
 * One action here accepts nothing: `requestFreshInvite` asks the coach who sent
 * an expired invitation to send another. It is the only one reachable without a
 * session, and its own header says what that costs it.
 */

export type JoinActionResult = { ok: false; error: string };

/**
 * Everything a failed accept can say, in the words the screen should use.
 *
 * Worded for both doors. The link door has a link and the id door — the
 * header's tray, the onboarding intercept — never did, so nothing here tells
 * the reader to open one.
 */
function describe(outcome: Extract<AcceptOutcome, { ok: false }>): string {
  switch (outcome.status) {
    case "not_found":
      return "That invitation isn't valid any more.";
    case "expired":
      return "That invitation has expired. Ask your coach to send another.";
    case "already_used":
      return "That invitation has already been used.";
    case "wrong_address":
      return "That invitation was sent to a different address.";
    case "unconfirmed":
      // Only the id door says this. The link is itself proof of the address;
      // without one, the session's confirmation is the only proof there is.
      return "Confirm your email address, then open this invitation again.";
    case "no_seats":
      // The one refusal the person reading it cannot act on themselves, so it
      // names who can.
      return "This program has no seats free. Ask your coach to free one, then try again.";
    case "already_claimed":
      return "Somebody has already taken over that roster profile. Ask your coach to check the roster.";
    case "player_gone":
      return "That roster profile is no longer on the program. Ask your coach for a new invitation.";
    case "error":
      return outcome.message;
    default:
      // Exhaustive above. A status the database grows and this file has not
      // learned yet should say something true rather than nothing.
      return "That invitation could not be accepted.";
  }
}

/**
 * Land them inside the program they just joined, not on their personal home.
 *
 * Written directly rather than through `setActiveWorkspace`, which re-resolves
 * the workspace list to validate the id. That list is memoised per request and
 * was already built before the membership row existed, so it would not contain
 * the new program and the switch would be silently dropped — the person would
 * accept an invitation and arrive at their own empty dashboard. The membership
 * has just been written by a SECURITY DEFINER function that checked the token,
 * so the id needs no second validation here.
 */
async function activate(programId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, programId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/dashboard", "layout");
}

/** Where every successful accept ends: inside the program, on the team page. */
async function finishJoin(programId: string): Promise<never> {
  await activate(programId);
  redirect("/dashboard/team");
}

/**
 * The persona an invitation implies, for a profile that has not chosen one.
 *
 * `users.role` is a persona (`PERSONA_ROLES` in settings/actions.ts: player,
 * coach, parent, academy), not a program role, so `staff` lands as "coach" —
 * the persona the profile form offers someone who runs a program rather than
 * plays for one. A `const` record, looked up by own property only: a bare
 * index would resolve prototype keys, and a role the database grows later
 * should write nothing rather than something.
 */
const PERSONA_FOR_ROLE = {
  player: "player",
  coach: "coach",
  staff: "coach",
} as const;

/**
 * What a new membership settles about the profile, written once for every
 * door.
 *
 * A membership answers both first-run questions, so a just-joined member is
 * marked onboarded — otherwise the layout at `src/app/dashboard/layout.tsx`
 * would bounce them into /onboarding to ask what the invitation already
 * settled — and given the persona the invitation implies, each only where the
 * profile has nothing yet. The persona is read back off the membership the
 * database just wrote, never passed in: the row came from a SECURITY DEFINER
 * function using the invitation's own `role`, so this is the one place the
 * answer cannot have been chosen by the caller. All three doors call this, so
 * an account joining through the link is not left with a persona it can only
 * fill in by hand while one joining from the tray is not.
 *
 * Called only AFTER an accept confirmed the membership, never merely because
 * an account was created: stamping earlier left an account whose accept then
 * failed permanently marked onboarded with no membership behind it, and a
 * failed accept should leave /onboarding reachable. A trusted server path
 * holding the service role, not auth metadata a crafted signup could imitate.
 * Best effort throughout: a miss costs one redundant onboarding screen or a
 * blank persona field, never the membership.
 */
async function adoptMembership(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  programId: string
): Promise<void> {
  // The stamp and the read-back share no data, so they go out together; only
  // the persona write waits on the read.
  const [{ error: stampError }, { data: membership, error: memberError }] =
    await Promise.all([
      admin
        .from("users")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", userId)
        .is("onboarded_at", null),
      admin
        .from("program_members")
        .select("role")
        .eq("program_id", programId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (stampError) {
    console.error("[join] could not mark the account onboarded", {
      message: stampError.message,
    });
  }
  if (memberError) {
    console.error("[join] could not read the new membership", {
      message: memberError.message,
    });
  }

  const memberRole = (membership?.role as string | null | undefined) ?? null;
  const persona =
    memberRole !== null &&
    Object.prototype.hasOwnProperty.call(PERSONA_FOR_ROLE, memberRole)
      ? PERSONA_FOR_ROLE[memberRole as keyof typeof PERSONA_FOR_ROLE]
      : null;
  if (!persona) return;

  const { error: roleError } = await admin
    .from("users")
    .update({ role: persona })
    .eq("id", userId)
    .is("role", null);
  if (roleError) {
    console.error("[join] could not set the account's persona", {
      message: roleError.message,
    });
  }
}

/** Already signed in as the invited address. Nothing to collect. */
export async function acceptInvite(token: string): Promise<JoinActionResult> {
  const supabase = await createClient();
  // The session read depends on nothing the accept returns, so the two
  // round trips overlap rather than queue.
  const [outcome, { data: { user } }] = await Promise.all([
    acceptWithSession(token, supabase),
    supabase.auth.getUser(),
  ]);
  if (!outcome.ok) return { ok: false, error: describe(outcome) };

  if (user?.id) {
    await adoptMembership(createAdminClient(), user.id, outcome.programId);
  }
  return finishJoin(outcome.programId);
}

/** RFC 4122 shape, any version — what `program_invites.id` is generated as. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accept an invitation by id — the door for someone who is signed in and never
 * had the link.
 *
 * One argument, on purpose. The program and the role both come from the
 * database AFTER `accept_pending_invite` has bound the row to the caller's
 * confirmed address: the program from the outcome, the role read back off the
 * membership the function just wrote (see `adoptMembership`). A `role`
 * argument here would let anyone who can call a server action pick their own
 * persona, and this action is reachable by anybody with a session.
 *
 * The id is checked for shape before the database sees it. A malformed one
 * would be refused there too — as a cast error, logged and reported as "we
 * couldn't finish that", for something that was never our failure.
 */
export async function acceptPendingInvite(
  inviteId: string
): Promise<JoinActionResult> {
  if (!UUID_PATTERN.test(inviteId)) {
    return { ok: false, error: "That invitation isn't available." };
  }

  const supabase = await createClient();
  const [outcome, { data: { user } }] = await Promise.all([
    acceptPendingWithSession(inviteId, supabase),
    supabase.auth.getUser(),
  ]);
  if (!outcome.ok) return { ok: false, error: describe(outcome) };

  if (user?.id) {
    await adoptMembership(createAdminClient(), user.id, outcome.programId);
  }
  return finishJoin(outcome.programId);
}

/**
 * No account yet. Create one, confirmed, and join in the same step.
 *
 * `email_confirm: true` skips the confirmation mail, and that is correct rather
 * than a shortcut: possession of this token already proves control of the
 * address, because the token was only ever sent there. Mailing a second link to
 * the same inbox to prove the same fact costs a step and buys nothing.
 *
 * It is also why this path is gated on `sign_up`. If an account existed, the
 * same reasoning would let a token-holder set its password — see the header.
 */
export async function createAccountAndAccept(
  token: string,
  input: { firstName: string; lastName: string; password: string }
): Promise<JoinActionResult> {
  const state = await resolveJoinState(token);
  if (state.kind !== "sign_up") {
    return { ok: false, error: "That link can't be used that way." };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { ok: false, error: "Add your first name." };

  const passwordProblem = validatePassword(input.password);
  if (passwordProblem) return { ok: false, error: passwordProblem };

  // Re-checked immediately before the write, not just in `resolveJoinState`.
  // Two tabs on the same link, or a sign-up finishing elsewhere in between,
  // would otherwise reach `createUser` with an address that now exists — which
  // fails anyway, but with a message written for whoever holds the API key.
  if (await accountExists(state.email)) {
    return {
      ok: false,
      error: "There's already an account for that address. Sign in instead.",
    };
  }

  const admin = createAdminClient();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: state.email,
    password: input.password,
    email_confirm: true,
    // `handle_new_user` reads `full_name` to split the profile's first and last
    // name. Anything else here is ignored by that trigger — deliberately: it is
    // SECURITY DEFINER, and GoTrue metadata is writable by any signUp() caller
    // with the anon key, so nothing trust-bearing may ride in it.
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    console.error("[join] could not create the account", {
      message: createError.message,
    });
    return { ok: false, error: "We couldn't create that account. Try again." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: state.email,
    password: input.password,
  });

  if (signInError) {
    // The account is real and the password is theirs, so this is recoverable
    // by signing in — which is what the next page load will offer them, since
    // `resolveJoinState` now answers `sign_in`.
    return {
      ok: false,
      error: "Your account is ready — sign in to finish joining.",
    };
  }

  const outcome = await acceptWithSession(token, supabase);
  if (!outcome.ok) return { ok: false, error: describe(outcome) };

  // Only now — after `acceptWithSession` confirmed the membership, never merely
  // because `createUser` succeeded. See `adoptMembership` for why that order is
  // the whole point.
  if (created?.user?.id) {
    await adoptMembership(admin, created.user.id, outcome.programId);
  }
  return finishJoin(outcome.programId);
}

// ---------------------------------------------------------------------------
// 9.2a — "or we can nudge her for you"
// ---------------------------------------------------------------------------

export type NudgeResult = { ok: true } | { ok: false; error: string };

/**
 * An expired link asks the coach who sent it for a replacement.
 *
 * The only action on this page reachable without a session, which is what
 * shapes every decision in it:
 *
 * **The recipient is never named by the caller.** It is read off
 * `program_invites.invited_by` for the row this token hashes to. There is no
 * input to this function but the token, so there is no address a caller can
 * substitute — the endpoint can mail exactly one person, the one who already
 * chose to mail them.
 *
 * **It mails at most once.** The durable half is a `program_requests` row, and
 * `program_requests_open_unique` — `(kind, program_id, lower(email))` where the
 * row is still open — is what makes that true: the second click loses the
 * insert, so the send under it never runs. Without that, a link anyone in a
 * forwarded mail thread can open would be a button that mails a coach on every
 * press. The row is also the fallback when the send fails: an invite request in
 * the review queue is a person a human can still reach.
 *
 * **It answers the same way every time.** Whether the invitation has an inviter
 * left on it, whether the mail was accepted, suppressed or refused, and whether
 * this is the first ask or the fifth all return the same `{ ok: true }`. The
 * only other answer is for a token that is not an expired invitation, which the
 * page rendering that token already said out loud — so it tells a caller
 * nothing the URL had not. (A repeat ask does return sooner, having no mail to
 * wait on. That is a fact about the caller's own earlier click on their own
 * token, not about any row they cannot see.)
 *
 * Nothing about the invitation moves: not `accepted_at`, not `expires_at`. A
 * replacement is minted by the coach, from the roster, or not at all.
 */
export async function requestFreshInvite(
  token: string
): Promise<NudgeResult> {
  const state = await resolveJoinState(token);
  if (state.kind !== "expired") {
    return { ok: false, error: "That link can't be used that way." };
  }

  const invite = await loadInvite(token);
  if (!invite) return { ok: false, error: "That link can't be used that way." };

  const db = createAdminClient();
  const { error } = await db.from("program_requests").insert({
    kind: "invite_request",
    program_id: invite.programId,
    // The invitation's own address, lowercased by `loadInvite`. It is both who
    // the coach should re-invite and the key the unique index dedupes on.
    email: invite.email,
    note: "Opened an expired invitation and asked for a new one.",
  });

  if (error) {
    // 23505 is the partial unique index: they have already asked, the queue
    // already holds it, and the coach has already been mailed. Same answer, no
    // second mail.
    if (error.code !== "23505") {
      console.error("[join] could not file an invite request", {
        message: error.message,
      });
      return { ok: false, error: "We couldn't record that. Try again." };
    }
    return { ok: true };
  }

  await nudgeInviter(invite);
  return { ok: true };
}

/**
 * Tell the coach, best effort.
 *
 * Never fails the action, matching `inviteMember`: the request row is already
 * written and is what a human recovers from. `sendEmail` does not throw, so
 * there is nothing to catch — only a result worth a line in the log, without
 * the address in it.
 */
async function nudgeInviter(invite: InviteRecord): Promise<void> {
  // `invited_by` is `on delete set null`. A coach who left the product cannot
  // be nudged, and the request row is the whole of what happens.
  if (!invite.invitedBy) return;

  const db = createAdminClient();
  const { data } = await db
    .from("users")
    .select("email")
    .eq("id", invite.invitedBy)
    .maybeSingle();

  const to = (data?.email as string | null)?.trim();
  if (!to) return;

  const sent = await sendEmail(
    expiredInviteNudgeEmail({
      to,
      programName: invite.programName,
      inviteeEmail: invite.email,
      expiredOn: new Date(invite.expiresAt),
    })
  );

  if (!sent.ok) {
    console.warn("[join] invite nudge not delivered", { message: sent.error });
  }
}

/**
 * Sign out of the wrong account, and land on the step that fixes it.
 *
 * Signing out and returning to `/join/[token]` was a loop for an address that
 * already had an account: the page would resolve `sign_in` for a person who
 * now had no session, and tell them to sign in — which is what `/login?next=`
 * does, one step earlier, with the token still attached so acceptance is
 * waiting on the far side. But `wrong_account` is returned for ANY signed-in
 * mismatch, including an invited address that has no account at all, and for
 * that person `/login` is a wall: it cannot create an account and its sign-up
 * link carries no token. So the sign-out runs first either way, and then the
 * destination is chosen the way the page itself would choose it — an existing
 * account goes to sign in, a new one goes straight back to this link, which
 * now answers `sign_up` and offers the form. Only a token that no longer names
 * an invitation loses the `next` and lands on a plain `/login`.
 */
export async function signOutForInvite(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const invite = await loadInvite(token);
  if (!invite) redirect("/login");

  redirect(
    (await accountExists(invite.email))
      ? signInThenHref(joinHref(token))
      : joinHref(token)
  );
}

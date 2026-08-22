"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassword } from "@/lib/auth/error-messages";
import { WORKSPACE_COOKIE } from "@/lib/workspace/active-workspace-server";
import {
  acceptWithSession,
  accountExists,
  loadInvite,
  resolveJoinState,
  type AcceptOutcome,
} from "./invite-acceptance";

/**
 * The three ways an invitation is accepted, and the one that is refused.
 *
 * Which one a person takes depends on what they already have — a session, an
 * account, or neither — and `resolveJoinState` decides that. Every one of them
 * finishes through `acceptWithSession`, so the token is re-checked against the
 * live row at the moment of the write.
 *
 * ── The rule that matters most ──────────────────────────────────────────────
 * An invitation link may create an account. It may NEVER change the password
 * of an account that already exists. Those look like the same "set your
 * password" box and they are not: the second one is a password reset triggered
 * by anyone who can read the invited person's mail, forwarded mail included.
 * That is account takeover with a friendly wrapper, so an existing account is
 * sent to a sign-in field and nowhere else. Password resets have their own
 * flow, which proves control of the mailbox at the moment of the reset rather
 * than up to fourteen days earlier.
 */

export type JoinActionResult = { ok: false; error: string };

/** Everything a failed accept can say, in the words the screen should use. */
function describe(outcome: Extract<AcceptOutcome, { ok: false }>): string {
  switch (outcome.status) {
    case "not_found":
      return "That invitation link isn't valid any more.";
    case "expired":
      return "That invitation has expired. Ask your coach to send another.";
    case "already_used":
      return "That invitation has already been used.";
    case "wrong_address":
      return "That invitation was sent to a different address.";
    case "no_seats":
      // The one refusal the person reading it cannot act on themselves, so it
      // names who can.
      return "This program has no seats free. Ask your coach to free one, then open this link again.";
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

/** Already signed in as the invited address. Nothing to collect. */
export async function acceptInvite(token: string): Promise<JoinActionResult> {
  const outcome = await acceptWithSession(token);
  if (!outcome.ok) return { ok: false, error: describe(outcome) };

  await activate(outcome.programId);
  redirect("/dashboard/team");
}

/**
 * An account exists. Sign in with the password they already have, then join.
 *
 * The address comes from the invitation, never from the form. There is no
 * email field on this screen for exactly that reason: an invitation is bound
 * to one address, and letting the browser name a different one would turn a
 * join link into a generic sign-in form that happens to grant membership.
 */
export async function signInAndAccept(
  token: string,
  password: string
): Promise<JoinActionResult> {
  const state = await resolveJoinState(token);
  if (state.kind !== "sign_in") {
    return { ok: false, error: "That link can't be used that way." };
  }

  if (!password) return { ok: false, error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: state.email,
    password,
  });

  if (error) {
    // Deliberately not "wrong password" versus "no such account" — the state
    // machine already established the account exists, and echoing which half
    // failed is a habit worth not forming.
    return { ok: false, error: "That password doesn't match this account." };
  }

  const outcome = await acceptWithSession(token, supabase);
  if (!outcome.ok) return { ok: false, error: describe(outcome) };

  await activate(outcome.programId);
  redirect("/dashboard/team");
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

  const { error: createError } = await admin.auth.admin.createUser({
    email: state.email,
    password: input.password,
    email_confirm: true,
    // `handle_new_user` reads `full_name` to split the profile's first and last
    // name. Anything else here is ignored by that trigger.
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

  await activate(outcome.programId);
  redirect("/dashboard/team");
}

/** Sign out, so a link opened under the wrong account can be opened again. */
export async function signOutForInvite(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const invite = await loadInvite(token);
  redirect(invite ? `/join/${encodeURIComponent(token)}` : "/login");
}

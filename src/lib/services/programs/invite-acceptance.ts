import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { programDisplayName } from "@/lib/data/programs-server";
import { hashToken } from "./tokens";

/**
 * Reading an invitation, and deciding which screen the link opens.
 *
 * SERVER ONLY. Everything here runs with the service-role client, because the
 * invitee can read none of it themselves and that is deliberate:
 * `program_invites` grants select to program staff, and someone being invited
 * is by definition not staff yet. The raw token is what proves they are the
 * intended recipient, and it is never sent to the database — only its SHA-256
 * hash, matched against the unique index.
 *
 * The state machine is here rather than in the page so the page renders and
 * nothing else, and so the actions can re-derive the same answer on submit
 * instead of trusting whatever the browser posts back.
 */

/** Mirrors `program_invites_role_check`. Owner moves by transfer, not invite. */
export type JoinRole = "coach" | "staff" | "player";

export type JoinState =
  /** No invitation with that token. Revoked, mistyped, or never existed. */
  | { kind: "not_found" }
  | { kind: "expired"; programName: string }
  | { kind: "already_used"; programName: string }
  /**
   * A session exists, but for a different address than the one invited.
   *
   * Its own state rather than a variant of `sign_in`, because the way out is
   * different: this person has to sign out first, and telling them that is the
   * whole job of the screen.
   */
  | {
      kind: "wrong_account";
      programName: string;
      invitedEmail: string;
      signedInAs: string;
    }
  /** Signed in as the invited address. One button between them and the roster. */
  | { kind: "ready"; programName: string; role: JoinRole; email: string }
  /**
   * An account already exists for the invited address, and nobody is signed in.
   *
   * They sign in with the password they already have. They are NOT offered a
   * new one — see `createAccountAndAccept` for why that distinction is the
   * most important line in this feature.
   */
  | { kind: "sign_in"; programName: string; role: JoinRole; email: string }
  /** No account yet. Name and password, and they are in. */
  | { kind: "sign_up"; programName: string; role: JoinRole; email: string };

export interface InviteRecord {
  id: string;
  programId: string;
  programName: string;
  email: string;
  role: JoinRole;
  expiresAt: string;
  acceptedAt: string | null;
}

/**
 * The invitation behind a raw token, or null.
 *
 * Two queries rather than one PostgREST embed. The embed would work, but it
 * depends on relationship inference that is invisible at the call site and
 * silently returns null for the nested object when it stops resolving — and
 * the program's name is what every screen below is built around.
 */
export async function loadInvite(token: string): Promise<InviteRecord | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("program_invites")
    .select("id, program_id, email, role, expires_at, accepted_at")
    .eq("token_hash", hashToken(trimmed))
    .maybeSingle();

  if (!invite) return null;

  const { data: program } = await admin
    .from("programs")
    .select("school_name, team")
    .eq("id", invite.program_id as string)
    .maybeSingle();

  return {
    id: invite.id as string,
    programId: invite.program_id as string,
    programName: program
      ? programDisplayName(
          program.school_name as string,
          program.team as string | null
        )
      : "your program",
    email: (invite.email as string).toLowerCase(),
    role: invite.role as JoinRole,
    expiresAt: invite.expires_at as string,
    acceptedAt: invite.accepted_at as string | null,
  };
}

/**
 * Does an account already exist for this address?
 *
 * Reads `public.users` rather than paging `auth.admin.listUsers()`, which is
 * paginated and would be a full scan per page load. The `handle_new_user`
 * trigger writes that row inside the same transaction as the auth user, so the
 * two cannot disagree.
 *
 * `ilike` and not `eq`, because `users.email` is not stored lowercased — the
 * same trap `admin-actions.ts` documents. Underscores and percent signs are
 * escaped first: both are wildcards to `ilike`, and an address containing one
 * would otherwise match somebody else's account.
 */
export async function accountExists(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const pattern = email.replace(/[\\%_]/g, (char) => `\\${char}`);

  const { data } = await admin
    .from("users")
    .select("id")
    .ilike("email", pattern)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

/** Which screen this link opens, for the person opening it right now. */
export async function resolveJoinState(token: string): Promise<JoinState> {
  const invite = await loadInvite(token);
  if (!invite) return { kind: "not_found" };

  const { programName, role, email } = invite;

  // Same order as `accept_program_invite`, and for the same reason: "you
  // already did this" is more use to someone than "it expired" when both are
  // true, because only one of them has an action attached.
  if (invite.acceptedAt) return { kind: "already_used", programName };
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    return { kind: "expired", programName };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const signedInAs = (user.email ?? "").toLowerCase();
    if (signedInAs === email) {
      return { kind: "ready", programName, role, email };
    }
    return {
      kind: "wrong_account",
      programName,
      invitedEmail: email,
      signedInAs,
    };
  }

  return {
    kind: (await accountExists(email)) ? "sign_in" : "sign_up",
    programName,
    role,
    email,
  };
}

/**
 * Hand the token to the database and take the answer it gives.
 *
 * Every path ends here, including the ones that just created an account, so
 * the checks live in exactly one place — expiry, prior use and address binding
 * are re-tested against the row at the moment of the write rather than against
 * whatever `resolveJoinState` saw when the page rendered. A link that expires
 * while the form is open is refused, not honoured.
 */
export type AcceptOutcome =
  | { ok: true; programId: string }
  | { ok: false; status: "not_found" | "expired" | "already_used" | "wrong_address" }
  | { ok: false; status: "error"; message: string };

/**
 * `client` is passed by the paths that have just established a session.
 *
 * `signInWithPassword` writes the auth cookies through the client it was called
 * on; a second `createClient()` in the same request has to re-read them from
 * the cookie store to see the session at all. That works, but it depends on
 * write-then-read visibility inside one request — a subtlety that would fail as
 * "accepted, then bounced to sign-in", intermittently, and only for people
 * signing up. Handing the same client through removes the question.
 */
export async function acceptWithSession(
  token: string,
  client?: Awaited<ReturnType<typeof createClient>>
): Promise<AcceptOutcome> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .rpc("accept_program_invite", { p_token_hash: hashToken(token.trim()) })
    .maybeSingle();

  if (error) {
    // Never logs the token. It is a live credential to a program, and a server
    // log is the one place people paste into a ticket without thinking.
    console.error("[join] accept failed", { message: error.message });
    return { ok: false, status: "error", message: "We couldn't finish that. Try again." };
  }

  const row = data as { status: string; program_id: string | null } | null;
  if (!row) {
    return { ok: false, status: "error", message: "We couldn't finish that. Try again." };
  }

  if (row.status === "ok" && row.program_id) {
    return { ok: true, programId: row.program_id };
  }

  return {
    ok: false,
    status: row.status as "not_found" | "expired" | "already_used" | "wrong_address",
  };
}

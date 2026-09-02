import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { programDisplayName } from "@/lib/data/programs-server";
import { titleCaseName } from "@/lib/data/person-name";
import type { ProgramOrgType } from "@/lib/workspace/types";
import type { JoinRole } from "./join-role";
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

/**
 * Re-exported from its leaf so existing importers keep working. The type lives
 * in `join-role.ts` beside the noun that prints it, where client components
 * can reach it without this server-only module.
 */
export type { JoinRole } from "./join-role";

/**
 * The coach behind the invitation, as far as a screen is allowed to say it.
 *
 * A name and nothing else. 8.3a has to promise a specific person was not
 * notified and 9.2a has to name who can send another, and "a coach on the
 * program" does neither — but the inviter's ADDRESS never leaves the server.
 * The name is not a disclosure: `programInviteEmail` already prints it in the
 * mail this token arrived in, so anybody holding the token has read it.
 *
 * Null is ordinary, not an error. `program_invites.invited_by` is `on delete
 * set null`, so a coach who left the product takes the name with them and every
 * screen below falls back to a sentence that does not need one.
 */
export type InviterName = string | null;

export type JoinState =
  /** No invitation with that token. Revoked, mistyped, or never existed. */
  | { kind: "not_found" }
  | { kind: "expired"; programName: string; inviterName: InviterName }
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
  | {
      kind: "ready";
      programName: string;
      programOrgType: ProgramOrgType;
      role: JoinRole;
      email: string;
      inviterName: InviterName;
    }
  /**
   * An account already exists for the invited address, and nobody is signed in.
   *
   * No screen: the page sends them to `/login?next=` and they come back as
   * `ready`. Nothing about the invitation rides on this state, because nothing
   * renders it — and an existing account is never offered a password box here;
   * see `createAccountAndAccept` for why that is the most important line in
   * this feature.
   */
  | { kind: "sign_in" }
  /** No account yet. Name and password, and they are in. */
  | {
      kind: "sign_up";
      programName: string;
      programOrgType: ProgramOrgType;
      role: JoinRole;
      email: string;
      inviterName: InviterName;
    };

export interface InviteRecord {
  id: string;
  programId: string;
  programName: string;
  /**
   * `programs.org_type`. The terms screens (8.2's footer) quote the program's
   * monthly analysis allowance, and a custom org's is the reduced tier — see
   * `quotaTierFor()` — so the invite has to say which kind of program it is
   * for the promised number to be the enforced one. Falls back to 'college'
   * when the program row went missing, alongside `programName`'s own fallback.
   */
  programOrgType: ProgramOrgType;
  email: string;
  role: JoinRole;
  expiresAt: string;
  acceptedAt: string | null;
  /**
   * `program_invites.invited_by`. SERVER ONLY, and deliberately not on
   * `JoinState`: it is what `requestFreshInvite()` resolves an address from, and
   * the one guarantee that makes that action safe is that the recipient is read
   * off this row rather than named by whoever holds the token.
   */
  invitedBy: string | null;
  /** The same person, as much of them as a screen may print. See `InviterName`. */
  inviterName: InviterName;
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
    .select("id, program_id, email, role, expires_at, accepted_at, invited_by")
    .eq("token_hash", hashToken(trimmed))
    .maybeSingle();

  if (!invite) return null;

  const invitedBy = (invite.invited_by as string | null) ?? null;

  // Both by id, both against this one row, so neither can be steered by the
  // caller. In parallel because they do not depend on each other and this runs
  // on the render path of every state the link opens.
  const [{ data: program }, { data: inviter }] = await Promise.all([
    admin
      .from("programs")
      .select("school_name, team, org_type")
      .eq("id", invite.program_id as string)
      .maybeSingle(),
    invitedBy
      ? admin
          .from("users")
          .select("first_name, last_name")
          .eq("id", invitedBy)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: invite.id as string,
    programId: invite.program_id as string,
    programName: program
      ? programDisplayName(
          program.school_name as string,
          program.team as string | null
        )
      : "your program",
    programOrgType: program
      ? (program.org_type as ProgramOrgType)
      : "college",
    email: (invite.email as string).toLowerCase(),
    role: invite.role as JoinRole,
    expiresAt: invite.expires_at as string,
    acceptedAt: invite.accepted_at as string | null,
    invitedBy,
    inviterName: inviter
      ? displayName(
          (inviter.first_name as string | null) ?? null,
          (inviter.last_name as string | null) ?? null
        )
      : null,
  };
}

/**
 * "Elena Vasquez", "Elena", or null.
 *
 * Null rather than a placeholder, because every screen that prints this has a
 * second sentence written for not knowing. "Coach wasn't notified" is worse
 * than "Nobody was notified" — it reads as a bug, and it is one.
 */
export function displayName(first: string | null, last: string | null): InviterName {
  // `titleCaseName` already trims and collapses internal whitespace, so a blank
  // half arrives here as a leading or trailing space and leaves as nothing.
  // Trimming the parts first would be the same work done twice.
  return titleCaseName([first, last].join(" ")) || null;
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

  const { programName, programOrgType, role, email, inviterName } = invite;

  // Same order as `accept_program_invite`, and for the same reason: "you
  // already did this" is more use to someone than "it expired" when both are
  // true, because only one of them has an action attached.
  if (invite.acceptedAt) return { kind: "already_used", programName };
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    return { kind: "expired", programName, inviterName };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const signedInAs = (user.email ?? "").toLowerCase();
    if (signedInAs === email) {
      return {
        kind: "ready",
        programName,
        programOrgType,
        role,
        email,
        inviterName,
      };
    }
    return {
      kind: "wrong_account",
      programName,
      invitedEmail: email,
      signedInAs,
    };
  }

  if (await accountExists(email)) return { kind: "sign_in" };

  return {
    kind: "sign_up",
    programName,
    programOrgType,
    role,
    email,
    inviterName,
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
  | {
      ok: false;
      /**
       * Ordinary human outcomes, not errors. Three joined the original four
       * when invitations learned to target a roster row:
       *
       *   no_seats         the program filled up between send and click
       *   already_claimed  somebody else bound to that profile first
       *   player_gone      the row was archived or merged away
       *
       * And one more when they learned to be accepted without the link
       * (`acceptPendingWithSession`):
       *
       *   unconfirmed      the session's address is not yet confirmed, so
       *                    nothing proves it is the invited one
       *
       * Each has its own sentence and its own way forward, which is why they
       * come back as a status rather than as a raised exception.
       */
      status:
        | "not_found"
        | "expired"
        | "already_used"
        | "wrong_address"
        | "unconfirmed"
        | "no_seats"
        | "already_claimed"
        | "player_gone";
    }
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
  return acceptVia(
    client ?? (await createClient()),
    "accept_program_invite",
    { p_token_hash: hashToken(token.trim()) },
    "[join] accept failed"
  );
}

const REFUSED: AcceptOutcome = {
  ok: false,
  status: "error",
  message: "We couldn't finish that. Try again.",
};

/**
 * The handshake both doors share.
 *
 * Both database functions return the same `(status, program_id)` row, so the
 * row-to-outcome mapping — including the cast that keeps `AcceptOutcome`'s
 * status list honest — lives here once. The log carries the message only: the
 * token is a live credential to a program and the id is the key to a row that
 * names an address, and neither belongs in the one place people paste into a
 * ticket without thinking.
 */
async function acceptVia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rpc: "accept_program_invite" | "accept_pending_invite",
  args: Record<string, string>,
  logLabel: string
): Promise<AcceptOutcome> {
  const { data, error } = await supabase.rpc(rpc, args).maybeSingle();

  if (error) {
    console.error(logLabel, { message: error.message });
    return REFUSED;
  }

  const row = data as { status: string; program_id: string | null } | null;
  if (!row) return REFUSED;

  if (row.status === "ok" && row.program_id) {
    return { ok: true, programId: row.program_id };
  }

  return {
    ok: false,
    status: row.status as Exclude<
      Extract<AcceptOutcome, { ok: false }>["status"],
      "error"
    >,
  };
}

/**
 * The same handshake, by invitation id instead of by link.
 *
 * For the person who has a session but never had the link — or has one they
 * cannot open any more. There is no token to hold up, so the proof of address
 * is the session's own: `accept_pending_invite` refuses unless the caller's
 * CONFIRMED address is the one on that row, and only then hands the row's own
 * `token_hash` to `accept_program_invite`. Every check the link path runs
 * runs here too, because both doors go through the one function that writes
 * the membership — `unconfirmed` is the only outcome this door adds.
 *
 * The id is not a secret, and nothing about the row is disclosed until the
 * address is proven: `not_found`, `unconfirmed` and `wrong_address` all come
 * back without a `program_id`, unlike the link path, where holding the link
 * earns the program's name. `client` for the same reason as above.
 */
export async function acceptPendingWithSession(
  inviteId: string,
  client?: Awaited<ReturnType<typeof createClient>>
): Promise<AcceptOutcome> {
  return acceptVia(
    client ?? (await createClient()),
    "accept_pending_invite",
    { p_invite_id: inviteId },
    "[join] accept by id failed"
  );
}

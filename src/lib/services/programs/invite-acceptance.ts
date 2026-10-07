import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { programDisplayName } from "@/lib/data/programs-server";
import { titleCaseName } from "@/lib/data/person-name";
import type { ProgramOrgType } from "@/lib/workspace/types";
import type { JoinRole } from "./join-role";
import type { JoinLinkMode } from "./join-links";
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
 *
 * ── Two kinds of token behind one door ──────────────────────────────────────
 * `/join/[token]` opens an INVITATION (hashed, addressed to one person) or a
 * JOIN LINK (`program_join_links`, plaintext, reusable, players only). The
 * invitation is tried first and the link only on a miss, so every state the
 * invitation path returned before links existed is returned unchanged. The
 * link's preview is read through the cookie client, not the service role:
 * `program_join_link_preview` is the one anon-callable function of its
 * migration, returns no token, id or member, and reads `auth.email()` for the
 * roster match — so the session has to be the one asking.
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
    }
  /**
   * A live join link, and a session to join with. One button; `mode` decides
   * whether it joins at once or files a request. `rosterMatchName` is the
   * unclaimed roster row carrying the session's address, so the screen can
   * say the coach already has them down — null when nothing matches.
   */
  | {
      kind: "link_ready";
      programName: string;
      programOrgType: ProgramOrgType;
      mode: JoinLinkMode;
      seatsFree: boolean;
      inviterName: InviterName;
      rosterMatchName: string | null;
    }
  /**
   * A live join link and nobody signed in. Unlike `sign_up`, no address is
   * known — the link was addressed to nobody — so the form asks for one, and
   * an existing account is offered sign-in rather than a password box (see
   * `createAccountAndJoinByLink`).
   */
  | {
      kind: "link_sign_up";
      programName: string;
      programOrgType: ProgramOrgType;
      mode: JoinLinkMode;
    }
  /** Approve mode, and this address already has an open request in the queue. */
  | { kind: "link_requested"; programName: string }
  /** Every seat is taken or reserved. Nothing to do here but tell them. */
  | { kind: "link_full"; programName: string };

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
          program.team as string | null,
        )
      : "your program",
    programOrgType: program ? (program.org_type as ProgramOrgType) : "college",
    email: (invite.email as string).toLowerCase(),
    role: invite.role as JoinRole,
    expiresAt: invite.expires_at as string,
    acceptedAt: invite.accepted_at as string | null,
    invitedBy,
    inviterName: inviter
      ? displayName(
          (inviter.first_name as string | null) ?? null,
          (inviter.last_name as string | null) ?? null,
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
export function displayName(
  first: string | null,
  last: string | null,
): InviterName {
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

  const { data } = await admin
    .from("users")
    .select("id")
    .ilike("email", ilikeLiteral(email))
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

/**
 * What `program_join_link_preview` says about a live join link, or null for
 * an unknown or revoked token.
 *
 * Read with the COOKIE client on purpose — see the header. `client` is
 * accepted for the same reason `acceptWithSession` takes one: a path that has
 * just established a session hands the client it did it on.
 */
export interface JoinLinkPreview {
  programName: string;
  programOrgType: ProgramOrgType;
  mode: JoinLinkMode;
  seatsFree: boolean;
  /** Who shared it — `created_by`'s name, null once that account is gone. */
  inviterName: InviterName;
  /** Null signed out, and when no unclaimed roster row carries the session's address. */
  rosterMatchName: string | null;
}

export async function loadJoinLinkPreview(
  token: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<JoinLinkPreview | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .rpc("program_join_link_preview", { p_token: trimmed })
    .maybeSingle();

  if (error) {
    // Message only: the token is a working credential to a program.
    console.error("[join] link preview failed", { message: error.message });
    return null;
  }
  if (!data) return null;

  const row = data as {
    program_name: string | null;
    program_team: string | null;
    org_type: string | null;
    mode: string;
    seats_free: boolean | null;
    created_by_name: string | null;
    roster_match_name: string | null;
  };

  return {
    programName: row.program_name
      ? programDisplayName(row.program_name, row.program_team)
      : "your program",
    programOrgType: (row.org_type as ProgramOrgType | null) ?? "college",
    mode: row.mode === "approve" ? "approve" : "open",
    seatsFree: row.seats_free === true,
    // Already a full name, trimmed in SQL; `titleCaseName` only tidies case.
    inviterName: row.created_by_name
      ? displayName(row.created_by_name, null)
      : null,
    rosterMatchName: row.roster_match_name?.trim() || null,
  };
}

/**
 * Escape a literal for `ilike`: `%` and `_` are wildcards, and an address
 * containing one would otherwise match somebody else's row.
 */
function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Does this address already have an open join request in the program behind
 * this link?
 *
 * Service role, for two reasons neither client could get round: the preview
 * deliberately returns no `program_id`, so the link row is read by token the
 * way `loadInvite` reads an invitation; and `program_requests` has RLS on
 * with NO policies — only `service_role` holds a grant — so the person who
 * filed the request cannot read it back. Both reads are keyed on the token
 * the caller already holds and the session's own address, and nothing about
 * the row comes back but yes or no.
 */
async function hasOpenJoinRequest(
  token: string,
  email: string,
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("program_join_links")
    .select("program_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (!link) return false;

  const { data } = await admin
    .from("program_requests")
    .select("id")
    .eq("kind", "invite_request")
    .eq("program_id", link.program_id as string)
    .eq("status", "open")
    .ilike("email", ilikeLiteral(email))
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

/**
 * The join-link half of `resolveJoinState`, reached only when no invitation
 * carries the token.
 *
 * Order: no row → `not_found`; no session → `link_sign_up`; no seat →
 * `link_full`; a request already filed → `link_requested`; else `link_ready`.
 * Full is decided before requested so the screen matches what
 * `accept_program_join_link` would answer a second click with (`no_seats`
 * is tested before the approve branch there too).
 */
async function resolveJoinLinkState(token: string): Promise<JoinState> {
  const supabase = await createClient();
  const [
    preview,
    {
      data: { user },
    },
  ] = await Promise.all([
    loadJoinLinkPreview(token, supabase),
    supabase.auth.getUser(),
  ]);
  if (!preview) return { kind: "not_found" };

  const { programName, programOrgType, mode } = preview;

  // Full is decided before sign-up, so nobody is asked to create an account
  // only to be refused on the next click. A roster row already carrying the
  // session's address holds its own seat — `accept_program_join_link` never
  // refuses that claim for seats — so a matched player is not told "full";
  // signed out, `rosterMatchName` is always null and the full screen's
  // "sign in" exit is how a rostered player reaches that branch.
  if (!preview.seatsFree && !preview.rosterMatchName) {
    return { kind: "link_full", programName };
  }

  if (!user) return { kind: "link_sign_up", programName, programOrgType, mode };

  const email = (user.email ?? "").trim().toLowerCase();
  if (
    mode === "approve" &&
    email &&
    (await hasOpenJoinRequest(token.trim(), email))
  ) {
    return { kind: "link_requested", programName };
  }

  return {
    kind: "link_ready",
    programName,
    programOrgType,
    mode,
    seatsFree: preview.seatsFree,
    inviterName: preview.inviterName,
    rosterMatchName: preview.rosterMatchName,
  };
}

/**
 * Which screen this link opens, for the person opening it right now.
 *
 * Invitation first, join link only on a miss — see the header for why that
 * order keeps every pre-existing state exactly as it was.
 */
export async function resolveJoinState(token: string): Promise<JoinState> {
  const invite = await loadInvite(token);
  if (!invite) return resolveJoinLinkState(token);

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
       * And one from the join-link door (`acceptJoinLinkWithSession`), which
       * is not a refusal at all but is not a membership either:
       *
       *   requested        approve mode — a `program_requests` row now waits
       *                    for staff; the action sends them back to the link,
       *                    which resolves to `link_requested`
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
        | "player_gone"
        | "requested";
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
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<AcceptOutcome> {
  return acceptVia(
    client ?? (await createClient()),
    "accept_program_invite",
    { p_token_hash: hashToken(token.trim()) },
    "[join] accept failed",
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
  rpc:
    | "accept_program_invite"
    | "accept_pending_invite"
    | "accept_program_join_link",
  args: Record<string, string>,
  logLabel: string,
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
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<AcceptOutcome> {
  return acceptVia(
    client ?? (await createClient()),
    "accept_pending_invite",
    { p_invite_id: inviteId },
    "[join] accept by id failed",
  );
}

/**
 * The same handshake for a join link.
 *
 * The raw token goes to the database as-is: `program_join_links.token` is
 * plaintext (the migration header says why), so there is no hash to send.
 * `accept_program_join_link` re-reads the row at the moment of the write —
 * revoked, full, unconfirmed address — and in approve mode files the request
 * itself and answers `requested` instead of `ok`. Always a POST server action
 * behind it; the GET that renders the page never calls this.
 */
export async function acceptJoinLinkWithSession(
  token: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<AcceptOutcome> {
  return acceptVia(
    client ?? (await createClient()),
    "accept_program_join_link",
    { p_token: token.trim() },
    "[join] accept by link failed",
  );
}

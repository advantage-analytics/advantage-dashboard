import type { SupabaseClient } from "@supabase/supabase-js";
import { toClaimRole } from "./claim-roles";
import { displayName } from "./invite-acceptance";

/**
 * A signed-in coach asking to join an existing CUSTOM org from the 7.2 setup
 * screen — the "Ask to join" on a row of `ExistingTeamMatches`.
 *
 * The college path (`requestInvite` in `claim-actions.ts`) resolves its
 * program by ITA key and accepts whatever address the form carried, because
 * it runs before an account exists. Custom orgs have `program_key IS NULL`
 * and are hidden from non-members by the `programs` SELECT policy, so this
 * path is keyed by the program's id and takes NOTHING typed by the client:
 * the address and name come from the verified session and the caller's own
 * `users` row. What it files is the same row the college path files — a
 * `program_requests` row of kind `invite_request` — so the org's owner sees it
 * in the roster's join requests (`program_join_requests`) exactly as a
 * college owner would, and a new `programs` row is never written.
 *
 * Two clients, on purpose, and the reason this is a plain module rather than
 * a server action: the identity comes from the SESSION client (`getUser()`
 * verifies it against the auth server; the profile read is own-row RLS), and
 * every read or write of a row the caller cannot see — the program itself, its
 * memberships, `program_requests` (no policies, no grants) — goes through the
 * ADMIN client. Taking both as arguments is what lets the live spec run this
 * exact function with a real signed-in session, since a Next server action
 * cannot be invoked from a spec. `claim/team/actions.ts` wraps it with the
 * cookie client and `createAdminClient()`, then sends the mail and redirects.
 *
 * Refusals are reasons, not messages — the form owns the copy. Unlike the
 * anonymous college path, `already-requested` IS reported: the caller is
 * signed in and the address is provably their own, so telling them their
 * request is already on file discloses nothing about anyone else.
 */
export type JoinCustomOrgReason =
  | "no-session"
  | "not-found"
  | "college"
  | "already-member"
  | "already-requested"
  | "failed";

export type JoinCustomOrgResult =
  | {
      ok: true;
      programId: string;
      /** The org's name, for the owner notice and the confirmation screen. */
      programName: string;
      /** The new row's id — `notifyAdminsReviewNeeded`'s deep link. */
      requestId: string;
      /** Normalised the way the row stores it, lower-cased. */
      requesterEmail: string;
      requesterName: string | null;
    }
  | { ok: false; reason: JoinCustomOrgReason };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requestToJoinCustomOrg(
  clients: {
    /** The caller's own session — the cookie client, or a signed-in test client. */
    session: SupabaseClient;
    /** Service role: the program, its members and the request table. */
    admin: SupabaseClient;
  },
  input: {
    programId: string;
    /** One of `CLAIM_ROLES`, or absent. Anything else files as "no role". */
    role?: string | null;
  },
): Promise<JoinCustomOrgResult> {
  const programId = (input?.programId ?? "").trim();
  // A malformed id is not a database error worth logging: it is a row that
  // does not exist, which is what a tampered id should look like.
  if (!UUID.test(programId)) return { ok: false, reason: "not-found" };

  const {
    data: { user },
  } = await clients.session.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) return { ok: false, reason: "no-session" };

  const { data: program, error: programError } = await clients.admin
    .from("programs")
    .select("id, school_name, org_type")
    .eq("id", programId)
    .maybeSingle();

  if (programError) {
    console.error("[join-custom-org] could not read the program", {
      error: programError.message,
    });
    return { ok: false, reason: "failed" };
  }
  if (!program) return { ok: false, reason: "not-found" };
  // College joins have their own screen (`/claim/[programKey]/request`) with
  // the sharing terms a player or coach reads before asking; this path has
  // none of that, so it stays custom-only.
  if (program.org_type === "college") return { ok: false, reason: "college" };

  // Membership and the caller's own name come from different tables under
  // different clients and don't depend on each other, so they go out together.
  const [membershipResult, profileResult] = await Promise.all([
    clients.admin
      .from("program_members")
      .select("id")
      .eq("program_id", programId)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    // Own-row RLS: this returns the caller's row or nothing. A coach with no
    // name yet files as a bare address, the same as the college form allows.
    clients.session
      .from("users")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const { data: membership, error: memberError } = membershipResult;
  const { data: profile } = profileResult;

  if (memberError) {
    console.error("[join-custom-org] could not read memberships", {
      error: memberError.message,
    });
    return { ok: false, reason: "failed" };
  }
  if (membership) return { ok: false, reason: "already-member" };

  const requesterName = displayName(
    profile?.first_name ?? null,
    profile?.last_name ?? null,
  );

  // The same columns `fileRequest` writes for the college path, with the two
  // that path leaves to the form fixed to the session's own facts.
  const { data: filed, error: fileError } = await clients.admin
    .from("program_requests")
    .insert({
      kind: "invite_request",
      program_id: programId,
      email,
      name: requesterName,
      role: toClaimRole(input.role),
      note: null,
    })
    .select("id")
    .single();

  if (fileError) {
    // `program_requests_open_unique` — an open request from this address for
    // this program is already on file. Honest to say so here: see the module
    // comment on why this differs from the anonymous path.
    if (fileError.code === "23505")
      return { ok: false, reason: "already-requested" };
    console.error("[join-custom-org] could not file the request", {
      error: fileError.message,
    });
    return { ok: false, reason: "failed" };
  }

  return {
    ok: true,
    programId,
    programName: program.school_name as string,
    requestId: filed.id as string,
    requesterEmail: email,
    requesterName,
  };
}

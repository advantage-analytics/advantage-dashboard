import type { SupabaseClient, User } from "@supabase/supabase-js";
import { plansHaveBegun } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { pilotIsRunning } from "@/lib/services/splitstep/allowance";
import {
  PILOT_TERMS_VERSION,
  TEAM_TERMS_VERSION,
  isShownTermsVersion,
  termsVersionFor,
  type TermsVersion,
} from "./pilot-terms";
import { hashToken } from "./tokens";

/**
 * Which terms a claim is made under, and reading and recording a coach's
 * acceptance of them. Server-only, and deliberately NOT a `"use server"`
 * module: the version a claim needs is decided here from the session and the
 * database, never taken from a browser, so none of this may be callable as a
 * server action. The two actions a browser does call
 * (`acceptPilotTermsForClaim`, `acceptPilotTermsAndCreateTeam`) pass only the
 * version their screen rendered, and this module decides whether that was the
 * right one.
 *
 * Reads and writes of `pilot_terms_acceptances` run through the SESSION
 * (cookie) client, never `createAdminClient()`. An acceptance is the coach's
 * own statement, and the table's grants say so: `authenticated` may insert
 * only `{ user_id, terms_version }` for itself and read only its own rows
 * (`20260926181544_pilot_terms_acceptances.sql`). The service role writing
 * one would be us accepting on the coach's behalf.
 *
 * The database refuses a creation or claim with no acceptance at a version it
 * knows (`TERMS_NOT_ACCEPTED_SQLSTATE`), and the screens handle that refusal
 * as the frame C state.
 */

export type AcceptPilotTermsResult =
  | {
      ok: true;
      /**
       * Where the browser goes next, when the caller must navigate itself.
       * Set by `acceptPilotTermsForClaim` only; see there for why it is not a
       * server-side `redirect()`.
       */
      next?: string;
    }
  | {
      ok: false;
      /**
       * `terms-changed`: the version the screen rendered is not the one this
       * claim is made under, so the coach read words that are not its terms.
       * The screen re-renders the right text rather than recording the wrong
       * version.
       */
      reason: "terms-changed" | "no-session" | "failed";
    };

// ── Which version ───────────────────────────────────────────────────────────

/**
 * Whether the pilot of the program behind a claim link is running now.
 * Only asked from `PLANS_BEGIN`: before it every claim is on the pilot's
 * terms and wording whatever this would say.
 *
 * College programs and their pilot columns are readable signed out (the
 * directory's own policy), so this is the caller's own client. A failed read
 * answers false, the direction that promises no free hours.
 */
export async function programPilotIsRunning(
  supabase: SupabaseClient,
  program: { programKey: string } | { programId: string },
  now: Date = new Date(),
): Promise<boolean> {
  if (!plansHaveBegun(now)) return false;

  const query = supabase
    .from("programs")
    .select("pilot_eligible, pilot_ends_on, pilot_ended_at");
  const { data, error } = await (
    "programKey" in program
      ? query.eq("program_key", program.programKey)
      : query.eq("id", program.programId)
  ).maybeSingle();

  if (error) {
    console.error("[pilot-terms] could not read the program's pilot", {
      message: error.message,
    });
    return false;
  }
  if (!data) return false;
  return pilotIsRunning(
    {
      pilotEligible: data.pilot_eligible === true,
      pilotEndsOn: (data.pilot_ends_on as string | null) ?? null,
      pilotEndedAt: (data.pilot_ended_at as string | null) ?? null,
    },
    now,
  );
}

/**
 * Remembered once true: a database that accepts the team terms does not stop.
 * A "no" is asked again on the next request, so applying the migration takes
 * effect without a deploy.
 */
let databaseKnowsTeamTerms = false;

/**
 * Whether the database accepts an acceptance at `TEAM_TERMS_VERSION`, i.e.
 * whether `20261126100000_plans_2027_team_terms.sql` is applied. Before it,
 * `assert_pilot_terms_accepted` knows only the pilot version and
 * `accepted_terms_versions()` does not exist, so the call fails and this
 * answers false.
 */
async function databaseAcceptsTeamTerms(
  supabase: SupabaseClient,
): Promise<boolean> {
  if (databaseKnowsTeamTerms) return true;
  const { data, error } = await supabase.rpc("accepted_terms_versions");
  if (error || !Array.isArray(data)) return false;
  databaseKnowsTeamTerms = data.includes(TEAM_TERMS_VERSION);
  return databaseKnowsTeamTerms;
}

/**
 * The version this claim's terms screen shows and its acceptance must carry.
 *
 * `termsVersionFor()` decides, with one fallback: while the database does not
 * yet accept the team terms, a claim that should be on them stays on the
 * pilot version. Showing the team terms then would record an acceptance the
 * claim RPCs refuse, and the coach would be sent back to this screen for
 * ever. The stale pilot wording is the lesser fault, and it is logged.
 */
export async function resolveTermsVersion(
  supabase: SupabaseClient,
  {
    pilotRunning = false,
    now = new Date(),
  }: { pilotRunning?: boolean; now?: Date } = {},
): Promise<TermsVersion> {
  const version = termsVersionFor({ now, pilotRunning });
  if (version !== TEAM_TERMS_VERSION) return version;
  if (await databaseAcceptsTeamTerms(supabase)) return version;
  console.warn(
    "[pilot-terms] the database does not accept the team terms yet; serving the pilot terms. Apply 20261126100000_plans_2027_team_terms.sql.",
  );
  return PILOT_TERMS_VERSION;
}

/**
 * The version for a college claim, from the program the claim is FOR. Null
 * key (no live claim found) reads as a program on no pilot.
 */
export async function claimTermsVersion(
  supabase: SupabaseClient,
  programKey: string | null,
  now: Date = new Date(),
): Promise<TermsVersion> {
  const pilotRunning = programKey
    ? await programPilotIsRunning(supabase, { programKey }, now)
    : false;
  return resolveTermsVersion(supabase, { pilotRunning, now });
}

/**
 * The program a live, finishable claim for this session is waiting on, or
 * null when there is none.
 *
 * The same row each completion would spend, found the same way: by token hash
 * and bound to this session for the signed-in link, by the session's own
 * verified address in the anonymous slot for the magic link. Read-only, and
 * deliberately narrower than the completions' checks. It answers only "is
 * there somewhere for the terms screen to lead back to", so that a coach
 * whose link has expired or belongs to another account is told that, rather
 * than being asked to accept terms for a claim that cannot finish. It is also
 * what picks the terms version: the program the claim will finish for, not a
 * key in a URL. `pending_claims` has no grants for `authenticated`, hence the
 * admin client, as in `claim-actions.ts`.
 */
export async function pendingClaimProgramKey(
  user: User,
  token: string | null,
): Promise<string | null> {
  const db = createAdminClient();
  const now = new Date();

  if (token) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const { data: row } = await db
      .from("pending_claims")
      .select("program_key, claimant_user_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!row || row.claimant_user_id !== user.id) return null;
    if (new Date(row.expires_at as string) < now) return null;
    return row.program_key as string;
  }

  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const { data: row } = await db
    .from("pending_claims")
    .select("program_key, expires_at")
    .eq("email", email)
    .is("claimant_user_id", null)
    .maybeSingle();
  if (!row || new Date(row.expires_at as string) < now) return null;
  return row.program_key as string;
}

// ── Reading and recording ───────────────────────────────────────────────────

/** Whether this coach holds an acceptance at `version`. */
export async function hasAcceptedTermsForUser(
  userId: string,
  version: TermsVersion,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pilot_terms_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("terms_version", version)
    .limit(1);

  if (error) {
    // Fail towards the terms screen: a coach shown the terms once more loses
    // a click, a coach waved past them has not accepted anything.
    console.error("[pilot-terms] could not read acceptance", {
      message: error.message,
    });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Record the coach's acceptance of the version the screen rendered.
 *
 * `renderedVersion` is what the page showed, round-tripped through the form.
 * It never chooses what is written (that is always `expected`, which the
 * caller resolved on the server for this claim); it only lets a coach who
 * read another text be told so instead of being recorded as accepting words
 * they never saw. The other live version is refused like any stale one.
 *
 * Idempotent: an existing row at that version is enough, so a double submit
 * or a back-button revisit does not pile up acceptances.
 */
export async function recordTermsAcceptance(
  renderedVersion: unknown,
  expected: TermsVersion,
): Promise<AcceptPilotTermsResult> {
  if (!isShownTermsVersion(renderedVersion, expected)) {
    return { ok: false, reason: "terms-changed" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  if (await hasAcceptedTermsForUser(user.id, expected)) return { ok: true };

  const { error } = await supabase
    .from("pilot_terms_acceptances")
    .insert({ user_id: user.id, terms_version: expected });

  if (error) {
    console.error("[pilot-terms] could not record acceptance", {
      message: error.message,
    });
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}

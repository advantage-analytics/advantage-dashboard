import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  completeClaim,
  completeClaimWithToken,
} from "@/lib/services/programs/claim-actions";
import { hasAcceptedCurrentPilotTermsForUser } from "@/lib/services/programs/pilot-terms-actions";
import { hashToken } from "@/lib/services/programs/tokens";
import { WORKSPACE_COOKIE } from "@/lib/workspace/active-workspace-server";

/**
 * Where the emailed link lands, and where a claim becomes ownership.
 *
 * `/confirm` has already exchanged the code and created the `users` row by the
 * time anyone reaches this, so the session is real and the address is proven.
 * That proof is the whole gate: nothing before this point wrote a single row,
 * which is what stops an anonymous script parking an open claim on all 1,940
 * programs.
 *
 * The claim is identified by the SESSION's email, never by an id in the URL —
 * there is nothing here to tamper with.
 *
 * ── The second way in: `?token=` ────────────────────────────────────────────
 * A claim started while SIGNED IN cannot ride the magic link — exchanging it
 * would switch the session to (or mint) an account for the school address,
 * when the whole point is that the coach keeps the account they have. Those
 * claims arrive here carrying a token that was emailed to the school address
 * and is stored only as a hash. It is proof of mailbox possession, not an
 * identifier: nothing about it selects whose claim or which program — the row
 * it hashes to decided that when the claim started, bound server-side to the
 * session that started it and to the program the token was issued for.
 * `completeClaimWithToken` requires that same session, so the link is inert
 * in anyone else's hands.
 *
 * ── Why a Route Handler and not a page ──────────────────────────────────────
 * This was a Server Component that performed the write. Two things were wrong
 * with that. Finishing a claim clears the pending-claim cookie and, on the
 * auto-approved path, sets the active workspace — and Next throws
 * "Cookies can only be modified in a Server Action or Route Handler" for both.
 * A Route Handler is the shape that is allowed to do this work.
 *
 * The alternative — a client component firing the action in an effect — was
 * rejected because it double-fires under StrictMode and turns a "program
 * already claimed" race into the user's problem. The RPC is idempotent for the
 * owner, so a refresh here is safe either way.
 *
 * ── Pilot terms first ────────────────────────────────────────────────────────
 * A claim makes the coach an owner, so it waits on the pilot terms. Before
 * either completion runs, a signed-in coach with no acceptance at the current
 * `PILOT_TERMS_VERSION` (read through the session client) is sent to
 * `/claim/[programKey]/terms`, carrying `?token=` when this request had one.
 * That screen's accept comes back HERE with the same token, and only that
 * return trip calls `completeClaim` / `completeClaimWithToken`. The detour is
 * taken only when there is a live claim for it to lead back to
 * (`pendingProgramKey`); anything else (no session, no pending row, the wrong
 * account, an expired link) falls straight through to the completion, which
 * already names each of those endings.
 *
 * This UI check is what enforces the order today. Once the enforcement
 * migration is live the RPCs refuse the same thing (`terms-not-accepted`),
 * and that refusal also lands on the terms screen, as frame C (`?refused=1`),
 * never on the failure screen's `restart`: the pending claim is untouched, so
 * accepting and coming back through here finishes it.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasAcceptedCurrentPilotTermsForUser(user.id))) {
    const programKey = await pendingProgramKey(user, token);
    if (programKey) redirect(termsHref(programKey, token));
  }

  const result = token
    ? await completeClaimWithToken(token)
    : await completeClaim();

  if (!result.ok && result.reason === "terms-not-accepted" && user) {
    const programKey = await pendingProgramKey(user, token);
    if (programKey) redirect(termsHref(programKey, token, true));
  }

  // A code, never the copy — see `ClaimFailure`. The screen owns the wording.
  if (!result.ok) redirect(`/claim/verify/failed?reason=${result.reason}`);

  const params = new URLSearchParams({
    school: result.schoolName,
    team: result.team,
    email: result.email,
  });
  // The review screen's button switches into this program by id. Not trusted:
  // `setActiveWorkspace` only accepts an id the session is a member of.
  if (result.programId) params.set("program", result.programId);

  // Open the dashboard already in the program rather than in Personal, on BOTH
  // endings. A claim under review is still a live workspace (the owner
  // membership exists; only sending video waits), and F5.1's one button is
  // "Go to the program" — which is a plain `/dashboard` link, so without this
  // it opened in whatever workspace was last active. Safe to write directly:
  // `completeClaim` just created the membership this id refers to, and
  // `getWorkspaceContext` validates the cookie against membership on every
  // read regardless of who set it.
  if (result.programId) {
    const store = await cookies();
    store.set(WORKSPACE_COOKIE, result.programId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  if (result.autoApproved) redirect(`/claim/ready?${params}`);

  // F5.1. Reached only when the address is not on the recorded staff list.
  redirect(`/claim/review?${params}`);
}

/**
 * The terms screen for this claim's program, with the token (if any) riding
 * along so the return trip can finish the claim the same way it arrived.
 * `refused` asks for frame C: the database turned the claim away for want of
 * an acceptance the app believed was current.
 */
function termsHref(
  programKey: string,
  token: string | null,
  refused = false,
): string {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (refused) params.set("refused", "1");
  const query = params.size ? `?${params}` : "";
  return `/claim/${encodeURIComponent(programKey)}/terms${query}`;
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
 * than being asked to accept terms for a claim that cannot finish.
 * `pending_claims` has no grants for `authenticated`, hence the admin client,
 * as in `claim-actions.ts`.
 */
async function pendingProgramKey(
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

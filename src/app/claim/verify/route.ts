import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics-server";
import {
  completeClaim,
  completeClaimWithToken,
} from "@/lib/services/programs/claim-actions";
import {
  hasAcceptedTermsForUser,
  resolveClaimTerms,
  type ClaimTerms,
} from "@/lib/services/programs/pilot-terms-server";
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
 * ── Terms first ──────────────────────────────────────────────────────────────
 * A claim makes the coach an owner, so it waits on the terms. Before either
 * completion runs, a signed-in coach with no acceptance at the version this
 * claim is made under (`resolveClaimTerms`, the resolver the terms screen
 * and its accept use: the pilot's before January 1, 2027 and for a program on
 * a running pilot, the team terms otherwise; read through the session
 * client) is sent to
 * `/claim/[programKey]/terms`, carrying `?token=` when this request had one.
 * That screen's accept comes back HERE with the same token, and only that
 * return trip calls `completeClaim` / `completeClaimWithToken`. The detour is
 * taken only when there is a live claim for it to lead back to
 * (the resolver's `pendingKey`); anything else (no session, no pending row, the wrong
 * account, an expired link) falls straight through to the completion, which
 * already names each of those endings.
 *
 * This check is the courteous half. The completions ask the same question
 * themselves before their RPC (`termsRefusal`), since a browser can call
 * them without coming through here, and the database refuses a coach with no
 * acceptance at all. Either refusal (`terms-not-accepted`) also lands on the
 * terms screen, as frame C (`?refused=1`), never on the failure screen's
 * `restart`: the pending claim is untouched, so accepting and coming back
 * through here finishes it.
 *
 * If the database cannot say which terms apply, nothing is completed and the
 * coach gets the failure screen's `failed`, with the pending claim intact.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let terms: ClaimTerms | null = null;
  if (user) {
    try {
      terms = await resolveClaimTerms(supabase, user, { token });
    } catch {
      // Logged where it failed. `redirect()` throws, so it stays outside.
    }
    if (!terms) redirect("/claim/verify/failed?reason=failed");
    if (
      terms.pendingKey &&
      !(await hasAcceptedTermsForUser(user.id, terms.version))
    ) {
      redirect(termsHref(terms.pendingKey, token));
    }
  }

  const result = token
    ? await completeClaimWithToken(token)
    : await completeClaim();

  // The same claim the detour above looked at: a refused completion leaves
  // the pending row as it was.
  if (!result.ok && result.reason === "terms-not-accepted" && terms?.pendingKey)
    redirect(termsHref(terms.pendingKey, token, true));

  // A code, never the copy — see `ClaimFailure`. The screen owns the wording.
  if (!result.ok) redirect(`/claim/verify/failed?reason=${result.reason}`);

  // `program_claim_completed`, for the claimant. A token link opened signed
  // out signs in during the claim, so the id is read again when needed; a
  // re-opened link for a program already theirs is not a second completion.
  if (result.programId && !result.alreadyOwned) {
    const claimant =
      user ?? (await (await createClient()).auth.getUser()).data.user;
    if (claimant) {
      trackServer(claimant.id, "program_claim_completed", {
        program_id: result.programId,
      });
    }
  }

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

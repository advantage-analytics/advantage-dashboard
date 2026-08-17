import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeClaim } from "@/lib/services/programs/claim-actions";
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
 * The claim is identified by the SESSION's email and an httpOnly cookie, never
 * by an id in the URL — there is nothing here to tamper with.
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
 */
export async function GET() {
  const result = await completeClaim();

  // A code, never the copy — see `ClaimFailure`. The screen owns the wording.
  if (!result.ok) redirect(`/claim/verify/failed?reason=${result.reason}`);

  const params = new URLSearchParams({
    school: result.schoolName,
    email: result.email,
  });

  if (result.autoApproved) {
    // Open the dashboard already in the program rather than in Personal. Safe
    // to write directly: `completeClaim` just created the membership this id
    // refers to, and `getWorkspaceContext` validates the cookie against
    // membership on every read regardless of who set it.
    const store = await cookies();
    store.set(WORKSPACE_COOKIE, result.programId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });

    redirect(`/claim/ready?${params}`);
  }

  // F5.1. Reached only when the address is not on the recorded staff list.
  redirect(`/claim/review?${params}`);
}

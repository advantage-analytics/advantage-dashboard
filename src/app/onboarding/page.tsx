import { redirect } from "next/navigation";
import { ClaimHeading } from "@/components/claim/claim-shell";
import { InviteOffer } from "@/components/join/invite-offer";
import { getPendingInvites } from "@/lib/data/pending-invites-server";
import { isNotNow, notNowHref } from "@/lib/services/programs/join-links";
import { quotaHours } from "@/lib/services/programs/join-quota";
import { inviteSentence } from "@/lib/services/programs/join-role";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata = { title: "How do you use Advantage?" };

/**
 * First-run onboarding — Onboarding & Team Setup screens 1.2 and 1.3, plus the
 * junior branch's guardian step, 3.1 (1.1, the account screen, is the existing
 * auth flow and out of scope).
 *
 * The dashboard layout redirects here while `users.onboarded_at` is null; the
 * mirror-image check below is what makes the flow unreachable once it is set,
 * so a bookmarked /onboarding can never re-run the questions. Signed-out
 * visitors go to login like any protected page.
 *
 * All three screens live in one client component — the step split is a branch
 * in the flow, not a route — and the answers persist through
 * `finishOnboarding` and `finishGuardianOnboarding` in `actions.ts`, which is
 * also where the routing table lives.
 *
 * ── Step zero: a live invitation is offered before the persona question ─────
 * An account with a pending invitation is asked to accept it first, and only
 * the accounts with none are asked how they use Advantage. The invitation
 * already answers what those questions ask: who the person is on this
 * platform, and which dashboard they should open on. Asking anyway would have
 * someone pick a persona, land on a personal dashboard, and only then find the
 * program that was waiting for them the whole time — and accepting stamps
 * `onboarded_at` inside the action, so answering the questions afterwards
 * would be work nobody needs.
 *
 * "Not now" is a flag on a GET and writes nothing: `?not-now=1` falls straight
 * through to the persona question, and the next visit without the flag offers
 * again. That is right rather than forgetful — the account is still
 * un-onboarded, so it is still being asked its first question, and the
 * invitation is still the better one.
 *
 * `quotaHours()` is server-only and is read here rather than inside
 * `InviteOffer`, which is a client component: the modules behind it carry the
 * vendor's internal name and must never reach a bundle.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (row?.onboarded_at) redirect("/dashboard");

  // The flag is known before any query runs, so a decline never pays for the
  // list it is about to ignore.
  const invites = isNotNow(query) ? [] : await getPendingInvites(supabase);

  if (invites.length > 0) {
    // Never with an empty list: this guard is what keeps `InviteOffer` from
    // rendering a pane with nothing in it.
    const single = invites.length === 1 ? invites[0] : null;
    // Every invitation in the list carries the same footer numbers in
    // practice, and the first one is the one the heading names.
    const { programHours, personalHours } = quotaHours(
      invites[0].programOrgType
    );

    return (
      // `OnboardingFlow`'s own frame, reused rather than `ClaimShell`: this is
      // still the first screen of onboarding, and the ✕ that shell carries
      // would offer an exit to a dashboard this account has not reached yet.
      // 720 is the width the offer pane's two columns of terms were drawn at.
      <div className="flex min-h-screen items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10">
        <div className="mx-auto w-full" style={{ maxWidth: 720 }}>
          <div className="flex min-w-0 flex-col" style={{ gap: 28 }}>
            <ClaimHeading
              gap={2}
              // One invitation is a program, so it is named. Several are a
              // choice, and naming one of them would answer it.
              eyebrow={single ? single.programName : "Invitations"}
              title="You've been invited"
              titlePadTop={8}
              body={
                single
                  ? inviteSentence(single)
                  : "Join one now, or continue and decide later."
              }
              bodyMax="58ch"
            />
            <InviteOffer
              invites={invites}
              programHours={programHours}
              personalHours={personalHours}
              notNowHref={notNowHref("/onboarding")}
            />
          </div>
        </div>
      </div>
    );
  }

  return <OnboardingFlow />;
}

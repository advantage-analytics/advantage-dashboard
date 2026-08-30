import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata = { title: "How do you use Advantage?" };

/**
 * First-run onboarding — Stage 1 of Onboarding & Team Setup (screens 1.2 and
 * 1.3; 1.1, the account screen, is the existing auth flow and out of scope).
 *
 * The dashboard layout redirects here while `users.onboarded_at` is null; the
 * mirror-image check below is what makes the flow unreachable once it is set,
 * so a bookmarked /onboarding can never re-run the questions. Signed-out
 * visitors go to login like any protected page.
 *
 * Both questions live in one client component — the step split is a branch in
 * the flow, not a route — and the answers persist through `finishOnboarding`
 * in `actions.ts`, which is also where the routing table lives.
 */
export default async function OnboardingPage() {
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

  return <OnboardingFlow />;
}

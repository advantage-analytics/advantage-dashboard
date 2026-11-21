import { IdentifySignedIn } from "@/components/analytics/identify-signed-in";
import { getAuthUser } from "@/lib/supabase/auth-user-server";

/**
 * Every `/claim` screen, signed in or not. It adds no chrome — `ClaimShell`
 * draws each page — and exists only so a signed-in coach is identified to
 * PostHog here: a first-time coach reaches `/claim/*` from onboarding or
 * straight from an emailed link, before `DashboardShell` has ever mounted.
 * The public `/claim/[programKey]` pages stay reachable signed out, so a
 * missing session renders the page and identifies nobody.
 */
export default async function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  return (
    <>
      {user ? <IdentifySignedIn userId={user.id} /> : null}
      {children}
    </>
  );
}

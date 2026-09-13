import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in front door to team setup (Onboarding & Team Setup, Stage 5→7).
 *
 * The public `/claim/[programKey]` URLs stay reachable for signed-out coaches
 * arriving via a referral link, but the fork and its setup screens assume an
 * account already exists — a first-time coach reaches them from onboarding,
 * everyone else from the sidebar's "Create team workspace". A signed-out
 * visitor goes to login like any protected surface; the create action refuses
 * a missing session too, but the door is the honest place to turn them around.
 */
export default async function TeamSetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}

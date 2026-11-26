import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClaimShell, AsidePanel } from "@/components/claim/claim-shell";
import { TeamSetupForm } from "@/components/claim/team-setup-form";
import { isCustomOrgType, readPendingTeam } from "../pending-team";
import { loginRedirectPath } from "@/lib/auth/request-path";
import {
  claimOnPlans,
  teamSetupAsideCopy,
  termsNamingCopy,
} from "@/lib/billing/claim-copy";

export const metadata = { title: "Set up your team" };

/**
 * Screen 7.2 — you name it, you own it, no confirmation step.
 *
 * The org type arrives from 7.1 as `?type=`; a missing or tampered value falls
 * back to the type screen rather than guessing one. "Your name" is pre-filled
 * from the coach's profile so the field starts true and a correction persists
 * (see `createCustomTeam`). Submitting goes on to the pilot terms
 * (`/claim/team/terms`) before the team exists; Back from there returns here
 * with the parked values (`pending-team.ts`) typed back in, when they are for
 * this same type.
 *
 * The "How this differs from a college team" aside rides in `ClaimShell`'s
 * right column. Its budget line is deliberately absent: `quotaTierFor()` gives
 * a self-serve custom org the individual figure, not the collegiate 75h, so the
 * design's "shared-hour budget" footnote would be a promise the code doesn't
 * keep. From January 1, 2027 the footnote and the third row say what is true
 * of a team with no plan (`teamSetupAsideCopy`): a new team is on no pilot,
 * so the date alone decides. Back returns to 7.1; ✕ leaves setup per the Stage 7 chrome convention.
 */
export default async function TeamSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!isCustomOrgType(type)) redirect("/claim/team/type");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(await loginRedirectPath("/claim/team"));

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const profileName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const pending = await readPendingTeam();
  const parked = pending?.orgType === type ? pending : null;
  const onPlans = claimOnPlans();
  const aside = teamSetupAsideCopy(onPlans);

  return (
    <ClaimShell
      width={1000}
      gap={16}
      back="/claim/team/type"
      asideWidth={340}
      aside={
        <AsidePanel
          title="How this differs from a college team"
          items={[...aside.items]}
          footnote={aside.footnote}
        />
      }
    >
      <TeamSetupForm
        orgType={type}
        defaultOwnerName={parked?.ownerName || profileName}
        defaultTeamName={parked?.name ?? ""}
        defaultTeam={parked?.team ?? null}
        termsRefusal={termsNamingCopy(onPlans).setupFormRefusal}
      />
    </ClaimShell>
  );
}

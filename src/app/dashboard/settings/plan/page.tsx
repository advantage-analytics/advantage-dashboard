import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getCreditHistory } from "@/lib/data/credits-server";
import { secondsLeft } from "@/lib/data/usage-format";
import {
  currentBillingMonth,
  formatPilotEnd,
  freeHoursReturnOn,
} from "@/lib/services/splitstep/config";
import { isProPlan } from "@/lib/user/plan";
import { PersonalPlan } from "@/components/dashboard/settings/personal-plan";
import { TeamPlanContent } from "@/components/dashboard/settings/plan-terms-content";

/**
 * Settings › Plan. A personal workspace gets hours, credits and packs
 * (`PersonalPlan`); a team workspace keeps its entitlement facts and the note
 * that program plans are arranged directly (`TeamPlanContent`) — credits are
 * personal and never spend in a team.
 */
export default async function PlanPage() {
  const context = await getWorkspaceContext();
  if (!context) return null;

  if (context.active.kind === "team") return <TeamPlanContent />;

  const personal = context.active;
  const [usage, lots] = await Promise.all([
    getPersonalUsage(personal, currentBillingMonth()),
    getCreditHistory(personal.id),
  ]);

  return (
    <PersonalPlan
      freeCapSeconds={usage.capSeconds}
      freeLeftSeconds={secondsLeft(usage.usedSeconds, usage.capSeconds)}
      creditSeconds={usage.creditSeconds}
      lots={lots}
      nextCreditExpiresAt={usage.nextCreditExpiresAt}
      pilot={personal.individualPilot === true}
      resetsOn={freeHoursReturnOn()}
      freeEnds={formatPilotEnd()}
      legacyPro={isProPlan(context.viewer.plan)}
    />
  );
}

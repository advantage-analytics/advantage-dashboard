import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPersonalUsage } from "@/lib/data/usage-server";
import { getCreditHistory } from "@/lib/data/credits-server";
import { secondsLeft } from "@/lib/data/usage-format";
import { readPlanBilling } from "@/lib/billing/plan-fields";
import { parsePlanIntent } from "@/lib/billing/plan-intent";
import { dialogForIntent } from "@/lib/billing/plan-page-view";
import { plansOnSale } from "@/lib/billing/plans";
import { allowanceFor } from "@/lib/services/splitstep/allowance";
import {
  currentBillingMonth,
  formatPilotEnd,
  freeHoursReturnOn,
} from "@/lib/services/splitstep/config";
import { createClient } from "@/lib/supabase/server";
import { isPaidPlan, isProPlan, planFor } from "@/lib/user/plan";
import { PersonalPlan } from "@/components/dashboard/settings/personal-plan";
import { PlanSettings } from "@/components/dashboard/settings/plan-settings";
import { TeamPlanContent } from "@/components/dashboard/settings/plan-terms-content";

/**
 * Settings › Plan.
 *
 * Once plans are on sale (`plansOnSale()`), and from the day an account holds
 * a paid plan whatever the date, this is the viewer's OWN plan in every
 * workspace: `PlanSettings`, two cards, with `?plan=&period=` from the
 * landing site opening the checkout dialog on that plan.
 *
 * Until then it is the beta's page: a personal workspace gets hours, credits
 * and packs (`PersonalPlan`), and a team workspace its entitlement facts and
 * the note that program plans are arranged directly (`TeamPlanContent`).
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const context = await getWorkspaceContext();
  if (!context) return null;

  const newPlans = plansOnSale() || isPaidPlan(context.viewer.plan);
  // The viewer's own workspace: the first one, always (`getWorkspaceContext`).
  const own = context.available.find(
    (workspace) => workspace.kind === "personal",
  );

  if (newPlans && own) {
    const query = await searchParams;
    const intent = parsePlanIntent(query.plan, query.period);
    const plan = planFor(context.viewer.plan).id;
    const [usage, billing] = await Promise.all([
      getPersonalUsage(own, currentBillingMonth()),
      readPlanBilling(await createClient(), context.viewer.id),
    ]);
    return (
      <PlanSettings
        plan={plan}
        billing={billing}
        allowanceKind={allowanceFor(own).kind}
        capSeconds={usage.capSeconds}
        planLeftSeconds={secondsLeft(usage.usedSeconds, usage.capSeconds)}
        extraSeconds={usage.creditSeconds}
        nextExtraExpiresAt={usage.nextCreditExpiresAt}
        resetsOn={usage.resetsOn ?? null}
        freeEnds={formatPilotEnd()}
        initialDialog={dialogForIntent(intent, plan)}
        cleanUrl={query.plan !== undefined || query.period !== undefined}
      />
    );
  }

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
      grantedSeconds={usage.grantedSeconds}
      lots={lots}
      nextCreditExpiresAt={usage.nextCreditExpiresAt}
      pilot={personal.individualPilot === true}
      resetsOn={freeHoursReturnOn()}
      freeEnds={formatPilotEnd()}
      legacyPro={isProPlan(context.viewer.plan)}
    />
  );
}

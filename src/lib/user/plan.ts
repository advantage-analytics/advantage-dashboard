/**
 * Paid entitlement lives in `users.plan`, not `users.role`.
 *
 * Migration 20260806144035 split the two and said why: `role` carried both a
 * profile persona (player/coach/parent/academy) AND the marker `'founder'` for
 * a paid account, so saving the profile form silently cleared Pro. It added
 * `users.plan`, backfilled it, and documented `plan` as the column billing
 * writes — but the app was never moved across, so billing kept writing
 * `role = 'founder'` and the Plan page kept reading it. Round 4 finishes the
 * migration: billing writes `plan`, every reader reads `plan`, and `role` is
 * persona-only in code as well as in the comment.
 *
 * Legacy `role = 'founder'` values are left alone. The migration already set
 * `plan = 'pro'` for every one of them, so nothing needs them. Settings no
 * longer edits `role` at all; only onboarding writes it.
 *
 * Client-safe: the Plan settings page is a client component and imports from
 * here. Keep this file free of server imports: `users.plan` is written only
 * by the Stripe webhook, through the service role (`services/billing`).
 */

import {
  coachPlan,
  isCoachPlanId,
  type CoachPlan,
  type CoachPlanId,
} from "@/lib/billing/plans";
import { teamLabel, type Viewer, type Workspace } from "@/lib/workspace/types";

/** A personal plan's id: what `users.plan` holds from 2027. */
export type PlanId = CoachPlanId;

/**
 * The plan a `users.plan` value stands for, with its price and hours from
 * `lib/billing/plans.ts`.
 *
 * Anything that is not a plan on sale reads as Free: null, an unknown value,
 * and the legacy `pro` (the one Lifetime account, which moves to Free by
 * decision 4 of docs/plans/2027-pricing.md). The column still admits `pro`
 * until that row is moved; `isProPlan` below still names it for the beta's
 * own Settings › Plan, which is what an account sees until plans go on sale.
 */
export function planFor(plan: string | null | undefined): CoachPlan {
  return coachPlan(isCoachPlanId(plan) ? plan : "free");
}

/** Whether a `users.plan` value is a paid plan (Coach or Coach Pro). */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return planFor(plan).id !== "free";
}

/**
 * The legacy `users.plan` value for the early one-time Pro purchase
 * ("Lifetime"). Not a 2027 plan: `planFor()` reads it as Free.
 */
export const PRO_PLAN = "pro";

/** Whether a `users.plan` value entitles the account to Pro features. */
export function isProPlan(plan: string | null | undefined): boolean {
  return plan === PRO_PLAN;
}

/**
 * Which free programme a workspace is on UNTIL plans begin: every team
 * workspace is in the pilot, a personal one is in the beta. One answer for
 * the places that name it — the Plan strip below, the header pill and the
 * welcome dialog — so they cannot call the same workspace two different
 * things. From January 1, 2027 those surfaces read `planStandingFor()` in
 * `lib/billing/plan-copy.ts` instead, which names the plan.
 */
export function workspaceTier(
  active: Pick<Workspace, "kind">,
): "beta" | "pilot" {
  return active.kind === "team" ? "pilot" : "beta";
}

/**
 * The beta Plan strip's facts — Plan / Squad (team only) / Member since —
 * built once so a team workspace's Settings › Plan and its loading skeleton
 * (`SettingsPlanPending`) cannot say two different things while a request is
 * still in flight. The strip names the tier as a person would say it: Beta,
 * Lifetime (an early one-time Pro purchase) or Pilot (a program). Only drawn
 * until plans go on sale: from then Settings › Plan is `PlanSettings` in
 * every workspace and nothing reads this.
 */
export function planFacts(
  active: Pick<Workspace, "kind" | "team">,
  viewer: Pick<Viewer, "plan" | "memberSince">,
): { label: string; value: string }[] {
  const isTeam = workspaceTier(active) === "pilot";
  const facts = [
    {
      label: "Plan",
      value: isTeam ? "Pilot" : isProPlan(viewer.plan) ? "Lifetime" : "Beta",
    },
    isTeam ? { label: "Squad", value: teamLabel(active.team) ?? "—" } : null,
    { label: "Member since", value: viewer.memberSince ?? "—" },
  ];
  return facts.filter(
    (fact): fact is NonNullable<typeof fact> => fact !== null,
  );
}

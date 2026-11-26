/**
 * "I picked Coach, monthly, on the landing site" — carried from
 * `/sign-up?plan=coach&period=monthly` to Settings › Plan, where the checkout
 * dialog opens on it.
 *
 * The two values ride the existing `?next=` chain as the Plan page's own
 * query string, which survives the confirmation email. The one hop that
 * drops a `next` is first-run onboarding (the dashboard layout sends a new
 * account to `/onboarding` with nothing attached), so the sign-in that
 * follows the email also leaves a short-lived cookie for onboarding to read
 * when it finishes. The cookie says a plan name and a period and nothing
 * else; it grants nothing, and checkout decides every price on its own.
 *
 * Both values are checked against the plan module wherever they are read.
 * Anything else — an unknown plan, a missing period, `free` — is no intent,
 * and the person lands where they always did.
 *
 * Client-safe and pure.
 */

import { isCoachPlanId, type CoachPlanId, type PlanPeriod } from "./plans";

/** A plan that is sold: every `CoachPlanId` but Free. */
type PaidPlan = Exclude<CoachPlanId, "free">;

export interface PlanIntent {
  plan: PaidPlan;
  period: PlanPeriod;
}

/** Settings › Plan. The same path as `PLAN_HREF` in `services/credits/packs`. */
export const PLAN_SETTINGS_PATH = "/dashboard/settings/plan";

export const PLAN_INTENT_COOKIE = "plan-intent";
/** Long enough to answer onboarding's questions; short enough to be harmless. */
export const PLAN_INTENT_MAX_AGE_SECONDS = 60 * 60;

function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The intent two query values name, or null. `free` is a valid plan and is
 * still null: there is nothing to check out, and Home is where it lands.
 */
export function parsePlanIntent(
  plan: unknown,
  period: unknown,
): PlanIntent | null {
  const planValue = one(plan);
  const periodValue = one(period);
  if (!isCoachPlanId(planValue) || planValue === "free") return null;
  if (periodValue !== "monthly" && periodValue !== "yearly") return null;
  return { plan: planValue, period: periodValue };
}

/** `/dashboard/settings/plan?plan=coach&period=monthly`. */
export function planIntentHref(intent: PlanIntent): string {
  return `${PLAN_SETTINGS_PATH}?plan=${intent.plan}&period=${intent.period}`;
}

/** The intent a same-origin path carries, when it is the Plan page's. */
export function planIntentFromPath(
  path: string | null | undefined,
): PlanIntent | null {
  if (!path) return null;
  try {
    const url = new URL(path, "https://next.invalid");
    if (url.origin !== "https://next.invalid") return null;
    if (url.pathname !== PLAN_SETTINGS_PATH) return null;
    return parsePlanIntent(
      url.searchParams.get("plan"),
      url.searchParams.get("period"),
    );
  } catch {
    return null;
  }
}

/** The cookie's value: `coach.monthly`. */
export function encodePlanIntent(intent: PlanIntent): string {
  return `${intent.plan}.${intent.period}`;
}

export function decodePlanIntent(
  value: string | null | undefined,
): PlanIntent | null {
  if (!value) return null;
  const at = value.lastIndexOf(".");
  if (at <= 0) return null;
  return parsePlanIntent(value.slice(0, at), value.slice(at + 1));
}

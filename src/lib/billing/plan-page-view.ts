/**
 * What Settings › Plan says once plans are on sale — the Video hours figure
 * and its one line, and the Plan card's rows — as data, so the rows each
 * plan gets can be checked without rendering (`tests/plan-page-view.spec.ts`).
 *
 * Two cards for every player, so the page reads as one page with different
 * values: Free's "Choose a plan" sits where a subscriber's "Upgrade" sits.
 * No meter here; the meter and the history live on Usage.
 *
 * Client-safe and pure. Every figure is the plan module's.
 */

import { formatHoursLong, isUnlimitedCap } from "@/lib/data/usage-format";
import { hoursLeftLabel, type CheckoutMode } from "./checkout-view";
import type { PlanBilling } from "./plan-fields";
import type { PlanIntent } from "./plan-intent";
import {
  ASK_QUESTIONS_PER_MONTH,
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  coachPlan,
  usd,
  type CoachPlanId,
} from "./plans";

export interface PlanPageInput {
  /** `planFor(users.plan).id`. */
  plan: CoachPlanId;
  billing: PlanBilling;
  /** `VideoAllowance.kind` for the viewer's personal workspace. */
  allowanceKind: string;
  capSeconds: number;
  /** Hours left in the window that are not extra hours. */
  planLeftSeconds: number;
  /** Extra hours (credits) left. */
  extraSeconds: number;
  /** When the soonest extra hours expire, an ISO instant. */
  nextExtraExpiresAt: string | null;
  /** When the window turns over — "Feb 14" — or null. */
  resetsOn: string | null;
  /** The beta's last day — "Dec 31, 2026" — for an account still on it. */
  freeEnds: string;
}

export type PlanPageAction =
  | {
      kind: "dialog";
      label: string;
      tone: "primary" | "outline";
      mode: CheckoutMode;
    }
  | { kind: "portal"; label: string; tone: "outline" };

export interface PlanPageRow {
  id: "plan" | "extra" | "billing";
  label: string;
  /** A grey `StatePill` beside the label ("Monthly"). */
  pill?: string;
  description: string;
  action?: PlanPageAction;
}

export interface PlanPageView {
  hours: { figure: string; unit: string; line: string };
  rows: PlanPageRow[];
}

function day(iso: string, withYear: boolean): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function hoursCard(input: PlanPageInput): PlanPageView["hours"] {
  const { planLeftSeconds: left, extraSeconds: extra, resetsOn } = input;
  if (isUnlimitedCap(input.capSeconds)) {
    return {
      figure: "Unlimited",
      unit: "",
      line: "Admin accounts have no monthly cap.",
    };
  }
  const figure = hoursLeftLabel(left + extra);
  const plusExtra = extra > 0 ? ` + ${formatHoursLong(extra)} extra` : "";
  const resets = resetsOn ? ` · Resets ${resetsOn}` : "";

  if (input.allowanceKind === "plan" && input.plan !== "free") {
    return {
      figure,
      unit: "left this month",
      line: `${hoursLeftLabel(left)} of ${coachPlan(input.plan).name} this month${plusExtra}${resets}`,
    };
  }
  if (input.allowanceKind === "beta") {
    return {
      figure,
      unit: "left this month",
      line: `${hoursLeftLabel(left)} free this month${plusExtra} · Free hours end ${input.freeEnds}`,
    };
  }
  if (input.allowanceKind === "override") {
    return {
      figure,
      unit: "left this month",
      line: `${hoursLeftLabel(left)} of your ${formatHoursLong(input.capSeconds)} this month${plusExtra}${resets}`,
    };
  }
  if (extra > 0) {
    const expires = input.nextExtraExpiresAt
      ? day(input.nextExtraExpiresAt, true)
      : null;
    return {
      figure,
      unit: "left",
      line: `${formatHoursLong(extra)} of extra hours${expires ? ` · Next to expire ${expires}` : ""}`,
    };
  }
  return {
    figure,
    unit: "left this month",
    line: "No plan hours or extra hours yet",
  };
}

/** "first month half off". */
function firstMonthClause(): string {
  return FIRST_MONTH_DISCOUNT_PERCENT === 50
    ? "first month half off"
    : `first month ${FIRST_MONTH_DISCOUNT_PERCENT}% off`;
}

export function buildPlanPage(input: PlanPageInput): PlanPageView {
  const { plan, billing } = input;
  const rows: PlanPageRow[] = [];
  const coach = coachPlan("coach");

  if (plan === "free") {
    rows.push({
      id: "plan",
      label: "Free",
      description: `${ASK_QUESTIONS_PER_MONTH.free} Ask questions a month · ${coach.name} from ${usd(coach.monthly)}${
        billing.everSubscribed ? " a month" : `, ${firstMonthClause()}`
      }`,
      action: {
        kind: "dialog",
        label: "Choose a plan",
        tone: "primary",
        mode: { kind: "choose" },
      },
    });
  } else {
    const current = coachPlan(plan);
    const yearly = billing.period === "yearly";
    const renews = billing.periodEnd ? day(billing.periodEnd, yearly) : null;
    const price = usd(yearly ? current.yearly : current.monthly);
    const tail =
      billing.status === "past_due"
        ? " · Payment failed. Update your card in Manage billing"
        : renews
          ? ` · Renews ${renews} at ${price}`
          : "";
    rows.push({
      id: "plan",
      label: current.name,
      ...(billing.period ? { pill: yearly ? "Yearly" : "Monthly" } : {}),
      description: `${current.hours ?? 0} hours of match video a month${tail}`,
      ...(plan === "coach"
        ? {
            action: {
              kind: "dialog" as const,
              label: `Upgrade to ${coachPlan("coach-pro").name}`,
              tone: "primary" as const,
              mode: { kind: "upgrade" as const },
            },
          }
        : {}),
    });
  }

  // An admin's hours cover every upload, so extra hours would never be spent.
  if (!isUnlimitedCap(input.capSeconds)) {
    rows.push({
      id: "extra",
      label: "Extra hours",
      description: `${usd(EXTRA_HOUR_PRICE)} an hour · Last ${EXTRA_HOUR_VALIDITY_MONTHS} months · ${
        plan === "free" ? "No plan needed" : "Used after your plan's hours"
      }`,
      action: {
        kind: "dialog",
        label: "Buy hours",
        tone: "outline",
        mode: { kind: "hours" },
      },
    });
  }

  if (plan !== "free") {
    rows.push({
      id: "billing",
      label: "Billing",
      description: "Card, receipts and cancelling.",
      action: { kind: "portal", label: "Manage billing ↗", tone: "outline" },
    });
  }

  return { hours: hoursCard(input), rows };
}

/**
 * The dialog `?plan=&period=` opens on arrival, for the plan the account is
 * already on: a Free player gets that plan chosen; a Coach subscriber who
 * picked Coach Pro gets the upgrade; anyone already on the plan they picked,
 * or above it, gets nothing.
 */
export function dialogForIntent(
  intent: PlanIntent | null,
  plan: CoachPlanId,
): CheckoutMode | null {
  if (!intent) return null;
  if (plan === "free") {
    return { kind: "choose", plan: intent.plan, period: intent.period };
  }
  if (plan === "coach" && intent.plan === "coach-pro")
    return { kind: "upgrade" };
  return null;
}

/**
 * What Settings › Plan says once plans are on sale — the Video hours figure
 * and its one line, and the Plan card's rows — as data, so the rows each
 * plan gets can be checked without rendering (`tests/plan-page-view.spec.ts`).
 *
 * Two cards for every player, so the page reads as one page with different
 * values: Free's "Choose a plan" sits where a subscriber's "Upgrade" sits.
 * No meter here; the meter and the history live on Usage.
 *
 * A monthly subscriber also has a Pay yearly row. After a failed renewal
 * (`billing.status === "past_due"`) the plan stays: its row and the Video
 * hours line say so, the row's action is Update card, and no plan change is
 * offered until the card is fixed.
 *
 * Client-safe and pure. Every figure is the plan module's.
 */

import { formatHoursLong, isUnlimitedCap } from "@/lib/data/usage-format";
import {
  hoursLeftLabel,
  utcDayLabel,
  type CheckoutMode,
  type ScheduledChange,
} from "./checkout-view";
import type { PlanBilling } from "./plan-fields";
import type { PlanIntent } from "./plan-intent";
import {
  ASK_QUESTIONS_PER_MONTH,
  EXTRA_HOUR_VALIDITY_MONTHS,
  extraHourRate,
  firstMonthOffer,
  personalPlan,
  planHeadline,
  planHoursLine,
  usd,
  type PersonalPlanId,
} from "./plans";

export interface PlanPageInput {
  /** `planFor(users.plan).id`. */
  plan: PersonalPlanId;
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
  /**
   * MOCK ONLY — set by `/design/plans-2027` and by nothing else. How the plan
   * row would carry a change at renewal, before that is built.
   */
  mock?: PlanPageMock;
}

/**
 * MOCK ONLY. `change-plan`: the plan row offers a quiet "Change plan", which
 * is where the change dialog would open from. `scheduled`: a change is
 * waiting for renewal, and the row says so and offers to keep the plan.
 */
export type PlanPageMock =
  | { kind: "change-plan"; change: ScheduledChange }
  | { kind: "scheduled"; change: ScheduledChange };

/**
 * What Settings › Plan says of a failed renewal, on the plan row and on the
 * Video hours card: the plan stays, this month's hours wait on the card.
 */
export const PLAN_PAST_DUE_LINE =
  "Payment failed. Update your card to get this month's hours.";

export type PlanPageAction =
  | {
      kind: "dialog";
      label: string;
      tone: "primary" | "outline";
      mode: CheckoutMode;
    }
  | { kind: "portal"; label: string; tone: "primary" | "outline" }
  /**
   * MOCK ONLY: a quiet text action. With a `mode` it opens the checkout
   * dialog on it; without, it does nothing. `buildPlanPage()` makes one only
   * from `PlanPageInput.mock`.
   */
  | { kind: "quiet"; label: string; mode?: CheckoutMode };

export interface PlanPageRow {
  id: "plan" | "yearly" | "extra" | "billing";
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

  // A failed renewal: the line is that, where the reset day would be.
  if (isPastDue(input)) {
    return { figure, unit: "left this month", line: PLAN_PAST_DUE_LINE };
  }

  if (input.allowanceKind === "plan" && input.plan !== "free") {
    return {
      figure,
      unit: "left this month",
      line: `${hoursLeftLabel(left)} of ${personalPlan(input.plan).name} this month${plusExtra}${resets}`,
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
      ? utcDayLabel(input.nextExtraExpiresAt, true)
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

/** A paid plan whose last payment failed, by the subscription's own status. */
function isPastDue(input: Pick<PlanPageInput, "plan" | "billing">): boolean {
  return input.plan !== "free" && input.billing.status === "past_due";
}

/** `Feb 14`, or `Jan 14, 2028` for a change a year's renewal brings. */
function changeDay(change: ScheduledChange, withYear: boolean): string {
  return utcDayLabel(change.effectiveOn, withYear) ?? "renewal";
}

export function buildPlanPage(input: PlanPageInput): PlanPageView {
  const { plan, billing } = input;
  const rows: PlanPageRow[] = [];
  const player = personalPlan("player");

  if (plan === "free") {
    rows.push({
      id: "plan",
      label: "Free",
      description: `${planHeadline("free")} · ${ASK_QUESTIONS_PER_MONTH.free} Ask questions a month · ${player.name} from ${usd(player.monthly)}${
        billing.everSubscribed ? " a month" : `, ${firstMonthOffer()}`
      }`,
      action: {
        kind: "dialog",
        label: "Choose a plan",
        tone: "primary",
        mode: { kind: "choose" },
      },
    });
  } else {
    const current = personalPlan(plan);
    const yearly = billing.period === "yearly";
    const pastDue = isPastDue(input);
    const upgrade: PlanPageAction | undefined =
      plan === "player"
        ? {
            kind: "dialog",
            label: `Upgrade to ${personalPlan("player-pro").name}`,
            tone: "primary",
            mode: { kind: "upgrade" },
          }
        : undefined;
    // A failed renewal: the row says so and its action is the card, the same
    // portal Manage billing opens. No plan change is offered until then.
    const action: PlanPageAction | undefined = pastDue
      ? { kind: "portal", label: "Update card", tone: "primary" }
      : upgrade;
    const planRow: PlanPageRow = {
      id: "plan",
      label: current.name,
      ...(billing.period ? { pill: yearly ? "Yearly" : "Monthly" } : {}),
      description: pastDue
        ? PLAN_PAST_DUE_LINE
        : `${planHeadline(plan)} · ${planHoursLine(plan)}`,
      ...(action ? { action } : {}),
    };

    // MOCK ONLY: a change at renewal, drawn on the plan row.
    const mock = pastDue ? undefined : input.mock;
    if (mock?.kind === "change-plan") {
      planRow.action = {
        kind: "quiet",
        label: "Change plan",
        mode: { kind: "change", change: mock.change },
      };
    } else if (mock?.kind === "scheduled") {
      const to = personalPlan(mock.change.to.plan);
      const where =
        mock.change.to.plan === plan ? mock.change.to.period : to.name;
      planRow.description = `Moves to ${where} on ${changeDay(mock.change, yearly)}`;
      planRow.action = { kind: "quiet", label: `Keep ${current.name}` };
    }
    rows.push(planRow);

    // Pay yearly: one month free, for a monthly subscriber in good standing.
    if (
      billing.period === "monthly" &&
      !pastDue &&
      mock?.kind !== "scheduled"
    ) {
      rows.push({
        id: "yearly",
        label: "Pay yearly",
        description: `${usd(current.yearly)} a year. One month free.`,
        action: {
          kind: "dialog",
          label: "Switch to yearly",
          tone: "outline",
          mode: { kind: "yearly" },
        },
      });
    }
  }

  // An admin's hours cover every upload, so extra hours would never be spent.
  if (!isUnlimitedCap(input.capSeconds)) {
    rows.push({
      id: "extra",
      label: "Extra hours",
      description: `${extraHourRate()} · Last ${EXTRA_HOUR_VALIDITY_MONTHS} months · ${
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
 * already on: a Free player gets that plan chosen; a Player subscriber who
 * picked Player Pro gets the upgrade; anyone already on the plan they picked,
 * or above it, gets nothing.
 */
export function dialogForIntent(
  intent: PlanIntent | null,
  plan: PersonalPlanId,
): CheckoutMode | null {
  if (!intent) return null;
  if (plan === "free") {
    return { kind: "choose", plan: intent.plan, period: intent.period };
  }
  if (plan === "player" && intent.plan === "player-pro")
    return { kind: "upgrade" };
  return null;
}

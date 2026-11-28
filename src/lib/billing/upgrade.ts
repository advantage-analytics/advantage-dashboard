/**
 * What a change that is charged today costs — decision 7 of
 * docs/plans/2027-pricing.md, and the same rule for paying yearly.
 *
 * Exactly two changes are charged today (`upgradeKind()`), and both start a
 * new billing period the moment they happen:
 *
 *   plan     Coach → Coach Pro on the same period: the new plan's full period
 *            price, less a credit for the unused part of the old plan, and
 *            the new plan's full hours fresh.
 *   period   monthly → yearly on the same plan: the yearly price, less the
 *            same credit for the unused part of the current month. Hours stay
 *            monthly slices, the first one fresh today.
 *
 * Everything else (a smaller plan, yearly → monthly, both at once) waits for
 * renewal and is not priced here.
 *
 *   credit = what the old plan cost for the period
 *            × min(share of the period's TIME left,
 *                  share of the period's plan HOURS left)
 *
 * "What the old plan cost" is what the customer PAID for the current period
 * before tax (`paidForPeriodCents`: the period's invoice after discounts),
 * never more than the list price. A first-month half-off subscriber paid $75
 * for the month, so 15 of 30 days left credits $37.50, not $75 — a credit
 * from list price would hand back more than was paid. This function stays
 * pure: the server reads the invoice and passes the figure in; with none
 * given, the list price is the basis.
 *
 * The smaller share, so hours already used are never refunded: half the
 * month left but 23m of 5h left credits $11.50, not $75. Stripe's own
 * proration only counts days, which is why the server computes this and
 * hands Stripe the figure (`services/billing/upgrade.ts`).
 *
 * A yearly plan's hours come as twelve monthly slices that do not carry
 * over. Its "period's plan hours" are all twelve: the slices that have not
 * started count in full, the current one by what is left of it, and the past
 * ones not at all (used or lapsed).
 *
 * Integer cents, rounded half-up, never negative, the credit never above
 * what was paid (and so never above the old price). Exact: the shares are compared and multiplied as integers
 * (BigInt), never as floats. Before tax — Stripe Tax adds its own line.
 *
 * Client-safe and pure: the dialog shows these numbers and the server
 * charges them from the same function.
 */

import { addMonthsUtc } from "@/lib/services/splitstep/allowance";
import {
  coachPlan,
  planHoursSeconds,
  type CoachPlanId,
  type PlanPeriod,
} from "./plans";

const DAY_MS = 86_400_000;
const SLICES_A_YEAR = 12;

/** The only upgrade there is: Coach → Coach Pro, on the same period. */
export function isUpgrade(from: CoachPlanId, to: CoachPlanId): boolean {
  return from === "coach" && to === "coach-pro";
}

/** A plan and how it is billed: where a subscription is, or is going. */
export interface UpgradeTarget {
  plan: CoachPlanId;
  period: PlanPeriod;
}

/** `plan`: Coach → Coach Pro. `period`: monthly → yearly. */
export type UpgradeKind = "plan" | "period";

/**
 * Which charged-today change `from` → `to` is, or null when it is not one.
 * Exactly two are: a bigger plan on the same period, and the same paid plan
 * moved from monthly to yearly. Both at once is neither.
 */
export function upgradeKind(
  from: UpgradeTarget,
  to: UpgradeTarget,
): UpgradeKind | null {
  if (from.period === to.period) {
    return isUpgrade(from.plan, to.plan) ? "plan" : null;
  }
  return from.plan === to.plan &&
    from.plan !== "free" &&
    from.period === "monthly" &&
    to.period === "yearly"
    ? "period"
    : null;
}

/** A plan's price for one billing period, in US cents. */
export function periodPriceCents(
  plan: CoachPlanId,
  period: PlanPeriod,
): number {
  const { monthly, yearly } = coachPlan(plan);
  return (period === "monthly" ? monthly : yearly) * 100;
}

export interface UpgradeInput {
  from: CoachPlanId;
  to: CoachPlanId;
  /** How the CURRENT subscription is billed. */
  period: PlanPeriod;
  /**
   * How the new one is billed. Left out, the same as `period` (a plan
   * upgrade); `"yearly"` from a monthly `period` is the switch to yearly.
   * With `to`, this is the target `{ plan, period }`.
   */
  toPeriod?: PlanPeriod;
  /** The current billing period, as Stripe has it. */
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  /**
   * Plan seconds used in the CURRENT hours slice: the whole period for a
   * monthly plan, this month's slice for a yearly one.
   */
  usedSeconds: number;
  /**
   * What the customer paid for the CURRENT period of the old plan, before
   * tax and after discounts, in cents. Capped at the list price; omitted or
   * unreadable → the list price.
   */
  paidForPeriodCents?: number | null;
}

export interface UpgradeQuote {
  /** What the card is charged now, before tax. */
  payTodayCents: number;
  /** What comes off for the unused part of the old plan. */
  creditCents: number;
  /** Which share was the smaller one, and so set the credit. */
  creditBasis: "days" | "hours";
  /**
   * What each share alone would credit, under the same cap as `creditCents`
   * (which is the smaller of the two). The dialog prints both, so the rule
   * is read off the two numbers rather than taken on trust.
   */
  daysCreditCents: number;
  hoursCreditCents: number;
  /** Days of the current period left; a part day counts as one. */
  daysLeft: number;
  /** Plan seconds left in the current hours slice — what the meter shows. */
  hoursLeftSeconds: number;
  /** The new plan's full price for one period. */
  newPeriodPriceCents: number;
  /** The old plan's full (list) price for one period. */
  oldPeriodPriceCents: number;
  /**
   * What the credit is a share of: what was paid for the current period,
   * never above `oldPeriodPriceCents`. The three credit figures above are
   * all shares of THIS, so they stay consistent with one another.
   */
  creditBaseCents: number;
  /** When the new plan next bills, a UTC day `YYYY-MM-DD`. */
  nextBillingDay: string;
  /**
   * The hours share's two terms. Equal to `hoursLeftSeconds` and one month's
   * hours for a monthly plan; all twelve slices for a yearly one.
   */
  periodHoursLeftSeconds: number;
  periodHoursSeconds: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** `amount × numerator / denominator`, rounded half-up, exactly. */
function shareOf(amount: number, numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0) || numerator <= BigInt(0)) return 0;
  const two = BigInt(2);
  return Number(
    (two * BigInt(amount) * numerator + denominator) / (two * denominator),
  );
}

/**
 * How many of a yearly period's twelve slices have not started at `now`.
 * Slices are anchored on the period start, a month each — `hoursWindow()`.
 */
function futureSlices(periodStart: Date, now: Date): number {
  let current = 0;
  while (
    current < SLICES_A_YEAR - 1 &&
    addMonthsUtc(periodStart, current + 1).getTime() <= now.getTime()
  ) {
    current += 1;
  }
  return SLICES_A_YEAR - 1 - current;
}

export function quoteUpgrade(input: UpgradeInput): UpgradeQuote {
  const { from, to, period, periodStart, periodEnd, now } = input;
  const toPeriod = input.toPeriod ?? period;

  const oldPeriodPriceCents = periodPriceCents(from, period);
  const newPeriodPriceCents = periodPriceCents(to, toPeriod);
  const paid = input.paidForPeriodCents;
  const creditBaseCents =
    typeof paid === "number" && Number.isFinite(paid)
      ? clamp(Math.round(paid), 0, oldPeriodPriceCents)
      : oldPeriodPriceCents;

  const totalMs = Math.max(0, periodEnd.getTime() - periodStart.getTime());
  const leftMs = clamp(periodEnd.getTime() - now.getTime(), 0, totalMs);

  const sliceSeconds = planHoursSeconds(from);
  const used = Number.isFinite(input.usedSeconds) ? input.usedSeconds : 0;
  const hoursLeftSeconds = Math.round(
    clamp(sliceSeconds - used, 0, sliceSeconds),
  );
  const yearly = period === "yearly";
  const periodHoursSeconds = sliceSeconds * (yearly ? SLICES_A_YEAR : 1);
  const periodHoursLeftSeconds = yearly
    ? futureSlices(periodStart, now) * sliceSeconds + hoursLeftSeconds
    : hoursLeftSeconds;

  // leftMs / totalMs  <=  hoursLeft / hoursTotal, cross-multiplied. A tie is
  // "days"; a period or plan with nothing in it has a zero share.
  const timeN = BigInt(leftMs);
  const timeD = BigInt(totalMs);
  const hoursN = BigInt(periodHoursLeftSeconds);
  const hoursD = BigInt(periodHoursSeconds);
  const daysIsSmaller =
    hoursD <= BigInt(0) ||
    (timeD > BigInt(0) ? timeN * hoursD <= hoursN * timeD : true);
  const creditBasis = daysIsSmaller ? "days" : "hours";

  const creditCap = Math.min(creditBaseCents, newPeriodPriceCents);
  const daysCreditCents = clamp(
    shareOf(creditBaseCents, timeN, timeD),
    0,
    creditCap,
  );
  const hoursCreditCents = clamp(
    shareOf(creditBaseCents, hoursN, hoursD),
    0,
    creditCap,
  );
  const creditCents = daysIsSmaller ? daysCreditCents : hoursCreditCents;

  return {
    payTodayCents: Math.max(0, newPeriodPriceCents - creditCents),
    creditCents,
    creditBasis,
    daysCreditCents,
    hoursCreditCents,
    daysLeft: Math.ceil(leftMs / DAY_MS),
    hoursLeftSeconds,
    newPeriodPriceCents,
    oldPeriodPriceCents,
    creditBaseCents,
    // The NEW subscription's first renewal: a year on when it is yearly.
    nextBillingDay: addMonthsUtc(now, toPeriod === "yearly" ? 12 : 1)
      .toISOString()
      .slice(0, 10),
    periodHoursLeftSeconds,
    periodHoursSeconds,
  };
}

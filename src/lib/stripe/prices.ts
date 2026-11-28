/**
 * Which Stripe Price is which plan — read from the environment, never typed
 * into code, so test mode and live mode differ only by `.env`.
 *
 * `scripts/stripe/setup-plans-2027.ts` creates the objects and prints these
 * lines. An unset (or malformed) variable is not an error at boot: the page
 * still renders and only the checkout for THAT item is refused, with
 * `code: "price_not_configured"`.
 *
 * Two directions: `priceIdFor()` to open a checkout, and `planForPriceId()`
 * so the webhook can turn a subscription's price back into a plan. A price
 * id that maps to nothing is the webhook's "change nothing and log" case.
 *
 * Server only in practice (none of these are `NEXT_PUBLIC_`), but it imports
 * nothing server-side, so a spec can read it with `process.env` set.
 */

import type { PersonalPlanId, PlanPeriod } from "@/lib/billing/plans";

/** A plan that is sold: every `PersonalPlanId` but Free. */
export type PaidPlanId = Exclude<PersonalPlanId, "free">;

export const PAID_PLAN_IDS: readonly PaidPlanId[] = ["player", "player-pro"];
export const PLAN_PERIODS: readonly PlanPeriod[] = ["monthly", "yearly"];

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "player" || value === "player-pro";
}

export function isPlanPeriod(value: unknown): value is PlanPeriod {
  return value === "monthly" || value === "yearly";
}

/** The variable that holds each recurring price. */
export const PLAN_PRICE_ENV = {
  player: {
    monthly: "STRIPE_PRICE_PLAYER_MONTHLY",
    yearly: "STRIPE_PRICE_PLAYER_YEARLY",
  },
  "player-pro": {
    monthly: "STRIPE_PRICE_PLAYER_PRO_MONTHLY",
    yearly: "STRIPE_PRICE_PLAYER_PRO_YEARLY",
  },
} as const satisfies Record<PaidPlanId, Record<PlanPeriod, string>>;

export const EXTRA_HOUR_PRICE_ENV = "STRIPE_PRICE_EXTRA_HOUR";
export const FIRST_MONTH_COUPON_ENV = "STRIPE_COUPON_FIRST_MONTH";
export const PORTAL_CONFIGURATION_ENV = "STRIPE_PORTAL_CONFIGURATION";

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string, prefix?: string): string | null {
  const value = env[name]?.trim();
  if (!value) return null;
  return prefix && !value.startsWith(prefix) ? null : value;
}

/** The recurring Price for a plan and period, or null when it is not set. */
export function priceIdFor(
  plan: PaidPlanId,
  period: PlanPeriod,
  env: Env = process.env,
): string | null {
  return read(env, PLAN_PRICE_ENV[plan][period], "price_");
}

/**
 * The plan and period a Price stands for, or null for a price this
 * deployment does not sell (another product, a price from the other mode, a
 * retired one). Never guesses from an amount or a product name.
 */
export function planForPriceId(
  priceId: string | null | undefined,
  env: Env = process.env,
): { plan: PaidPlanId; period: PlanPeriod } | null {
  if (!priceId) return null;
  for (const plan of PAID_PLAN_IDS) {
    for (const period of PLAN_PERIODS) {
      if (priceIdFor(plan, period, env) === priceId) return { plan, period };
    }
  }
  return null;
}

/** The one-time $35 Price an extra hour is sold at, or null when unset. */
export function extraHourPriceId(env: Env = process.env): string | null {
  return read(env, EXTRA_HOUR_PRICE_ENV, "price_");
}

/** The first-month, once coupon for a first monthly subscription, or null. */
export function firstMonthCouponId(env: Env = process.env): string | null {
  return read(env, FIRST_MONTH_COUPON_ENV);
}

/**
 * The Customer Portal configuration (card, invoices, cancel at period end; no
 * plan switching). Required to open the portal: `openPortal` refuses without
 * it rather than fall back to the account's default configuration, which may
 * allow plan switching.
 */
export function portalConfigurationId(env: Env = process.env): string | null {
  return read(env, PORTAL_CONFIGURATION_ENV, "bpc_");
}

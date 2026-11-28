/**
 * Create the Stripe objects the 2027 plans are sold through, and print the
 * `.env` lines that name them. Every price and hour count comes from
 * `src/lib/billing/plans.ts`; nothing is typed here.
 *
 * What it makes (docs/plans/2027-pricing.md, stage C):
 *
 *   - Player and Player Pro, each with a monthly and a yearly recurring Price;
 *   - "Extra video hour", a one-time Price sold by quantity;
 *   - a `duration: once` coupon for the first month, at the plan module's
 *     `FIRST_MONTH_DISCOUNT_PERCENT`. Its id carries the percentage
 *     (`advantage-first-month-30-2027`), so a changed offer makes a NEW
 *     coupon rather than refusing over the old one. The 50% coupon an
 *     earlier run made (`advantage-first-month-2027`) is no longer used:
 *     delete it in the Dashboard, and paste the new id into
 *     `STRIPE_COUPON_FIRST_MONTH`;
 *   - six college products (Starter / Program / Elite × Spring / Full year),
 *     each with a one-time Price, so invoices sent from the Dashboard read
 *     the same. The app never checks these;
 *   - a Customer Portal configuration: card, invoices, cancel at the end of
 *     the period — and NO plan switching (an upgrade goes through the app).
 *
 * IDEMPOTENT. Products and the coupon have fixed ids, Prices are found by
 * `lookup_key`, the portal configuration by its metadata. A second run
 * creates nothing and prints the same lines. A Price cannot be edited: if a
 * figure in the plan module changes, this refuses rather than silently keep
 * selling the old amount — archive the old Price in the Dashboard (or change
 * its lookup key) and run again.
 *
 * Run from the repo root, against a TEST key first:
 *   npx tsx scripts/stripe/setup-plans-2027.ts
 *   npx tsx scripts/stripe/setup-plans-2027.ts --live     # live mode, on purpose
 *
 * Reads STRIPE_SECRET_KEY from the shell or `.env.local`. It REFUSES a live
 * key (`sk_live_…` / `rk_live_…`) unless `--live` is passed.
 */
import Stripe from "stripe";

import { loadEnvLocal } from "../lib/env";
import {
  COLLEGE_PLANS,
  EXTRA_HOUR_PRICE,
  EXTRA_HOUR_VALIDITY_MONTHS,
  FIRST_MONTH_DISCOUNT_PERCENT,
  PLAN_TERM_LABELS,
  firstMonthOffer,
  personalPlan,
  seasonAllowance,
  type PlanPeriod,
  type PlanTerm,
} from "../../src/lib/billing/plans";
import {
  EXTRA_HOUR_PRICE_ENV,
  FIRST_MONTH_COUPON_ENV,
  PAID_PLAN_IDS,
  PLAN_PERIODS,
  PLAN_PRICE_ENV,
  PORTAL_CONFIGURATION_ENV,
} from "../../src/lib/stripe/prices";

loadEnvLocal();

/** "General — electronically supplied services", as the pack checkout uses. */
const TAX_CODE = "txcd_10000000";
const COUPON_ID = `advantage-first-month-${FIRST_MONTH_DISCOUNT_PERCENT}-2027`;
const PORTAL_KEY = "advantage-2027";
const TERMS: readonly PlanTerm[] = ["spring", "full_year"];

async function ensureProduct(
  stripe: Stripe,
  id: string,
  name: string,
  description: string,
): Promise<string> {
  try {
    const existing = await stripe.products.retrieve(id);
    console.log(`  product  ${id}  (exists)`);
    return existing.id;
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
  }
  const created = await stripe.products.create({
    id,
    name,
    description,
    tax_code: TAX_CODE,
  });
  console.log(`  product  ${id}  created`);
  return created.id;
}

async function ensurePrice(
  stripe: Stripe,
  params: {
    lookupKey: string;
    product: string;
    dollars: number;
    interval?: "month" | "year";
    nickname: string;
  },
): Promise<string> {
  const { lookupKey, product, dollars, interval, nickname } = params;
  const unitAmount = dollars * 100;
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const existing = found.data[0];
  if (existing) {
    const same =
      existing.unit_amount === unitAmount &&
      existing.currency === "usd" &&
      (existing.recurring?.interval ?? null) === (interval ?? null);
    if (!same) {
      throw new Error(
        `Price ${existing.id} (lookup key ${lookupKey}) is ${existing.unit_amount} ` +
          `${existing.currency} ${existing.recurring?.interval ?? "one-time"}, but the plan ` +
          `module says ${unitAmount} usd ${interval ?? "one-time"}. Archive it and run again.`,
      );
    }
    console.log(`  price    ${lookupKey}  (exists)  ${existing.id}`);
    return existing.id;
  }
  const created = await stripe.prices.create({
    product,
    currency: "usd",
    unit_amount: unitAmount,
    tax_behavior: "exclusive",
    lookup_key: lookupKey,
    nickname,
    ...(interval ? { recurring: { interval } } : {}),
  });
  console.log(`  price    ${lookupKey}  created   ${created.id}`);
  return created.id;
}

async function ensureCoupon(stripe: Stripe): Promise<string> {
  try {
    const existing = await stripe.coupons.retrieve(COUPON_ID);
    if (
      existing.percent_off !== FIRST_MONTH_DISCOUNT_PERCENT ||
      existing.duration !== "once"
    ) {
      throw new Error(
        `Coupon ${COUPON_ID} is ${existing.percent_off}% ${existing.duration}, but the plan ` +
          `module says ${FIRST_MONTH_DISCOUNT_PERCENT}% once. Delete it and run again.`,
      );
    }
    console.log(`  coupon   ${COUPON_ID}  (exists)`);
    return existing.id;
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
  }
  const created = await stripe.coupons.create({
    id: COUPON_ID,
    name: firstMonthOffer(),
    percent_off: FIRST_MONTH_DISCOUNT_PERCENT,
    duration: "once",
  });
  console.log(`  coupon   ${COUPON_ID}  created`);
  return created.id;
}

async function ensurePortal(stripe: Stripe): Promise<string> {
  const listed = await stripe.billingPortal.configurations.list({
    limit: 100,
  });
  const existing = listed.data.find(
    (configuration) =>
      configuration.active && configuration.metadata?.key === PORTAL_KEY,
  );
  if (existing) {
    console.log(`  portal   ${PORTAL_KEY}  (exists)  ${existing.id}`);
    return existing.id;
  }
  const created = await stripe.billingPortal.configurations.create({
    metadata: { key: PORTAL_KEY },
    business_profile: { headline: "Advantage: billing" },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "tax_id"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // Cancelling takes effect at renewal, never at once (decision 7).
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      // Plan changes go through the app's own Upgrade, which works out the
      // credit; the portal must never switch a price.
      subscription_update: { enabled: false },
    },
  });
  console.log(`  portal   ${PORTAL_KEY}  created   ${created.id}`);
  return created.id;
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Missing STRIPE_SECRET_KEY (shell or .env.local).");
    process.exit(1);
  }
  const live = /^(sk|rk)_live_/.test(key);
  if (live && !process.argv.includes("--live")) {
    console.error(
      "STRIPE_SECRET_KEY is a LIVE key. Nothing was created.\n" +
        "Run against a test key first; pass --live to create these in live mode on purpose.",
    );
    process.exit(1);
  }
  if (!live && !/^(sk|rk)_test_/.test(key)) {
    console.error("STRIPE_SECRET_KEY is neither a test nor a live secret key.");
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  console.log(`Stripe ${live ? "LIVE" : "test"} mode\n`);

  const env: [string, string][] = [];
  const INTERVAL: Record<PlanPeriod, "month" | "year"> = {
    monthly: "month",
    yearly: "year",
  };

  console.log("Plans");
  for (const planId of PAID_PLAN_IDS) {
    const plan = personalPlan(planId);
    const product = await ensureProduct(
      stripe,
      `advantage_${planId.replace("-", "_")}`,
      `Advantage ${plan.name}`,
      `${plan.hours} hours of match video analysed a month, about ${plan.matches} verified singles matches. Hours do not carry over.`,
    );
    for (const period of PLAN_PERIODS) {
      env.push([
        PLAN_PRICE_ENV[planId][period],
        await ensurePrice(stripe, {
          lookupKey: `advantage_${planId.replace("-", "_")}_${period}`,
          product,
          dollars: plan[period],
          interval: INTERVAL[period],
          nickname: `${plan.name}, ${period}`,
        }),
      ]);
    }
  }

  console.log("\nExtra hours");
  const hourProduct = await ensureProduct(
    stripe,
    "advantage_extra_hour",
    "Extra video hour",
    `One hour of match video analysis. Expires ${EXTRA_HOUR_VALIDITY_MONTHS} months after purchase. All sales final, except where required by law.`,
  );
  env.push([
    EXTRA_HOUR_PRICE_ENV,
    await ensurePrice(stripe, {
      lookupKey: "advantage_extra_hour",
      product: hourProduct,
      dollars: EXTRA_HOUR_PRICE,
      nickname: "Extra video hour",
    }),
  ]);

  console.log("\nFirst-month discount");
  env.push([FIRST_MONTH_COUPON_ENV, await ensureCoupon(stripe)]);

  console.log("\nCollege invoice products (the app never reads these)");
  for (const plan of COLLEGE_PLANS) {
    for (const term of TERMS) {
      const allowance = seasonAllowance(plan.id, term);
      const id = `advantage_college_${plan.id}_${term}`;
      const label = `${plan.name}, ${PLAN_TERM_LABELS[term]}`;
      const product = await ensureProduct(
        stripe,
        id,
        `Advantage ${label}`,
        `${allowance.hours} hours of match video analysed over the season, about ${allowance.matches} singles matches.`,
      );
      await ensurePrice(stripe, {
        lookupKey: id,
        product,
        dollars: allowance.price,
        nickname: label,
      });
    }
  }

  console.log("\nCustomer Portal");
  env.push([PORTAL_CONFIGURATION_ENV, await ensurePortal(stripe)]);

  console.log(
    `\nPaste into .env.local${live ? " / Vercel (production)" : ""}:\n`,
  );
  for (const [name, value] of env) console.log(`${name}=${value}`);
  console.log(
    "\nThen subscribe the webhook endpoint to: checkout.session.completed, " +
      "checkout.session.async_payment_succeeded, customer.subscription.created, " +
      "customer.subscription.updated, customer.subscription.deleted, invoice.paid, " +
      "invoice.payment_failed, charge.refunded, charge.dispute.created.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

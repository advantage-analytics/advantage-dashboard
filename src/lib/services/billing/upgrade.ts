/**
 * Coach → Coach Pro, on the same period — server only. Decision 7.
 *
 * The money is `quoteUpgrade()` (`lib/billing/upgrade.ts`): the new plan's
 * full period price, less a credit for the smaller of the time left and the
 * plan hours left. Stripe's own proration only counts days, so it is turned
 * off (`proration_behavior: "none"`) and the server hands Stripe the credit
 * as a CUSTOMER-BALANCE credit, which the upgrade's invoice consumes. The new
 * period starts now (`billing_cycle_anchor: "now"`), which moves
 * `plan_period_start` and so hands out the new plan's full hours.
 *
 * ── Order of Stripe calls, and what each failure leaves ────────────────────
 *
 *   0. read    subscription, usage → the quote. Nothing written.
 *   1. sweep   an earlier attempt's credit that never got its upgrade is
 *              reversed (see "The record" below). Fails → stop, nothing new.
 *   2. credit  customers.createBalanceTransaction(−credit), tagged with this
 *              attempt and subscription. Fails → stop; nothing to undo.
 *   3. update  subscriptions.update: Coach Pro price, anchor now, no
 *              proration, `payment_behavior: "error_if_incomplete"`, and
 *              `metadata.upgrade_attempt = <attempt>` in the SAME call.
 *              Stripe invoices the new period at once, applies the balance,
 *              charges the card. If the card fails the whole update is
 *              refused (402): no new price, no new period, no metadata.
 *   4. settle  after ANY failure of step 3 the subscription is read back:
 *                - it carries this attempt → the upgrade happened (a lost
 *                  response); carry on as a success;
 *                - it does not → reverse the credit (+credit);
 *                - it cannot be read → leave both, log; step 1 of the next
 *                  attempt settles it by the same rule.
 *   5. record  write the row from the subscription (`syncSubscription()`,
 *              which the webhook repeats) and mark the credit applied. Both
 *              best-effort: the upgrade already stands.
 *
 * ── The record ─────────────────────────────────────────────────────────────
 * Whether an upgrade happened is ONE fact held by Stripe: the subscription's
 * `metadata.upgrade_attempt`, written atomically with the price change. A
 * credit whose attempt the subscription names was used by that upgrade; a
 * credit it does not name (and that has no reversal) is an orphan and is
 * reversed. So a crash between steps 2 and 4 cannot leave a credit without
 * an upgrade past the next attempt, and an upgrade cannot happen without its
 * credit because the credit is on the balance before step 3 is sent.
 *
 * ── Twice at once ──────────────────────────────────────────────────────────
 * The attempt id is deterministic — subscription, its period start, and the
 * minute — and is the idempotency key of steps 2, 3 and the reversal. Two
 * clicks in one minute are one attempt to Stripe (the second gets the first's
 * answer, or "in progress"; a retry in the minute a card was declined is
 * told to wait for the next one); after a successful upgrade the plan is no longer
 * Coach and every later request is refused before step 1. A young,
 * unsettled credit from a DIFFERENT attempt means one is still running:
 * refused as in progress rather than raced.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { coachPlan, type PlanPeriod } from "@/lib/billing/plans";
import {
  isUpgrade,
  quoteUpgrade,
  type UpgradeQuote,
} from "@/lib/billing/upgrade";
import { expandableId } from "@/lib/services/credits/checkout";
import { hoursWindow } from "@/lib/services/splitstep/allowance";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import {
  accountTypeFor,
  scopeToAllowance,
  sumUsedSeconds,
  type UsageRow,
} from "@/lib/services/splitstep/quota";
import {
  PLAN_PRICE_ENV,
  planForPriceId,
  priceIdFor,
  type PaidPlanId,
} from "@/lib/stripe/prices";
import { SIGN_IN_REFUSAL, refuse, type BillingResult } from "./http";
import type { CheckoutUser } from "./checkout";
import {
  readBillingUser,
  subscriptionPeriod,
  subscriptionPriceId,
  syncSubscription,
} from "./subscription";

const UPGRADE_TO: PaidPlanId = "coach-pro";

export const UPGRADE_CREDIT_KIND = "upgrade_credit";
export const UPGRADE_REVERSAL_KIND = "upgrade_credit_reversal";

/** An unsettled credit younger than this belongs to an attempt still running. */
const IN_FLIGHT_MS = 10 * 60_000;

const UNAVAILABLE = (detail: string) =>
  refuse(
    "checkout_unavailable",
    502,
    "The upgrade couldn't be made. Try again in a moment.",
    detail,
  );
const IN_PROGRESS = (detail: string) =>
  refuse(
    "upgrade_in_progress",
    409,
    "Your upgrade is already being made. Give it a moment.",
    detail,
  );

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

type StripeErrorLike = { type?: string; code?: string; statusCode?: number };

function isIdempotencyConflict(error: unknown): boolean {
  const e = error as StripeErrorLike | null;
  return (
    e?.type === "StripeIdempotencyError" ||
    e?.code === "idempotency_key_in_use" ||
    e?.statusCode === 409
  );
}

function isCardFailure(error: unknown): boolean {
  const e = error as StripeErrorLike | null;
  return e?.type === "StripeCardError" || e?.statusCode === 402;
}

interface Prepared {
  userId: string;
  customerId: string;
  subscription: Stripe.Subscription;
  period: PlanPeriod;
  targetPriceId: string;
  quote: UpgradeQuote;
}

/** Plan seconds the user has drawn in the hours slice `now` falls in. */
async function readSliceUsedSeconds(
  admin: SupabaseClient,
  userId: string,
  periodStart: string,
  now: Date,
): Promise<number> {
  const slice = hoursWindow(periodStart, now);
  const { data, error } = await scopeToAllowance(
    admin
      .from("processing_usage")
      .select("reserved_seconds, actual_seconds")
      .eq("account_id", userId)
      .eq("account_type", accountTypeFor({ kind: "personal" }))
      .eq("released", false),
    {
      windowed: true,
      billingMonth: currentBillingMonth(now),
      windowStart: slice.start,
      windowEnd: slice.end,
    },
  );
  if (error) {
    throw new Error(`Could not read processing usage: ${error.message}`);
  }
  return sumUsedSeconds((data ?? []) as UsageRow[]);
}

/** Step 0: everything an upgrade is decided from. Writes nothing. */
async function prepareUpgrade(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  now: Date;
}): Promise<BillingResult<Prepared>> {
  const { stripe, admin, user, now } = params;
  if (!user) return { ok: false, error: SIGN_IN_REFUSAL };

  const NO_SUBSCRIPTION = (detail: string) =>
    refuse("no_subscription", 409, "You don't have a plan to upgrade.", detail);

  try {
    const row = await readBillingUser(admin, "id", user.id);
    if (!row?.stripe_subscription_id || !row.stripe_customer_id) {
      return NO_SUBSCRIPTION("no_subscription_on_row");
    }

    const subscription = await stripe.subscriptions.retrieve(
      row.stripe_subscription_id,
    );
    const customerId = expandableId(
      subscription.customer as string | { id: string } | null,
    );
    if (customerId !== row.stripe_customer_id) {
      return NO_SUBSCRIPTION("customer_mismatch");
    }

    const sold = planForPriceId(subscriptionPriceId(subscription));
    if (!sold || !isUpgrade(sold.plan, UPGRADE_TO)) {
      return refuse(
        "not_an_upgrade",
        409,
        `You're already on ${coachPlan(UPGRADE_TO).name}.`,
        sold ? `from_${sold.plan}` : "unknown_price",
      );
    }
    if (subscription.status !== "active") {
      return refuse(
        "not_an_upgrade",
        409,
        "Update your card before upgrading.",
        `status_${subscription.status}`,
      );
    }
    if (subscription.schedule) {
      // A change is already scheduled for renewal (set in the Dashboard);
      // rewriting the subscription under it would be undone at that renewal.
      return refuse(
        "not_an_upgrade",
        409,
        "A change to your plan is already scheduled. Contact us to upgrade.",
        "has_schedule",
      );
    }

    const targetPriceId = priceIdFor(UPGRADE_TO, sold.period);
    if (!targetPriceId) {
      return refuse(
        "price_not_configured",
        503,
        "Upgrading isn't available yet. Try again later.",
        PLAN_PRICE_ENV[UPGRADE_TO][sold.period],
      );
    }

    const period = subscriptionPeriod(subscription);
    if (!period.start || !period.end) return UNAVAILABLE("no_period");

    const usedSeconds = await readSliceUsedSeconds(
      admin,
      user.id,
      period.start,
      now,
    );
    return {
      ok: true,
      value: {
        userId: user.id,
        customerId,
        subscription,
        period: sold.period,
        targetPriceId,
        quote: quoteUpgrade({
          from: sold.plan,
          to: UPGRADE_TO,
          period: sold.period,
          periodStart: new Date(period.start),
          periodEnd: new Date(period.end),
          now,
          usedSeconds,
        }),
      },
    };
  } catch (error) {
    console.error("[billing] could not prepare the upgrade", {
      userId: user.id,
      error: message(error),
    });
    return UNAVAILABLE("prepare_failed");
  }
}

/** What the dialog shows, and what `executeUpgrade()` then charges. */
export type UpgradePreview = UpgradeQuote & {
  from: PaidPlanId;
  to: PaidPlanId;
  period: PlanPeriod;
};

export async function previewUpgrade(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  now?: Date;
}): Promise<BillingResult<UpgradePreview>> {
  const prepared = await prepareUpgrade({
    ...params,
    now: params.now ?? new Date(),
  });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    value: {
      ...prepared.value.quote,
      from: "coach",
      to: UPGRADE_TO,
      period: prepared.value.period,
    },
  };
}

/** The deterministic id of one upgrade attempt — see "Twice at once". */
export function upgradeAttemptId(
  subscription: Pick<Stripe.Subscription, "id" | "current_period_start">,
  now: Date,
): string {
  return `upg_${subscription.id}_${subscription.current_period_start}_${Math.floor(now.getTime() / 60_000)}`;
}

async function reverseCredit(params: {
  stripe: Stripe;
  customerId: string;
  attempt: string;
  subscriptionId: string;
  creditCents: number;
}): Promise<boolean> {
  const { stripe, customerId, attempt, subscriptionId, creditCents } = params;
  for (let tries = 0; tries < 3; tries += 1) {
    try {
      await stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount: creditCents,
          currency: "usd",
          description: "Upgrade not completed: credit reversed",
          metadata: {
            kind: UPGRADE_REVERSAL_KIND,
            attempt,
            subscription: subscriptionId,
          },
        },
        { idempotencyKey: `${attempt}:reverse` },
      );
      return true;
    } catch (error) {
      console.error("[billing] could not reverse an upgrade credit", {
        customerId,
        attempt,
        tries,
        error: message(error),
      });
    }
  }
  // Loud on purpose: this customer holds a credit with no upgrade behind it
  // until the next attempt's sweep, or a person, takes it back.
  console.error("[billing] UPGRADE CREDIT NOT REVERSED", {
    customerId,
    attempt,
    creditCents,
  });
  return false;
}

async function markApplied(
  stripe: Stripe,
  customerId: string,
  transaction: Stripe.CustomerBalanceTransaction,
): Promise<void> {
  try {
    await stripe.customers.updateBalanceTransaction(
      customerId,
      transaction.id,
      {
        metadata: { ...transaction.metadata, applied: "1" },
      },
    );
  } catch (error) {
    // Only a label: the subscription's metadata is the record.
    console.error("[billing] could not mark an upgrade credit applied", {
      customerId,
      transaction: transaction.id,
      error: message(error),
    });
  }
}

/**
 * Step 1. Settle this subscription's earlier upgrade credits: one the
 * subscription names was used; one it does not name, with no reversal, is
 * reversed. `"busy"` when another attempt looks to be still running.
 */
async function sweepUpgradeCredits(params: {
  stripe: Stripe;
  customerId: string;
  subscription: Stripe.Subscription;
  attempt: string;
  now: Date;
}): Promise<"clear" | "busy" | "spent" | "failed"> {
  const { stripe, customerId, subscription, attempt, now } = params;
  const { data } = await stripe.customers.listBalanceTransactions(customerId, {
    limit: 100,
  });
  const reversed = new Set(
    data
      .filter((t) => t.metadata?.kind === UPGRADE_REVERSAL_KIND)
      .map((t) => t.metadata?.attempt),
  );

  // This very attempt was already made and its credit taken back (a second
  // try inside the same minute). Its idempotency keys are used up: Stripe
  // would replay the first answers, so wait for the next minute's attempt.
  if (reversed.has(attempt)) return "spent";

  for (const credit of data) {
    const meta = credit.metadata ?? {};
    if (
      meta.kind !== UPGRADE_CREDIT_KIND ||
      !meta.attempt ||
      meta.subscription !== subscription.id ||
      meta.attempt === attempt ||
      meta.applied === "1" ||
      reversed.has(meta.attempt)
    ) {
      continue;
    }
    if (subscription.metadata?.upgrade_attempt === meta.attempt) {
      await markApplied(stripe, customerId, credit);
      continue;
    }
    if (now.getTime() - credit.created * 1000 < IN_FLIGHT_MS) return "busy";
    const ok = await reverseCredit({
      stripe,
      customerId,
      attempt: meta.attempt,
      subscriptionId: subscription.id,
      creditCents: -credit.amount,
    });
    if (!ok) return "failed";
  }
  return "clear";
}

export interface UpgradeDone {
  plan: PaidPlanId;
  period: PlanPeriod;
  payTodayCents: number;
  creditCents: number;
  nextBillingDay: string;
}

export async function executeUpgrade(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  /**
   * The `payTodayCents` the dialog showed, when it sends one. A quote that
   * has moved since (another match analysed, a day gone by) is refused with
   * the new figures rather than charged unseen.
   */
  expectedPayTodayCents?: number;
  now?: Date;
}): Promise<BillingResult<UpgradeDone>> {
  const { stripe, admin } = params;
  const now = params.now ?? new Date();

  const prepared = await prepareUpgrade({ ...params, now });
  if (!prepared.ok) return prepared;
  const { userId, customerId, subscription, period, targetPriceId, quote } =
    prepared.value;

  if (
    params.expectedPayTodayCents !== undefined &&
    params.expectedPayTodayCents !== quote.payTodayCents
  ) {
    return refuse(
      "quote_changed",
      409,
      "The amount has changed. Check the new total and confirm again.",
      "stale_quote",
    );
  }

  const item = subscription.items.data[0];
  const attempt = upgradeAttemptId(subscription, now);
  const log = { userId, customerId, subscriptionId: subscription.id, attempt };

  // 1. Settle anything an earlier attempt left.
  try {
    const swept = await sweepUpgradeCredits({
      stripe,
      customerId,
      subscription,
      attempt,
      now,
    });
    if (swept === "busy") return IN_PROGRESS("unsettled_credit");
    if (swept === "spent") {
      return refuse(
        "upgrade_in_progress",
        409,
        "That didn't go through. Try again in a minute.",
        "attempt_spent",
      );
    }
    if (swept === "failed") return UNAVAILABLE("sweep_failed");
  } catch (error) {
    console.error("[billing] could not sweep upgrade credits", {
      ...log,
      error: message(error),
    });
    return UNAVAILABLE("sweep_failed");
  }

  // 2. The credit, on the balance before the invoice exists.
  let credit: Stripe.CustomerBalanceTransaction | null = null;
  if (quote.creditCents > 0) {
    try {
      credit = await stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount: -quote.creditCents,
          currency: "usd",
          description: `Unused ${coachPlan("coach").name} time, credited on upgrade`,
          metadata: {
            kind: UPGRADE_CREDIT_KIND,
            attempt,
            subscription: subscription.id,
            basis: quote.creditBasis,
          },
        },
        { idempotencyKey: `${attempt}:credit` },
      );
    } catch (error) {
      console.error("[billing] could not create the upgrade credit", {
        ...log,
        error: message(error),
      });
      return isIdempotencyConflict(error)
        ? IN_PROGRESS("credit_in_flight")
        : UNAVAILABLE("credit_failed");
    }
  }

  // 3. The upgrade itself: price, period, charge and its own record, at once.
  let upgraded: Stripe.Subscription | null = null;
  let failure: unknown = null;
  try {
    upgraded = await stripe.subscriptions.update(
      subscription.id,
      {
        items: [{ id: item.id, price: targetPriceId }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
        payment_behavior: "error_if_incomplete",
        metadata: { ...subscription.metadata, upgrade_attempt: attempt },
      },
      { idempotencyKey: `${attempt}:update` },
    );
  } catch (error) {
    failure = error;
  }

  // 4. Settle a failure by what the subscription now says.
  if (!upgraded) {
    console.error("[billing] the upgrade call failed", {
      ...log,
      error: message(failure),
    });
    // A twin request holds the same attempt and the same credit: leave both.
    if (isIdempotencyConflict(failure)) return IN_PROGRESS("update_in_flight");

    let after: Stripe.Subscription | null = null;
    try {
      after = await stripe.subscriptions.retrieve(subscription.id);
    } catch (error) {
      console.error("[billing] upgrade outcome unknown; left to the sweep", {
        ...log,
        error: message(error),
      });
      return UNAVAILABLE("outcome_unknown");
    }

    if (after.metadata?.upgrade_attempt === attempt) {
      upgraded = after; // The response was lost; the upgrade was not.
    } else {
      if (credit) {
        await reverseCredit({
          stripe,
          customerId,
          attempt,
          subscriptionId: subscription.id,
          creditCents: quote.creditCents,
        });
      }
      return isCardFailure(failure)
        ? refuse(
            "payment_failed",
            402,
            "Your card was declined, so nothing changed. Update your card and try again.",
            "card_declined",
          )
        : UNAVAILABLE("update_failed");
    }
  }

  // 5. The upgrade stands. Record it; the webhook repeats both.
  if (credit) await markApplied(stripe, customerId, credit);
  try {
    await syncSubscription({
      admin,
      stripe,
      subscriptionId: upgraded.id,
      userIdHint: userId,
    });
  } catch (error) {
    console.error("[billing] upgraded, but the row is waiting on the webhook", {
      ...log,
      error: message(error),
    });
  }

  return {
    ok: true,
    value: {
      plan: UPGRADE_TO,
      period,
      payTodayCents: quote.payTodayCents,
      creditCents: quote.creditCents,
      nextBillingDay: quote.nextBillingDay,
    },
  };
}

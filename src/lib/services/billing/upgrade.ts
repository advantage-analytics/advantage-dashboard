/**
 * The two plan changes charged today — server only. Decision 7, and the same
 * rule for paying yearly:
 *
 *   plan     Player → Player Pro, on the same period (the Upgrade button);
 *   period   monthly → yearly, on the same plan (Pay yearly).
 *
 * `upgradeKind()` (`lib/billing/upgrade.ts`) admits exactly those; anything
 * else is refused `not_an_upgrade`. One machinery runs both: only the target
 * price, the attempt id and a few words differ.
 *
 * The money is `quoteUpgrade()`: the target's full period price, less a
 * credit for the smaller of the time left and the plan hours left. Stripe's own proration only counts days, so it is turned
 * off (`proration_behavior: "none"`) and the server hands Stripe the credit
 * as a CUSTOMER-BALANCE credit, which the upgrade's invoice consumes. The new
 * period starts now (`billing_cycle_anchor: "now"`), which moves
 * `plan_period_start` and so hands out a fresh month of the plan's hours.
 *
 * ── Order of Stripe calls, and what each failure leaves ────────────────────
 *
 *   0. read    subscription, its current period's paid invoice, usage → the
 *              quote. Nothing written. The credit is a share of what that
 *              invoice charged before tax (`periodPaidCents()`), so a
 *              discounted first month is never credited at list price.
 *   1. sweep   an earlier attempt's credit that never got its upgrade is
 *              reversed (see "The record" below). Fails → stop, nothing new.
 *   2. credit  customers.createBalanceTransaction(−credit), tagged with this
 *              attempt and subscription. Fails → stop; nothing to undo.
 *   3. update  subscriptions.update: the target's price, anchor now, no
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
 * The attempt id is deterministic — subscription, its period start, the
 * minute, and which change it is (a switch to yearly carries `_yearly`, so it
 * never shares a key with a plan upgrade asked in the same minute) — and is
 * the idempotency key of steps 2, 3 and the reversal. Two
 * clicks in one minute are one attempt to Stripe (the second gets the first's
 * answer, or "in progress"; a retry in the minute a card was declined is
 * told to wait for the next one); after a successful change the subscription
 * is already on its target and every later request is refused before step 1. A young,
 * unsettled credit from a DIFFERENT attempt means one is still running:
 * refused as in progress rather than raced.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { personalPlan, type PlanPeriod } from "@/lib/billing/plans";
import {
  quoteUpgrade,
  upgradeKind,
  type UpgradeKind,
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
  isPaidPlanId,
  isPlanPeriod,
  planForPriceId,
  priceIdFor,
  type PaidPlanId,
} from "@/lib/stripe/prices";
import { SIGN_IN_REFUSAL, refuse, type BillingResult } from "./http";
import { planProductName, type CheckoutUser } from "./checkout";
import {
  readBillingUser,
  subscriptionPeriod,
  subscriptionPriceId,
  syncSubscription,
} from "./subscription";

const UPGRADE_TO: PaidPlanId = "player-pro";

export const UPGRADE_CREDIT_KIND = "upgrade_credit";
export const UPGRADE_REVERSAL_KIND = "upgrade_credit_reversal";

/** An unsettled credit younger than this belongs to an attempt still running. */
const IN_FLIGHT_MS = 10 * 60_000;

/**
 * What the caller asked to move to. Each half left out stays as it is; with
 * nothing asked at all it is the Upgrade button: Player Pro on the same period.
 */
export interface UpgradeRequest {
  plan?: PaidPlanId;
  period?: PlanPeriod;
}

/**
 * The target a request body names, `undefined` when it names none, or `null`
 * when what it names is not a plan or a period at all. `{ period }`,
 * `{ plan }`, both, or the same two inside `target`.
 */
export function readUpgradeRequest(
  body: Record<string, unknown>,
): UpgradeRequest | undefined | null {
  const nested = body.target;
  if (nested !== undefined && (nested === null || typeof nested !== "object")) {
    return null;
  }
  const source = (nested as Record<string, unknown> | undefined) ?? body;
  const { plan, period } = source;
  if (plan !== undefined && !isPaidPlanId(plan)) return null;
  if (period !== undefined && !isPlanPeriod(period)) return null;
  if (plan === undefined && period === undefined) return undefined;
  return {
    ...(plan !== undefined ? { plan } : {}),
    ...(period !== undefined ? { period } : {}),
  };
}

/** A paid plan and how it is billed. */
interface PaidTarget {
  plan: PaidPlanId;
  period: PlanPeriod;
}

function targetOf(
  sold: PaidTarget,
  request: UpgradeRequest | undefined,
): PaidTarget {
  if (
    !request ||
    (request.plan === undefined && request.period === undefined)
  ) {
    return { plan: UPGRADE_TO, period: sold.period };
  }
  return {
    plan: request.plan ?? sold.plan,
    period: request.period ?? sold.period,
  };
}

/** The few words that differ between the two changes. */
const WORDS = {
  plan: {
    unavailable: "The upgrade couldn't be made. Try again in a moment.",
    inProgress: "Your upgrade is already being made. Give it a moment.",
    notConfigured: "Upgrading isn't available yet. Try again later.",
    notActive: "Update your card before upgrading.",
  },
  period: {
    unavailable:
      "The switch to yearly couldn't be made. Try again in a moment.",
    inProgress:
      "Your switch to yearly is already being made. Give it a moment.",
    notConfigured: "Paying yearly isn't available yet. Try again later.",
    notActive: "Update your card before switching to yearly.",
  },
} as const satisfies Record<UpgradeKind, Record<string, string>>;

const UNAVAILABLE = (detail: string, kind: UpgradeKind = "plan") =>
  refuse("checkout_unavailable", 502, WORDS[kind].unavailable, detail);
const IN_PROGRESS = (detail: string, kind: UpgradeKind = "plan") =>
  refuse("upgrade_in_progress", 409, WORDS[kind].inProgress, detail);

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
  /** What the subscription is on now. */
  from: PaidTarget;
  /** What it moves to. */
  target: PaidTarget;
  kind: UpgradeKind;
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

/**
 * What the customer paid for the subscription's CURRENT period, before tax
 * and after discounts — the basis of the credit. Null when it cannot be
 * established, and the caller then falls back to list price (logged here).
 *
 * The invoice is the subscription's `latest_invoice`, and is only believed
 * when it is paid, is this subscription's, and bills the current period (a
 * line whose period starts where the subscription's does). `quoteUpgrade()`
 * caps the figure at list price.
 */
async function periodPaidCents(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  userId: string,
): Promise<number | null> {
  const fallback = (reason: string, error?: unknown) => {
    console.error(
      "[billing] upgrade credit falls back to list price: the period's invoice could not be read",
      {
        userId,
        subscriptionId: subscription.id,
        reason,
        ...(error === undefined ? {} : { error: message(error) }),
      },
    );
    return null;
  };

  const invoiceId = expandableId(
    subscription.latest_invoice as string | { id: string } | null,
  );
  if (!invoiceId) return fallback("no_latest_invoice");

  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(invoiceId);
  } catch (error) {
    return fallback("invoice_read_failed", error);
  }

  if (invoice.status !== "paid") return fallback(`invoice_${invoice.status}`);
  const invoiceSubscription = expandableId(
    invoice.subscription as string | { id: string } | null,
  );
  if (invoiceSubscription && invoiceSubscription !== subscription.id) {
    return fallback("invoice_of_another_subscription");
  }
  const periodStart = subscription.current_period_start as number | undefined;
  const lines = invoice.lines?.data ?? [];
  if (
    typeof periodStart !== "number" ||
    !lines.some((line) => line.period?.start === periodStart)
  ) {
    return fallback("invoice_not_for_this_period");
  }

  // After discounts, before tax. `total_excluding_tax` is exactly that in the
  // API version this SDK pins; `total − tax` is the same figure without it.
  const paid =
    typeof invoice.total_excluding_tax === "number"
      ? invoice.total_excluding_tax
      : typeof invoice.total === "number"
        ? invoice.total - (invoice.tax ?? 0)
        : null;
  if (paid === null || !Number.isFinite(paid) || paid < 0) {
    return fallback("invoice_without_a_total");
  }
  return paid;
}

/** Step 0: everything a change is decided from. Writes nothing. */
async function prepareUpgrade(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  target?: UpgradeRequest;
  now: Date;
}): Promise<BillingResult<Prepared>> {
  const { stripe, admin, user, now } = params;
  if (!user) return { ok: false, error: SIGN_IN_REFUSAL };

  const NO_SUBSCRIPTION = (detail: string) =>
    refuse("no_subscription", 409, "You don't have a plan to change.", detail);

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

    // A failed renewal is fixed first, whatever was asked: the card on file
    // is the one that just failed, and the current period is not paid for,
    // so there is nothing to credit.
    if (subscription.status === "past_due") {
      return refuse(
        "past_due",
        409,
        "Your last payment failed. Update your card before changing your plan.",
        "status_past_due",
      );
    }

    const sold = planForPriceId(subscriptionPriceId(subscription));
    const asked =
      params.target?.plan !== undefined || params.target?.period !== undefined;
    const target = sold ? targetOf(sold, params.target) : null;
    const kind = sold && target ? upgradeKind(sold, target) : null;
    if (!sold || !target || !kind) {
      // With nothing asked this is the Upgrade button, which only a Player Pro
      // subscriber (or an unknown price) is refused at.
      let sentence = `You're already on ${personalPlan(UPGRADE_TO).name}.`;
      let detail = sold ? `from_${sold.plan}` : "unknown_price";
      if (sold && target && asked) {
        const same = target.plan === sold.plan && target.period === sold.period;
        sentence = !same
          ? "That change can't be made here."
          : params.target?.plan === undefined
            ? `You already pay ${target.period}.`
            : `You're already on ${personalPlan(target.plan).name}.`;
        detail = `from_${sold.plan}_${sold.period}_to_${target.plan}_${target.period}`;
      }
      return refuse("not_an_upgrade", 409, sentence, detail);
    }
    if (subscription.status !== "active") {
      return refuse(
        "not_an_upgrade",
        409,
        WORDS[kind].notActive,
        `status_${subscription.status}`,
      );
    }
    if (subscription.schedule) {
      // A change is already scheduled for renewal (set in the Dashboard);
      // rewriting the subscription under it would be undone at that renewal.
      return refuse(
        "not_an_upgrade",
        409,
        "A change to your plan is already scheduled. Contact us to change it.",
        "has_schedule",
      );
    }

    const targetPriceId = priceIdFor(target.plan, target.period);
    if (!targetPriceId) {
      return refuse(
        "price_not_configured",
        503,
        WORDS[kind].notConfigured,
        PLAN_PRICE_ENV[target.plan][target.period],
      );
    }

    const period = subscriptionPeriod(subscription);
    if (!period.start || !period.end) return UNAVAILABLE("no_period", kind);

    const usedSeconds = await readSliceUsedSeconds(
      admin,
      user.id,
      period.start,
      now,
    );
    // The same read feeds the preview and the charge, so they agree.
    const paidForPeriodCents = await periodPaidCents(
      stripe,
      subscription,
      user.id,
    );
    return {
      ok: true,
      value: {
        userId: user.id,
        customerId,
        subscription,
        from: sold,
        target,
        kind,
        targetPriceId,
        quote: quoteUpgrade({
          from: sold.plan,
          to: target.plan,
          period: sold.period,
          toPeriod: target.period,
          periodStart: new Date(period.start),
          periodEnd: new Date(period.end),
          now,
          usedSeconds,
          paidForPeriodCents,
        }),
      },
    };
  } catch (error) {
    console.error("[billing] could not prepare the upgrade", {
      userId: user.id,
      error: message(error),
    });
    return UNAVAILABLE(
      "prepare_failed",
      params.target?.period === "yearly" && params.target.plan === undefined
        ? "period"
        : "plan",
    );
  }
}

/** What the dialog shows, and what `executeUpgrade()` then charges. */
export type UpgradePreview = UpgradeQuote & {
  /** Which of the two changes this prices. */
  kind: UpgradeKind;
  from: PaidPlanId;
  to: PaidPlanId;
  /** How the subscription is billed AFTER the change. */
  period: PlanPeriod;
  /** How it is billed now: the same, except for a switch to yearly. */
  fromPeriod: PlanPeriod;
};

export async function previewUpgrade(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  /** Left out: Player Pro on the same period. */
  target?: UpgradeRequest;
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
      kind: prepared.value.kind,
      from: prepared.value.from.plan,
      to: prepared.value.target.plan,
      period: prepared.value.target.period,
      fromPeriod: prepared.value.from.period,
    },
  };
}

/**
 * The deterministic id of one attempt — see "Twice at once". A switch to
 * yearly is marked, so the two changes a monthly Player can ask for in one
 * minute never share an idempotency key.
 */
export function upgradeAttemptId(
  subscription: Pick<Stripe.Subscription, "id" | "current_period_start">,
  now: Date,
  kind: UpgradeKind = "plan",
): string {
  const base = `upg_${subscription.id}_${subscription.current_period_start}_${Math.floor(now.getTime() / 60_000)}`;
  return kind === "period" ? `${base}_yearly` : base;
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
  /** Left out: Player Pro on the same period. `{ period: "yearly" }`: pay yearly. */
  target?: UpgradeRequest;
  now?: Date;
}): Promise<BillingResult<UpgradeDone>> {
  const { stripe, admin } = params;
  const now = params.now ?? new Date();

  const prepared = await prepareUpgrade({ ...params, now });
  if (!prepared.ok) return prepared;
  const {
    userId,
    customerId,
    subscription,
    from,
    target,
    kind,
    targetPriceId,
    quote,
  } = prepared.value;

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
  const attempt = upgradeAttemptId(subscription, now, kind);
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
    if (swept === "busy") return IN_PROGRESS("unsettled_credit", kind);
    if (swept === "spent") {
      return refuse(
        "upgrade_in_progress",
        409,
        "That didn't go through. Try again in a minute.",
        "attempt_spent",
      );
    }
    if (swept === "failed") return UNAVAILABLE("sweep_failed", kind);
  } catch (error) {
    console.error("[billing] could not sweep upgrade credits", {
      ...log,
      error: message(error),
    });
    return UNAVAILABLE("sweep_failed", kind);
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
          description:
            kind === "period"
              ? `Unused ${personalPlan(from.plan).name} month, credited on the switch to yearly`
              : `Unused ${personalPlan(from.plan).name} time, credited on upgrade`,
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
        ? IN_PROGRESS("credit_in_flight", kind)
        : UNAVAILABLE("credit_failed", kind);
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
        // Checkout named the subscription after the plan it started on;
        // Stripe's portal prints that beside the new price unless it follows.
        description: planProductName(target.plan, target.period),
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
    if (isIdempotencyConflict(failure)) {
      return IN_PROGRESS("update_in_flight", kind);
    }

    let after: Stripe.Subscription | null = null;
    try {
      after = await stripe.subscriptions.retrieve(subscription.id);
    } catch (error) {
      console.error("[billing] upgrade outcome unknown; left to the sweep", {
        ...log,
        error: message(error),
      });
      return UNAVAILABLE("outcome_unknown", kind);
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
        : UNAVAILABLE("update_failed", kind);
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
      plan: target.plan,
      period: target.period,
      payTodayCents: quote.payTodayCents,
      creditCents: quote.creditCents,
      nextBillingDay: quote.nextBillingDay,
    },
  };
}

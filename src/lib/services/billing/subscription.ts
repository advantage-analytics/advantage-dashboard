/**
 * A Stripe subscription written onto its `users` row — server only, service
 * role (the seven billing columns are writable by nobody else:
 * `20261126060000_plans_2027_plan_model.sql`).
 *
 * ONE writer for every caller — the webhook's six events, `/api/billing/
 * confirm` and the upgrade route — and one rule that makes them agree:
 *
 *   The subscription OBJECT is the truth, fetched fresh. An event says only
 *   "look at this subscription again"; what is written is derived from what
 *   Stripe holds now, never from the event's own snapshot.
 *
 * So a duplicate event writes the same row twice, and events out of order
 * each write the newest state: nothing here is a delta. (The one time the
 * snapshot is used is a subscription Stripe no longer returns — see
 * `fallback`.)
 *
 * What a status means (decision: a failed payment keeps the plan while
 * Stripe retries, then drops to Free):
 *
 *   active, trialing            the price's plan, `plan_status = 'active'`
 *   past_due                    the price's plan KEPT, `'past_due'`
 *   canceled, unpaid, paused,   `plan = 'free'`, the period cleared,
 *   incomplete_expired          `'canceled'` — but only when this is the
 *                               subscription the user is on (a stale
 *                               `deleted` for an old one changes nothing)
 *   incomplete                  nothing yet: the first payment is pending
 *
 * A price that maps to no plan (`planForPriceId()`) changes nothing and logs.
 *
 * ── One subscription per user ──────────────────────────────────────────────
 * Checkout refuses a second plan (`already_subscribed`), but only when the
 * session is CREATED: two checkouts opened side by side can both be paid.
 * So the rule is enforced again here, where the row is written:
 *
 *   A live subscription for a user whose row already holds a DIFFERENT
 *   subscription that is itself still live in Stripe (re-fetched, not taken
 *   from the row) never overwrites the row. It is the duplicate: it is
 *   cancelled at once and its payment refunded — `settleDuplicate()`.
 *
 * A row pointing at a subscription that has ended (or that Stripe no longer
 * has) is replaced, as before. And the write itself is a compare-and-set on
 * the subscription id that was read, so two first events for two different
 * subscriptions cannot both land: the loser re-reads and finds the winner.
 *
 * The user is the row holding the subscription's customer
 * (`stripe_customer_id`), else the user id our own checkout put on the
 * session / subscription metadata — never an email.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoachPlanId, PlanPeriod } from "@/lib/billing/plans";
import { expandableId } from "@/lib/services/credits/checkout";
import { planForPriceId } from "@/lib/stripe/prices";
import { errorMessage } from "./http";

export type PlanStatus = "active" | "past_due" | "canceled";

/** The billing half of a `users` row. */
export interface BillingUser {
  id: string;
  plan: string | null;
  plan_period: string | null;
  plan_status: string | null;
  plan_period_start: string | null;
  plan_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export const BILLING_USER_COLUMNS =
  "id, plan, plan_period, plan_status, plan_period_start, plan_period_end, stripe_customer_id, stripe_subscription_id";

/** Read one user's billing columns by id or by Stripe customer. Throws on a failed read. */
export async function readBillingUser(
  admin: SupabaseClient,
  by: "id" | "stripe_customer_id",
  value: string,
): Promise<BillingUser | null> {
  const { data, error } = await admin
    .from("users")
    .select(BILLING_USER_COLUMNS)
    .eq(by, value)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read the billing user: ${error.message}`, {
      cause: error,
    });
  }
  return (data as BillingUser | null) ?? null;
}

/** Statuses that hold a plan. `incomplete` holds nothing yet. */
const LIVE: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
  "past_due",
]);

/** Statuses that take up the customer's one subscription slot. */
const OCCUPYING: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

/** Whether a subscription still stands in the way of buying another. */
export function subscriptionOccupies(
  subscription: Pick<Stripe.Subscription, "status">,
): boolean {
  return OCCUPYING.has(subscription.status);
}

/** The subscription's one price. Our subscriptions have exactly one item. */
export function subscriptionPriceId(
  subscription: Pick<Stripe.Subscription, "items">,
): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

/**
 * The current period as ISO instants. On the subscription itself in the API
 * version this SDK pins; on its item from `2025-03-31` on, read as a
 * fallback so a version bump does not blank the hours window.
 */
export function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: string | null;
  end: string | null;
} {
  const item = subscription.items?.data?.[0] as
    { current_period_start?: number; current_period_end?: number } | undefined;
  const start =
    (subscription.current_period_start as number | undefined) ??
    item?.current_period_start;
  const end =
    (subscription.current_period_end as number | undefined) ??
    item?.current_period_end;
  const iso = (seconds: number | undefined) =>
    typeof seconds === "number" && Number.isFinite(seconds)
      ? new Date(seconds * 1000).toISOString()
      : null;
  return { start: iso(start), end: iso(end) };
}

export type SyncOutcome =
  | {
      outcome: "synced";
      userId: string;
      plan: CoachPlanId;
      period: PlanPeriod | null;
      status: PlanStatus;
    }
  /** No `users` row for this customer or this metadata user id. */
  | { outcome: "no_user" }
  /** The price is not one of ours: nothing written. */
  | { outcome: "unknown_price"; userId: string; priceId: string | null }
  /** An ended subscription that is not the one the user is on. */
  | { outcome: "superseded"; userId: string }
  /**
   * A second live subscription for a user already on a live one. Nothing was
   * written. `cancelled` and `refunded` say whether it is fully undone; when
   * either is false the caller should have the event retried.
   */
  | {
      outcome: "duplicate";
      userId: string;
      keptSubscriptionId: string;
      duplicateSubscriptionId: string;
      cancelled: boolean;
      refunded: boolean;
    }
  /** `incomplete`: the first payment has not gone through. */
  | { outcome: "pending"; userId: string };

function isMissingResource(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

/**
 * Subscription metadata key set on a duplicate, with the id of the subscription
 * that was kept, BEFORE it is cancelled. Metadata is only ever written with our
 * secret key, so it is the one thing a customer cannot forge: it is how a later
 * event for the cancelled duplicate knows to make sure the refund was made.
 */
export const DUPLICATE_METADATA_KEY = "duplicate_of";

/**
 * The cancellation comment, for people reading the Dashboard. NEVER evidence:
 * Stripe's Customer Portal stores the customer's own free text in that same
 * field, so a subscriber could write this prefix themselves.
 */
export const DUPLICATE_MARK = "duplicate_of:";

/** The kept subscription id we marked this one a duplicate of, if we did. */
function markedDuplicateOf(subscription: Stripe.Subscription): string | null {
  return subscription.metadata?.[DUPLICATE_METADATA_KEY] || null;
}

/** Whether the subscription the row holds is still live in Stripe, asked now. */
async function isLiveInStripe(stripe: Stripe, id: string): Promise<boolean> {
  try {
    return LIVE.has((await stripe.subscriptions.retrieve(id)).status);
  } catch (error) {
    // Gone from Stripe is not live. Anything else is "cannot be sure": throw,
    // so nothing is overwritten and the event is retried.
    if (isMissingResource(error)) return false;
    throw error;
  }
}

/**
 * Refund the payment of a duplicate's latest invoice, in full (tax included).
 * Idempotent three ways: a charge Stripe already shows as refunded is left
 * alone, the refund carries an idempotency key on the invoice, and Stripe's
 * own `charge_already_refunded` reads as done. Throws on any other failure.
 */
async function refundLatestInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  keptSubscriptionId: string | null,
): Promise<"refunded" | "already_refunded" | "nothing_paid"> {
  const invoiceId = expandableId(
    subscription.latest_invoice as string | { id: string } | null,
  );
  if (!invoiceId) return "nothing_paid";

  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ["charge"],
  });
  if (invoice.status !== "paid" || (invoice.amount_paid ?? 0) <= 0) {
    return "nothing_paid";
  }
  const charge = invoice.charge;
  if (charge && typeof charge === "object" && charge.refunded) {
    return "already_refunded";
  }
  const chargeId = expandableId(charge as string | { id: string } | null);
  const paymentIntent = expandableId(
    invoice.payment_intent as string | { id: string } | null,
  );
  if (!chargeId && !paymentIntent) {
    throw new Error(`Paid invoice ${invoice.id} names no charge to refund`);
  }

  try {
    await stripe.refunds.create(
      {
        ...(chargeId
          ? { charge: chargeId }
          : { payment_intent: paymentIntent! }),
        reason: "duplicate",
        metadata: {
          kind: "duplicate_subscription",
          subscription: subscription.id,
          ...(keptSubscriptionId ? { kept: keptSubscriptionId } : {}),
        },
      },
      { idempotencyKey: `duplicate-subscription-refund:${invoice.id}` },
    );
  } catch (error) {
    if (
      (error as { code?: string } | null)?.code === "charge_already_refunded"
    ) {
      return "already_refunded";
    }
    throw error;
  }
  return "refunded";
}

/**
 * Undo a duplicate: cancel it now, then refund what it charged. The row is
 * not touched by this, whatever happens.
 *
 *   mark     `subscriptions.update` sets metadata `duplicate_of: <kept>`
 *            (idempotency key of its own). Fails → logged loudly; nothing is
 *            cancelled or refunded and the caller asks for a retry.
 *   cancel   `subscriptions.cancel` with no final invoice and no proration,
 *            comment `duplicate_of:<kept>` (for humans only), idempotency key
 *            on the duplicate's id. Stripe saying it no longer exists reads as cancelled.
 *            Fails → logged loudly; the refund is NOT attempted (the
 *            subscription is still live and still paid, which is the state a
 *            retry starts from) and the caller asks for a retry.
 *   refund   `refundLatestInvoice()`. Fails → logged loudly, caller asks for
 *            a retry. The duplicate is canceled by then, so the retry — and
 *            the `customer.subscription.deleted` the cancel itself sends —
 *            arrives at the ended branch of `syncSubscription()`, which sees
 *            the mark and comes back here for the refund alone.
 */
async function settleDuplicate(params: {
  stripe: Stripe;
  userId: string;
  kept: string;
  duplicate: Stripe.Subscription;
  /** The duplicate is already canceled and marked: only the refund is owed. */
  alreadyCancelled?: boolean;
}): Promise<Extract<SyncOutcome, { outcome: "duplicate" }>> {
  const { stripe, userId, kept, duplicate } = params;
  const ids = {
    userId,
    keptSubscriptionId: kept,
    duplicateSubscriptionId: duplicate.id,
  };
  const outcome = (cancelled: boolean, refunded: boolean) => ({
    outcome: "duplicate" as const,
    ...ids,
    cancelled,
    refunded,
  });

  if (!params.alreadyCancelled) {
    // The marker goes on first, so a duplicate is never cancelled without it
    // (a cancelled one that lacks it would never be refunded by a later event).
    try {
      await stripe.subscriptions.update(
        duplicate.id,
        { metadata: { [DUPLICATE_METADATA_KEY]: kept } },
        {
          idempotencyKey: `duplicate-subscription-mark:${duplicate.id}:${kept}`,
        },
      );
    } catch (error) {
      // Loud on purpose, and nothing else is attempted: a retry starts over.
      console.error("[billing] DUPLICATE SUBSCRIPTION NOT MARKED", {
        ...ids,
        error: errorMessage(error),
      });
      return outcome(false, false);
    }
    try {
      await stripe.subscriptions.cancel(
        duplicate.id,
        {
          invoice_now: false,
          prorate: false,
          cancellation_details: { comment: `${DUPLICATE_MARK}${kept}` },
        },
        { idempotencyKey: `duplicate-subscription-cancel:${duplicate.id}` },
      );
    } catch (error) {
      if (!isMissingResource(error)) {
        // Loud on purpose: this user is paying for two subscriptions until a
        // retry, or a person, cancels the second.
        console.error("[billing] DUPLICATE SUBSCRIPTION NOT CANCELLED", {
          ...ids,
          error: errorMessage(error),
        });
        return outcome(false, false);
      }
    }
  }

  let refund: Awaited<ReturnType<typeof refundLatestInvoice>>;
  try {
    refund = await refundLatestInvoice(stripe, duplicate, kept);
  } catch (error) {
    // Loud on purpose: the duplicate is cancelled but its money is still ours.
    console.error("[billing] DUPLICATE SUBSCRIPTION NOT REFUNDED", {
      ...ids,
      error: errorMessage(error),
    });
    return outcome(true, false);
  }

  // One line per duplicate undone. A later event for the same duplicate finds
  // the charge already refunded and says nothing.
  if (!params.alreadyCancelled || refund === "refunded") {
    console.error(
      "[billing] duplicate subscription cancelled and refunded; the row was not changed",
      { ...ids, refund },
    );
  }
  return outcome(true, true);
}

async function findUser(
  admin: SupabaseClient,
  customerId: string | null,
  userIdHint: string | null,
): Promise<BillingUser | null> {
  if (customerId) {
    const byCustomer = await readBillingUser(
      admin,
      "stripe_customer_id",
      customerId,
    );
    if (byCustomer) return byCustomer;
  }
  if (!userIdHint) return null;
  const byId = await readBillingUser(admin, "id", userIdHint);
  // The hint is our own metadata, but a row already tied to ANOTHER customer
  // is not this subscription's: refuse rather than repoint it.
  if (
    byId &&
    byId.stripe_customer_id &&
    customerId &&
    byId.stripe_customer_id !== customerId
  ) {
    return null;
  }
  return byId;
}

/**
 * Fetch `subscriptionId` from Stripe and write what it says.
 *
 * `fallback` is the event's own copy, used only when Stripe answers "no such
 * subscription" (a deleted one it has stopped returning). `userIdHint` is the
 * user id from the checkout session or the caller's own sign-in, used only
 * when no row holds the customer yet.
 *
 * Throws on a failed Stripe or database call — the webhook answers 500 and
 * Stripe retries; the write is idempotent.
 */
export async function syncSubscription(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  subscriptionId: string;
  fallback?: Stripe.Subscription | null;
  userIdHint?: string | null;
}): Promise<SyncOutcome> {
  const { admin, stripe, subscriptionId } = params;

  let subscription: Stripe.Subscription;
  /** Whether `subscription` is what Stripe holds now, not an event's copy. */
  let fresh = true;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (!params.fallback || !isMissingResource(error)) throw error;
    subscription = params.fallback;
    fresh = false;
  }

  const customerId = expandableId(
    subscription.customer as string | { id: string } | null,
  );
  const hint = params.userIdHint ?? subscription.metadata?.user_id ?? null;
  const user = await findUser(admin, customerId, hint || null);
  if (!user) {
    console.error("[billing] subscription with no user", {
      subscriptionId: subscription.id,
      customerId,
    });
    return { outcome: "no_user" };
  }

  /**
   * Write the row only if it still holds the subscription id that was read
   * (`held`). False when it has moved on underneath us: nothing was written.
   */
  const write = async (
    values: Record<string, unknown>,
    held: string | null,
  ): Promise<boolean> => {
    const mine = admin.from("users").update(values).eq("id", user.id);
    const { data, error } = await (
      held === null
        ? mine.is("stripe_subscription_id", null)
        : mine.eq("stripe_subscription_id", held)
    ).select("id");
    if (error) {
      throw new Error(`Could not write the plan: ${error.message}`, {
        cause: error,
      });
    }
    return (data?.length ?? 0) > 0;
  };

  /**
   * The marker names a different subscription of this same customer. Anything
   * else is not ours to act on: no refund. Throws on an unreadable Stripe so
   * the event is retried.
   */
  const keptIsOtherSubscriptionOfCustomer = async (): Promise<boolean> => {
    const keptId = markedDuplicateOf(subscription);
    if (!keptId || keptId === subscription.id) return false;
    try {
      const kept = await stripe.subscriptions.retrieve(keptId);
      if (
        customerId &&
        expandableId(kept.customer as string | { id: string } | null) ===
          customerId
      ) {
        return true;
      }
    } catch (error) {
      if (!isMissingResource(error)) throw error;
    }
    console.error(
      "[billing] duplicate marker names no subscription of the customer",
      {
        subscriptionId: subscription.id,
        customerId,
        keptSubscriptionId: keptId,
      },
    );
    return false;
  };

  if (subscription.status === "incomplete") {
    return { outcome: "pending", userId: user.id };
  }

  if (!LIVE.has(subscription.status)) {
    // Ended. Only the subscription the user is ON can end their plan: a
    // late `deleted` for one they replaced must not undo the new one, and
    // one the row never held (a first payment that never completed) has
    // nothing to end — and must not mark a Free user as a past customer.
    if (user.stripe_subscription_id !== subscription.id) {
      // A duplicate we cancelled: make sure its refund was made (a no-op once
      // it has been). The row is not this subscription's either way.
      const markedKept =
        subscription.status === "canceled"
          ? markedDuplicateOf(subscription)
          : null;
      if (markedKept && (await keptIsOtherSubscriptionOfCustomer())) {
        const settled = await settleDuplicate({
          stripe,
          userId: user.id,
          kept: markedKept,
          duplicate: subscription,
          alreadyCancelled: true,
        });
        if (!settled.refunded) return settled;
      }
      return { outcome: "superseded", userId: user.id };
    }
    // `canceled` and `incomplete_expired` are final, so the slot is freed.
    // `unpaid` / `paused` can still come back, so the id stays to be found.
    const final =
      subscription.status === "canceled" ||
      subscription.status === "incomplete_expired";
    const ended = await write(
      {
        plan: "free",
        plan_period: null,
        plan_status: "canceled",
        plan_period_start: null,
        plan_period_end: null,
        stripe_subscription_id: final ? null : subscription.id,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      },
      subscription.id,
    );
    // Replaced between the read and the write: it is no longer theirs to end.
    if (!ended) return { outcome: "superseded", userId: user.id };
    return {
      outcome: "synced",
      userId: user.id,
      plan: "free",
      period: null,
      status: "canceled",
    };
  }

  const priceId = subscriptionPriceId(subscription);
  const sold = planForPriceId(priceId);
  if (!sold) {
    console.error("[billing] subscription on a price that is no plan", {
      subscriptionId: subscription.id,
      userId: user.id,
      priceId,
    });
    return { outcome: "unknown_price", userId: user.id, priceId };
  }

  const status: PlanStatus =
    subscription.status === "past_due" ? "past_due" : "active";
  const period = subscriptionPeriod(subscription);
  const values = {
    plan: sold.plan,
    plan_period: sold.period,
    plan_status: status,
    plan_period_start: period.start,
    plan_period_end: period.end,
    stripe_subscription_id: subscription.id,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  };

  // Compare-and-set on the id the row held when it was read. Losing means
  // another event wrote first: read again and decide again (the row now
  // holds this subscription — write it — or another, which is then judged
  // like any other held subscription).
  let held = user.stripe_subscription_id;
  for (let pass = 0; pass < 3; pass += 1) {
    if (held && held !== subscription.id) {
      if (await isLiveInStripe(stripe, held)) {
        // An event's stale copy of a subscription Stripe no longer has is
        // not grounds to cancel or refund anything: just do not overwrite.
        if (!fresh) return { outcome: "superseded", userId: user.id };
        return settleDuplicate({
          stripe,
          userId: user.id,
          kept: held,
          duplicate: subscription,
        });
      }
    }
    if (await write(values, held)) {
      return {
        outcome: "synced",
        userId: user.id,
        plan: sold.plan,
        period: sold.period,
        status,
      };
    }
    const again = await readBillingUser(admin, "id", user.id);
    if (!again) return { outcome: "no_user" };
    held = again.stripe_subscription_id;
  }
  throw new Error("Could not write the plan: the row kept changing");
}

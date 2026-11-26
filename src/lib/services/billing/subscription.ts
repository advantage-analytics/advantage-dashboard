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
 * The user is the row holding the subscription's customer
 * (`stripe_customer_id`), else the user id our own checkout put on the
 * session / subscription metadata — never an email.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoachPlanId, PlanPeriod } from "@/lib/billing/plans";
import { expandableId } from "@/lib/services/credits/checkout";
import { planForPriceId } from "@/lib/stripe/prices";

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
  /** `incomplete`: the first payment has not gone through. */
  | { outcome: "pending"; userId: string };

function isMissingResource(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
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
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (!params.fallback || !isMissingResource(error)) throw error;
    subscription = params.fallback;
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

  const write = async (values: Record<string, unknown>) => {
    const { error } = await admin
      .from("users")
      .update(values)
      .eq("id", user.id);
    if (error) {
      throw new Error(`Could not write the plan: ${error.message}`, {
        cause: error,
      });
    }
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
      return { outcome: "superseded", userId: user.id };
    }
    // `canceled` and `incomplete_expired` are final, so the slot is freed.
    // `unpaid` / `paused` can still come back, so the id stays to be found.
    const final =
      subscription.status === "canceled" ||
      subscription.status === "incomplete_expired";
    await write({
      plan: "free",
      plan_period: null,
      plan_status: "canceled",
      plan_period_start: null,
      plan_period_end: null,
      stripe_subscription_id: final ? null : subscription.id,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    });
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
  await write({
    plan: sold.plan,
    plan_period: sold.period,
    plan_status: status,
    plan_period_start: period.start,
    plan_period_end: period.end,
    stripe_subscription_id: subscription.id,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  });
  return {
    outcome: "synced",
    userId: user.id,
    plan: sold.plan,
    period: sold.period,
    status,
  };
}

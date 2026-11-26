/**
 * Plan and extra-hours checkout — server only.
 *
 * Like the credit packs it replaces (`services/credits/checkout.ts`), this is
 * Stripe EMBEDDED Checkout with `redirect_on_completion: "never"`: the upload
 * wizard's picked video is an in-memory `File`, and a redirect would lose it.
 * Stripe Tax is on, cards only, and the statement descriptor is the account's
 * own setting — all exactly as the pack checkout sets them.
 *
 * Two kinds, one endpoint (`POST /api/billing/checkout`):
 *
 *   { kind: "plan", plan, period }   `mode: "subscription"` on that plan's
 *                                    Price. The first-month discount is added
 *                                    HERE and only here — see `firstMonth`.
 *   { kind: "hours", hours }         `mode: "payment"`, 1–50 whole hours of
 *                                    the $35 Price. Anyone can buy, plan or not.
 *
 * Nothing in the body names an account, a price, an amount or a discount:
 * the buyer is the signed-in user and every figure is the plan module's.
 *
 * Fulfilment has two callers that must agree — the webhook and
 * `/api/billing/confirm` — and do by sharing `fulfilHoursCheckout()` (one
 * `video_credits` row per Checkout Session, by its unique columns) and
 * `syncSubscription()` (a pure function of what Stripe holds). Whichever
 * arrives second changes nothing.
 *
 * `already_subscribed` below is checked when a session is created, which two
 * checkouts open at once both pass. The second one PAID is caught where the
 * row is written: `syncSubscription()` cancels and refunds it.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EXTRA_HOUR_VALIDITY_MONTHS,
  coachPlan,
  plansOnSale,
  type PlanPeriod,
} from "@/lib/billing/plans";
import { addMonthsUtc } from "@/lib/services/splitstep/allowance";
import { expandableId } from "@/lib/services/credits/checkout";
import { PROVIDER_DISPLAY_NAME } from "@/lib/services/splitstep/config";
import { isMissingColumn } from "@/lib/supabase/missing-function";
import {
  EXTRA_HOUR_PRICE_ENV,
  FIRST_MONTH_COUPON_ENV,
  PLAN_PRICE_ENV,
  extraHourPriceId,
  firstMonthCouponId,
  isPaidPlanId,
  isPlanPeriod,
  priceIdFor,
  type PaidPlanId,
} from "@/lib/stripe/prices";
import {
  SIGN_IN_REFUSAL,
  errorMessage,
  refuse,
  type BillingRefusal,
  type BillingResult,
} from "./http";
import {
  readBillingUser,
  subscriptionOccupies,
  syncSubscription,
  type BillingUser,
  type SyncOutcome,
} from "./subscription";

/** `metadata.kind` on our sessions — the webhook and confirm branch on it. */
export const PLAN_CHECKOUT_KIND = "plan";
export const HOURS_CHECKOUT_KIND = "hours";

/** Whole hours one purchase may hold. */
export const MIN_EXTRA_HOURS = 1;
export const MAX_EXTRA_HOURS = 50;

/** Same levers as the pack checkout — see `CHECKOUT_BRANDING` there. */
const CHECKOUT_BRANDING = {
  display_name: "Advantage",
  font_family: "inter",
  border_style: "rounded",
  button_color: "#3B82F6",
  background_color: "#FFFFFF",
} as const;

type EmbeddedParams = Stripe.Checkout.SessionCreateParams & {
  branding_settings: typeof CHECKOUT_BRANDING;
  wallet_options: { link: { display: "never" } };
};

/** What both kinds share: embedded, no redirect, cards only, Stripe Tax. */
function embeddedBase(customerId: string, userId: string) {
  return {
    ui_mode: "embedded",
    redirect_on_completion: "never",
    payment_method_types: ["card"],
    wallet_options: { link: { display: "never" } },
    branding_settings: CHECKOUT_BRANDING,
    automatic_tax: { enabled: true },
    customer: customerId,
    // Stripe Tax needs an address on the Customer; Checkout collects it and
    // this lets it save what it collected.
    customer_update: { address: "auto", name: "auto" },
    client_reference_id: userId,
  } as const satisfies Partial<EmbeddedParams>;
}

export type CheckoutUser = { id: string; email: string | null };

export type CheckoutRequest =
  | { kind: "plan"; plan: PaidPlanId; period: PlanPeriod }
  | { kind: "hours"; hours: number };

/** The body as a request, or null when it is not one. Never throws. */
export function parseCheckoutBody(body: unknown): CheckoutRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind === PLAN_CHECKOUT_KIND) {
    return isPaidPlanId(b.plan) && isPlanPeriod(b.period)
      ? { kind: "plan", plan: b.plan, period: b.period }
      : null;
  }
  if (b.kind === HOURS_CHECKOUT_KIND) {
    return typeof b.hours === "number" &&
      Number.isInteger(b.hours) &&
      b.hours >= MIN_EXTRA_HOURS &&
      b.hours <= MAX_EXTRA_HOURS
      ? { kind: "hours", hours: b.hours }
      : null;
  }
  return null;
}

const UNAVAILABLE = (detail: string) =>
  refuse(
    "checkout_unavailable",
    502,
    "Checkout couldn't open. Try again in a moment.",
    detail,
  );

/**
 * The user's Stripe customer, created and stored if there is none.
 *
 * Created with an idempotency key on the user id, and stored only where the
 * column is still null, then read back: two tabs opening checkout at once end
 * on ONE customer, whichever wrote first.
 */
export async function ensureCustomer(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  user: CheckoutUser;
  row: BillingUser;
}): Promise<{ customerId: string; created: boolean }> {
  const { admin, stripe, user, row } = params;
  if (row.stripe_customer_id) {
    return { customerId: row.stripe_customer_id, created: false };
  }

  const customer = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      metadata: { user_id: user.id },
    },
    { idempotencyKey: `customer:${user.id}` },
  );

  const { error } = await admin
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", user.id)
    .is("stripe_customer_id", null);
  if (error) {
    throw new Error(`Could not store the customer: ${error.message}`, {
      cause: error,
    });
  }
  const after = await readBillingUser(admin, "id", user.id);
  const customerId = after?.stripe_customer_id ?? customer.id;
  return { customerId, created: customerId === customer.id };
}

/**
 * Whether this customer gets the first-month discount, and whether they are
 * already subscribed — both from Stripe AND our own row, never from the
 * request.
 *
 * First-time means: our row has never held a subscription, Stripe has no
 * subscription for the customer in ANY status (canceled included), and no
 * paid invoice above zero.
 */
async function customerHistory(params: {
  stripe: Stripe;
  customerId: string;
  /** Just created by this request: Stripe has no history to read. */
  created: boolean;
  row: BillingUser;
}): Promise<{ subscribed: boolean; firstTime: boolean }> {
  const { stripe, customerId, created, row } = params;
  const everOurs =
    row.stripe_subscription_id !== null ||
    row.plan_status !== null ||
    isPaidPlanId(row.plan);
  const subscribedOurs =
    isPaidPlanId(row.plan) && row.plan_status !== "canceled";
  if (created) return { subscribed: subscribedOurs, firstTime: !everOurs };

  const [subscriptions, invoices] = await Promise.all([
    stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    }),
    stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 }),
  ]);
  const paidBefore = invoices.data.some(
    (invoice) => (invoice.amount_paid ?? 0) > 0,
  );
  return {
    subscribed: subscribedOurs || subscriptions.data.some(subscriptionOccupies),
    firstTime: !everOurs && subscriptions.data.length === 0 && !paidBefore,
  };
}

export function planProductName(plan: PaidPlanId, period: PlanPeriod): string {
  return `Advantage ${coachPlan(plan).name}, ${period}`;
}

export function hoursProductName(hours: number): string {
  return `${PROVIDER_DISPLAY_NAME} — ${hours} video ${hours === 1 ? "hour" : "hours"}`;
}

export interface CheckoutStarted {
  clientSecret: string;
  sessionId: string;
  /** Whether the first-month discount is on this session. Plans only. */
  firstMonthDiscount: boolean;
}

/**
 * Open a checkout for `user`. Every refusal is a `BillingRefusal` with its
 * own `code`; a Stripe or database failure is `checkout_unavailable`.
 */
export async function startCheckout(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  body: unknown;
  now?: Date;
}): Promise<BillingResult<CheckoutStarted>> {
  const { stripe, admin, user, now = new Date() } = params;
  if (!user) return { ok: false, error: SIGN_IN_REFUSAL };

  const request = parseCheckoutBody(params.body);
  if (!request) {
    const hours =
      (params.body as { kind?: unknown } | null)?.kind === HOURS_CHECKOUT_KIND;
    return refuse(
      "invalid_request",
      400,
      hours
        ? `Pick ${MIN_EXTRA_HOURS} to ${MAX_EXTRA_HOURS} hours.`
        : "Pick a plan to continue.",
      hours ? "bad_hours" : "bad_body",
    );
  }

  if (!plansOnSale(now)) {
    return refuse(
      "plans_not_on_sale",
      409,
      "Plans open on January 1.",
      "before_plans_on_sale",
    );
  }

  const priceId =
    request.kind === "plan"
      ? priceIdFor(request.plan, request.period)
      : extraHourPriceId();
  if (!priceId) {
    return refuse(
      "price_not_configured",
      503,
      "Checkout isn't available yet. Try again later.",
      request.kind === "plan"
        ? PLAN_PRICE_ENV[request.plan][request.period]
        : EXTRA_HOUR_PRICE_ENV,
    );
  }

  let row: BillingUser | null;
  try {
    row = await readBillingUser(admin, "id", user.id);
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    console.error("[billing] could not read the buyer", {
      userId: user.id,
      error: errorMessage(error),
    });
    // The plan-model migration is not on this database yet.
    return UNAVAILABLE(
      cause && isMissingColumn(cause) ? "plan_model_missing" : "user_read",
    );
  }
  if (!row) return UNAVAILABLE("no_user_row");

  try {
    const { customerId, created } = await ensureCustomer({
      admin,
      stripe,
      user,
      row,
    });
    const base = embeddedBase(customerId, user.id);

    if (request.kind === "hours") {
      const metadata = {
        kind: HOURS_CHECKOUT_KIND,
        hours: String(request.hours),
        user_id: user.id,
      };
      const sessionParams: EmbeddedParams = {
        ...base,
        mode: "payment",
        line_items: [{ price: priceId, quantity: request.hours }],
        metadata,
        payment_intent_data: {
          metadata,
          description: hoursProductName(request.hours),
          ...(user.email ? { receipt_email: user.email } : {}),
        },
        custom_text: {
          submit: { message: "All sales final, except where required by law." },
        },
      };
      return started(
        await stripe.checkout.sessions.create(sessionParams),
        false,
      );
    }

    const history = await customerHistory({ stripe, customerId, created, row });
    if (history.subscribed) {
      return refuse(
        "already_subscribed",
        409,
        "You already have a plan. Change it from Settings.",
        "has_subscription",
      );
    }

    // Decision 6: 50% off the first month, monthly only, first-time
    // customers only. Yearly already has a month free.
    const firstMonth = request.period === "monthly" && history.firstTime;
    const coupon = firstMonth ? firstMonthCouponId() : null;
    if (firstMonth && !coupon) {
      // The paywall promised the discount; never charge full price instead.
      return refuse(
        "price_not_configured",
        503,
        "Checkout isn't available yet. Try again later.",
        FIRST_MONTH_COUPON_ENV,
      );
    }

    const metadata = {
      kind: PLAN_CHECKOUT_KIND,
      plan: request.plan,
      period: request.period,
      user_id: user.id,
    };
    const sessionParams: EmbeddedParams = {
      ...base,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      subscription_data: {
        metadata: { user_id: user.id },
        description: planProductName(request.plan, request.period),
      },
      ...(coupon ? { discounts: [{ coupon }] } : {}),
    };
    return started(
      await stripe.checkout.sessions.create(sessionParams),
      coupon !== null,
    );
  } catch (error) {
    console.error("[billing] could not create checkout session", {
      userId: user.id,
      kind: request.kind,
      error: errorMessage(error),
    });
    return UNAVAILABLE("stripe_error");
  }
}

function started(
  session: Stripe.Checkout.Session,
  firstMonthDiscount: boolean,
): BillingResult<CheckoutStarted> {
  if (!session.client_secret) {
    throw new Error("Stripe returned no client secret for the session");
  }
  return {
    ok: true,
    value: {
      clientSecret: session.client_secret,
      sessionId: session.id,
      firstMonthDiscount,
    },
  };
}

/* ---------- Extra hours: one `video_credits` row per session ---------- */

/** When hours bought at `from` expire. UTC calendar months. */
export function extraHoursExpiry(from: Date): Date {
  return addMonthsUtc(from, EXTRA_HOUR_VALIDITY_MONTHS);
}

export type HoursFulfilResult =
  | {
      ok: true;
      created: boolean;
      hours: number;
      seconds: number;
      expiresAt: string;
    }
  | {
      ok: false;
      /** `user_gone`: see `fulfilCreditCheckout()` — acknowledged, not retried. */
      reason:
        "not_hours" | "unpaid" | "bad_metadata" | "wrong_user" | "user_gone";
    };

/**
 * Turn a paid extra-hours session into a `video_credits` row, so the one
 * spend path (`reserve_personal_quota`, soonest-expiring first) covers old
 * credits and new hours alike.
 *
 * The row is `source = 'purchase'` with NO `pack`: a pack names one of the
 * two retired bundles, and by-the-hour purchases are told apart by its
 * absence. That also needs no change to the live `pack` check.
 *
 * Idempotent on the session: `stripe_checkout_session`,
 * `stripe_payment_intent` and `stripe_event_id` are each unique, so the
 * webhook racing `/api/billing/confirm` ends with one row and the loser's
 * unique violation (23505) reads as "already recorded". `expectedUserId` is
 * confirm's: a player cannot confirm someone else's session onto themselves.
 */
export async function fulfilHoursCheckout(params: {
  admin: SupabaseClient;
  session: Stripe.Checkout.Session;
  eventId?: string | null;
  expectedUserId?: string;
}): Promise<HoursFulfilResult> {
  const { admin, session, eventId, expectedUserId } = params;
  const metadata = session.metadata ?? {};

  if (metadata.kind !== HOURS_CHECKOUT_KIND) {
    return { ok: false, reason: "not_hours" };
  }
  const hours = Number(metadata.hours);
  const userId = metadata.user_id;
  if (
    !userId ||
    session.mode !== "payment" ||
    !Number.isInteger(hours) ||
    hours < MIN_EXTRA_HOURS ||
    hours > MAX_EXTRA_HOURS
  ) {
    return { ok: false, reason: "bad_metadata" };
  }
  if (expectedUserId !== undefined && expectedUserId !== userId) {
    return { ok: false, reason: "wrong_user" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "unpaid" };
  }

  const seconds = hours * 3600;
  // From when Stripe created the session, not when this runs: a webhook
  // retried days later must not stretch the 12 months.
  const expiresAt = extraHoursExpiry(
    new Date(session.created * 1000),
  ).toISOString();
  const recorded = (created: boolean): HoursFulfilResult => ({
    ok: true,
    created,
    hours,
    seconds,
    expiresAt,
  });

  const existing = await admin
    .from("video_credits")
    .select("id")
    .eq("stripe_checkout_session", session.id)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Could not read video credits: ${existing.error.message}`);
  }
  if (existing.data) return recorded(false);

  const { error } = await admin.from("video_credits").insert({
    user_id: userId,
    seconds,
    remaining_seconds: seconds,
    expires_at: expiresAt,
    source: "purchase",
    pack: null,
    stripe_checkout_session: session.id,
    stripe_payment_intent: expandableId(session.payment_intent),
    stripe_event_id: eventId ?? null,
    amount_cents: session.amount_total,
    currency: session.currency,
  });

  if (error?.code === "23505") return recorded(false);
  if (error?.code === "23503") return { ok: false, reason: "user_gone" };
  if (error) {
    throw new Error(`Could not record video hours: ${error.message}`);
  }
  return recorded(true);
}

/* ---------- A completed plan session ---------- */

export type PlanFulfilResult =
  | { ok: true; sync: SyncOutcome }
  | {
      ok: false;
      reason: "not_plan" | "unpaid" | "bad_metadata" | "wrong_user";
    };

/**
 * Write the plan a completed subscription session bought, through
 * `syncSubscription()`. The session only says WHICH subscription and whose;
 * the plan, period and dates come from the subscription itself.
 */
export async function fulfilPlanCheckout(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  expectedUserId?: string;
}): Promise<PlanFulfilResult> {
  const { admin, stripe, session, expectedUserId } = params;
  const metadata = session.metadata ?? {};
  if (metadata.kind !== PLAN_CHECKOUT_KIND) {
    return { ok: false, reason: "not_plan" };
  }
  const userId = metadata.user_id || session.client_reference_id;
  const subscriptionId = expandableId(
    session.subscription as string | { id: string } | null,
  );
  if (!userId || session.mode !== "subscription" || !subscriptionId) {
    return { ok: false, reason: "bad_metadata" };
  }
  if (expectedUserId !== undefined && expectedUserId !== userId) {
    return { ok: false, reason: "wrong_user" };
  }
  if (session.status !== "complete" || session.payment_status === "unpaid") {
    return { ok: false, reason: "unpaid" };
  }
  return {
    ok: true,
    sync: await syncSubscription({
      admin,
      stripe,
      subscriptionId,
      userIdHint: userId,
    }),
  };
}

/* ---------- `/api/billing/confirm` ---------- */

export type ConfirmValue =
  | { kind: "hours"; hours: number; seconds: number; expiresAt: string }
  | {
      kind: "plan";
      plan: string | null;
      period: string | null;
      status: string | null;
    };

const NOT_FOUND = (detail: string) =>
  refuse("not_found", 404, "That purchase wasn't found.", detail);

/**
 * Record a just-completed session for its own buyer, now rather than when
 * the webhook lands. The session is fetched from Stripe (the browser's word
 * is not proof of payment) and must be this user's.
 */
export async function confirmCheckout(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  sessionId: unknown;
}): Promise<BillingResult<ConfirmValue>> {
  const { stripe, admin, user, sessionId } = params;
  if (!user) return { ok: false, error: SIGN_IN_REFUSAL };
  if (
    typeof sessionId !== "string" ||
    !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)
  ) {
    return NOT_FOUND("bad_session_id");
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NOT_FOUND("stripe_lookup");
  }

  const pending = (what: string): { ok: false; error: BillingRefusal } =>
    refuse(
      "not_paid",
      409,
      `The payment hasn't gone through yet. Your ${what} will appear as soon as it does.`,
      "unpaid",
    );
  // The payment stands; the webhook will record it. Say so rather than fail.
  const later = (what: string, error: unknown) => {
    console.error("[billing] confirm could not record the purchase", {
      userId: user.id,
      sessionId: session.id,
      error: errorMessage(error),
    });
    return refuse(
      "checkout_unavailable",
      503,
      `Your payment went through. Your ${what} will appear in a minute.`,
      "record_failed",
    );
  };

  const kind = session.metadata?.kind;
  if (kind === HOURS_CHECKOUT_KIND) {
    let result: HoursFulfilResult;
    try {
      result = await fulfilHoursCheckout({
        admin,
        session,
        expectedUserId: user.id,
      });
    } catch (error) {
      return later("hours", error);
    }
    if (result.ok) {
      return {
        ok: true,
        value: {
          kind: "hours",
          hours: result.hours,
          seconds: result.seconds,
          expiresAt: result.expiresAt,
        },
      };
    }
    // `wrong_user` reads as not found: whose session it is is not ours to say.
    return result.reason === "unpaid"
      ? pending("hours")
      : NOT_FOUND(result.reason);
  }

  if (kind === PLAN_CHECKOUT_KIND) {
    let result: PlanFulfilResult;
    try {
      result = await fulfilPlanCheckout({
        admin,
        stripe,
        session,
        expectedUserId: user.id,
      });
    } catch (error) {
      return later("plan", error);
    }
    if (!result.ok) {
      return result.reason === "unpaid"
        ? pending("plan")
        : NOT_FOUND(result.reason);
    }
    const sync = result.sync;
    if (sync.outcome === "pending") return pending("plan");
    if (sync.outcome === "duplicate") {
      // A second plan paid for while the first is live: not written, and
      // cancelled and refunded by the sync (or about to be, by its retry).
      return refuse(
        "already_subscribed",
        409,
        sync.cancelled && sync.refunded
          ? "You already have a plan, so this second payment was refunded."
          : "You already have a plan. This second payment will be refunded.",
        "duplicate_subscription",
      );
    }
    if (sync.outcome !== "synced") return later("plan", sync.outcome);
    return {
      ok: true,
      value: {
        kind: "plan",
        plan: sync.plan,
        period: sync.period,
        status: sync.status,
      },
    };
  }

  return NOT_FOUND("not_ours");
}

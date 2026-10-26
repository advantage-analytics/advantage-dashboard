/**
 * Credit-pack checkout and fulfilment — server only.
 *
 * Checkout runs as Stripe EMBEDDED Checkout (`ui_mode: "embedded"`) with
 * `redirect_on_completion: "never"`: the wizard's picked video is an in-memory
 * `File`, and a redirect to Stripe would lose it along with the trim. The
 * browser mounts the session inside the paywall dialog and hears completion
 * through `onComplete`.
 *
 * Fulfilment has two callers that must agree, and do by sharing
 * `fulfilCreditCheckout()`: the webhook (`checkout.session.completed` /
 * `async_payment_succeeded`) and `/api/credits/confirm`, which the dialog calls
 * on completion so the hours land without waiting on webhook delivery. One
 * credit row per Checkout Session — `video_credits.stripe_checkout_session` is
 * unique — so whichever arrives second inserts nothing.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PROVIDER_DISPLAY_NAME } from "@/lib/services/splitstep/config";
import {
  creditExpiry,
  creditPack,
  isCreditPackId,
  packName,
  packSeconds,
  type CreditPack,
  type CreditPackId,
} from "./packs";

/** `metadata.kind` on every credit-pack session — the webhook branches on it. */
export const CREDITS_CHECKOUT_KIND = "credits";

/**
 * Product copy Stripe shows (Cj, 2026-10-16). The card statement descriptor,
 * "ADVANTAGE INTELLIGENCE", is the account's own setting in the Stripe
 * Dashboard: Stripe refuses a per-payment `statement_descriptor` on card
 * charges, and a suffix cannot replace the prefix.
 */
export function creditProductName(pack: CreditPack): string {
  return `${PROVIDER_DISPLAY_NAME} — ${pack.hours} video ${pack.hours === 1 ? "hour" : "hours"}`;
}

export function creditProductDescription(pack: CreditPack): string {
  return (
    `${packName(pack)} of ${PROVIDER_DISPLAY_NAME} ` +
    `video analysis. Expires 12 months after purchase. All sales final, except where required by law.`
  );
}

/**
 * A pre-created Price for the pack when one is configured
 * (`STRIPE_PRICE_CREDITS_1H` / `_5H`), else null and the session builds the
 * line inline from the same copy and amount.
 */
function configuredPriceId(pack: CreditPackId): string | null {
  const value =
    pack === "1h"
      ? process.env.STRIPE_PRICE_CREDITS_1H
      : process.env.STRIPE_PRICE_CREDITS_5H;
  return value && value.startsWith("price_") ? value : null;
}

/**
 * How Stripe draws the embedded form, set per session so it matches the
 * dialog around it whatever the Dashboard says: Inter, Signal Blue
 * (`--blue`, the `advButton()` primary), a white card, rounded fields, and
 * the brand name players see everywhere else ("Advantage", never the LLC).
 * The iframe is Stripe's, so our CSS cannot reach it — these are the levers.
 *
 * Accepted by the API version this SDK pins (verified in test mode,
 * 2026-10-16) though the SDK's types predate them, hence the widened params.
 */
const CHECKOUT_BRANDING = {
  display_name: "Advantage",
  font_family: "inter",
  border_style: "rounded",
  button_color: "#3B82F6",
  background_color: "#FFFFFF",
} as const;

/** "General — electronically supplied services". */
const CREDIT_TAX_CODE = "txcd_10000000";

export async function createCreditCheckoutSession(params: {
  stripe: Stripe;
  userId: string;
  email: string | null;
  pack: CreditPackId;
}): Promise<{ id: string; clientSecret: string }> {
  const { stripe, userId, email, pack: packId } = params;
  const pack = creditPack(packId);
  const priceId = configuredPriceId(packId);

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          tax_behavior: "exclusive",
          product_data: {
            name: creditProductName(pack),
            description: creditProductDescription(pack),
            tax_code: CREDIT_TAX_CODE,
          },
        },
      };

  const metadata = {
    kind: CREDITS_CHECKOUT_KIND,
    pack: packId,
    user_id: userId,
  };

  const sessionParams: Stripe.Checkout.SessionCreateParams & {
    branding_settings: typeof CHECKOUT_BRANDING;
    wallet_options: { link: { display: "never" } };
  } = {
    mode: "payment",
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [lineItem],
    // Cards only (Apple Pay and Google Pay are cards and still show), and no
    // Link sign-up: one short form inside a 520px dialog, and no bank method
    // whose redirect `redirect_on_completion: "never"` could not return from.
    payment_method_types: ["card"],
    wallet_options: { link: { display: "never" } },
    branding_settings: CHECKOUT_BRANDING,
    automatic_tax: { enabled: true },
    client_reference_id: userId,
    ...(email ? { customer_email: email } : {}),
    metadata,
    payment_intent_data: {
      metadata,
      description: creditProductName(pack),
      ...(email ? { receipt_email: email } : {}),
    },
    custom_text: {
      submit: { message: "All sales final, except where required by law." },
    },
  };
  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.client_secret) {
    throw new Error("Stripe returned no client secret for the session");
  }
  return { id: session.id, clientSecret: session.client_secret };
}

/** The id of a Stripe field that is either an id string or the expanded object. */
export function expandableId(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export type FulfilResult =
  | {
      ok: true;
      created: boolean;
      pack: CreditPackId;
      seconds: number;
      expiresAt: string;
    }
  | {
      ok: false;
      /**
       * `user_gone`: the buyer's account was deleted before the hours were
       * recorded. Nothing to credit, and a retry cannot change that, so the
       * webhook acknowledges it rather than failing until Stripe gives up.
       */
      reason:
        "not_credits" | "unpaid" | "bad_metadata" | "wrong_user" | "user_gone";
    };

/**
 * Turn a paid credit-pack session into a `video_credits` row. Idempotent on
 * the session id. `expectedUserId` is set by `/api/credits/confirm`, so a
 * player cannot confirm someone else's session onto their own account.
 */
export async function fulfilCreditCheckout(params: {
  admin: SupabaseClient;
  session: Stripe.Checkout.Session;
  eventId?: string | null;
  expectedUserId?: string;
}): Promise<FulfilResult> {
  const { admin, session, eventId, expectedUserId } = params;
  const metadata = session.metadata ?? {};

  if (metadata.kind !== CREDITS_CHECKOUT_KIND) {
    return { ok: false, reason: "not_credits" };
  }
  const packId = metadata.pack;
  const userId = metadata.user_id;
  if (!isCreditPackId(packId) || !userId || session.mode !== "payment") {
    return { ok: false, reason: "bad_metadata" };
  }
  if (expectedUserId !== undefined && expectedUserId !== userId) {
    return { ok: false, reason: "wrong_user" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "unpaid" };
  }

  const pack = creditPack(packId);
  const seconds = packSeconds(pack);
  // From when Stripe created the session, not when this runs: a webhook
  // retried days later must not stretch the 12 months.
  const expiresAt = creditExpiry(
    new Date(session.created * 1000),
  ).toISOString();
  const paymentIntent = expandableId(session.payment_intent);

  const existing = await admin
    .from("video_credits")
    .select("id")
    .eq("stripe_checkout_session", session.id)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Could not read video credits: ${existing.error.message}`);
  }
  const recorded = (created: boolean): FulfilResult => ({
    ok: true,
    created,
    pack: packId,
    seconds,
    expiresAt,
  });
  if (existing.data) return recorded(false);

  // A plain insert: every unique column (session, payment intent, event) names
  // this one purchase, so ANY unique conflict means a concurrent caller —
  // the webhook racing /api/credits/confirm — recorded it first. That is the
  // idempotent outcome, not an error.
  const { error } = await admin.from("video_credits").insert({
    user_id: userId,
    seconds,
    remaining_seconds: seconds,
    expires_at: expiresAt,
    source: "purchase",
    pack: packId,
    stripe_checkout_session: session.id,
    stripe_payment_intent: paymentIntent,
    stripe_event_id: eventId ?? null,
    amount_cents: session.amount_total,
    currency: session.currency,
  });

  if (error?.code === "23505") return recorded(false);
  if (error?.code === "23503") {
    return { ok: false, reason: "user_gone" };
  }
  if (error) {
    throw new Error(`Could not record video credits: ${error.message}`);
  }
  return recorded(true);
}

/**
 * A refund or a dispute takes the purchase's UNSPENT hours away. All sales are
 * final (Cj, 2026-10-16), but a chargeback or a refund issued by hand from the
 * Dashboard still returns the money, and the hours must not outlive it. Hours
 * already spent stay spent — the vendor was paid for them.
 *
 * `cap_video_credit` lowers `remaining_seconds` to at most `maxRemaining` in
 * one statement, so it never races a reservation, and a redelivered event
 * computes the same cap and changes nothing. A cap of 0 also expires the lot,
 * so a job holding its seconds that later fails cannot hand them back into
 * something spendable. (A PARTIAL refund leaves the lot live: an in-flight
 * job that fails afterwards can return up to its reservation above the cap.
 * Partial refunds are a manual Dashboard action; accepted.) A partial refund keeps the share
 * of the pack still paid for; a full refund or any dispute keeps none.
 */
export async function revokeCreditsForCharge(params: {
  admin: SupabaseClient;
  paymentIntent: string;
  /** What the charge was for and how much of it went back, in cents. */
  amountCents: number;
  refundedCents: number;
  disputed: boolean;
}): Promise<{ found: boolean; remainingSeconds: number | null }> {
  const { admin, paymentIntent, amountCents, refundedCents, disputed } = params;

  const lot = await admin
    .from("video_credits")
    .select("seconds")
    .eq("stripe_payment_intent", paymentIntent)
    .maybeSingle();
  if (lot.error) {
    throw new Error(`Could not read video credits: ${lot.error.message}`);
  }
  if (!lot.data) return { found: false, remainingSeconds: null };

  const paidShare =
    disputed || amountCents <= 0
      ? 0
      : Math.max(0, (amountCents - refundedCents) / amountCents);
  const maxRemaining = Math.floor((lot.data.seconds as number) * paidShare);

  const { data, error } = await admin.rpc("cap_video_credit", {
    p_payment_intent: paymentIntent,
    p_max_remaining: maxRemaining,
  });
  if (error) {
    throw new Error(`Could not revoke video credits: ${error.message}`);
  }
  return { found: true, remainingSeconds: (data as number | null) ?? null };
}

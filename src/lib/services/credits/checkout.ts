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
    `${pack.hours} ${pack.hours === 1 ? "hour" : "hours"} of ${PROVIDER_DISPLAY_NAME} ` +
    `video analysis. Expires 12 months after purchase. All sales final.`
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [lineItem],
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
      submit: { message: "All sales final." },
    },
  });

  if (!session.client_secret) {
    throw new Error("Stripe returned no client secret for the session");
  }
  return { id: session.id, clientSecret: session.client_secret };
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
      reason: "not_credits" | "unpaid" | "bad_metadata" | "wrong_user";
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
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data, error } = await admin
    .from("video_credits")
    .upsert(
      {
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
      },
      { onConflict: "stripe_checkout_session", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    throw new Error(`Could not record video credits: ${error.message}`);
  }
  return {
    ok: true,
    created: (data ?? []).length > 0,
    pack: packId,
    seconds,
    expiresAt,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilCreditCheckout } from "@/lib/services/credits/checkout";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!webhookSecret) {
  throw new Error(
    "STRIPE_WEBHOOK_SECRET is not defined in environment variables",
  );
}

/**
 * Stripe's events for credit-pack purchases.
 *
 * Branches on the session's `metadata.kind`: only `"credits"` sessions do
 * anything, and what they do is insert one `video_credits` row, idempotent on
 * the session id (`fulfilCreditCheckout()`, shared with `/api/credits/confirm`).
 * It no longer sets `users.plan = 'pro'` for every completed checkout — that
 * was the retired $4.99 Lifetime product, and a credit purchase is not a plan.
 *
 * `async_payment_succeeded` covers a payment method that settles after the
 * session completes; `completed` with `payment_status: "unpaid"` waits for it.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 },
    );
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    let result;
    try {
      result = await fulfilCreditCheckout({
        admin: createAdminClient(),
        session,
        eventId: event.id,
      });
    } catch (error) {
      // 500 so Stripe retries; the insert is idempotent.
      console.error("[stripe webhook] could not record credits", {
        eventId: event.id,
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Could not record credits" },
        { status: 500 },
      );
    }

    if (!result.ok && result.reason === "bad_metadata") {
      // A credits session we cannot attribute. Acknowledge (a retry cannot fix
      // it) and leave a trail for whoever reconciles it by hand.
      console.error("[stripe webhook] credits session with bad metadata", {
        eventId: event.id,
        sessionId: session.id,
        metadata: session.metadata,
      });
    }

    return NextResponse.json({
      received: true,
      ...(result.ok ? { created: result.created } : { skipped: result.reason }),
    });
  }

  return NextResponse.json({ received: true });
}

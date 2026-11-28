import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeEvent } from "@/lib/services/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!webhookSecret) {
  throw new Error(
    "STRIPE_WEBHOOK_SECRET is not defined in environment variables",
  );
}

/**
 * Stripe's events: plans, extra hours, the retired credit packs, refunds.
 *
 * This route verifies the signature and nothing else. What each event does
 * is `handleStripeEvent()` (`services/billing/webhook.ts`), which takes the
 * Stripe and service-role clients as arguments so it can be tested with
 * fixture events.
 *
 * Events the endpoint must be subscribed to in the Stripe Dashboard:
 * `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
 * `customer.subscription.created`, `customer.subscription.updated`,
 * `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
 * `charge.refunded`, `charge.dispute.created`.
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

  const answer = await handleStripeEvent({
    event,
    stripe,
    admin: createAdminClient(),
  });
  return NextResponse.json(answer.body, { status: answer.status });
}

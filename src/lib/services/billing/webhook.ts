/**
 * What `/api/webhooks/stripe` does with a VERIFIED event — server only.
 *
 * The route owns the signature check and nothing else; everything after it is
 * here, with the Stripe client and the service-role client handed in, so a
 * spec can drive it with fixture events and no network.
 *
 * ── Checkout sessions ──────────────────────────────────────────────────────
 * `checkout.session.completed` and `.async_payment_succeeded` branch on the
 * session's `metadata.kind`, which only our own server sets:
 *
 *   "credits"  the retired $14 / $60 packs. Unchanged: a session paid before
 *              they were retired still records (`fulfilCreditCheckout()`).
 *   "hours"    extra hours → one `video_credits` row (`fulfilHoursCheckout()`).
 *   "plan"     a subscription → `syncSubscription()`.
 *   else       not ours; acknowledged.
 *
 * ── Subscriptions and invoices ─────────────────────────────────────────────
 * `customer.subscription.created` / `.updated` / `.deleted`, `invoice.paid`
 * and `invoice.payment_failed` all do ONE thing: name a subscription, which
 * `syncSubscription()` then re-fetches and writes. No handler applies a delta
 * from the event body, so duplicates and out-of-order delivery are harmless —
 * see that file for what each subscription status writes.
 *
 * ── Refunds and disputes ───────────────────────────────────────────────────
 * `charge.refunded` and `charge.dispute.created` take a purchase's UNSPENT
 * hours away (`revokeCreditsForCharge()`), for packs and extra hours alike:
 * both are `video_credits` rows keyed by their payment intent.
 *
 * ── Answers ────────────────────────────────────────────────────────────────
 * 200 for everything handled, skipped or not ours. 500 only where a retry can
 * help (a failed read or write, a refund that arrived before its purchase) —
 * every write is idempotent, so Stripe retrying is always safe.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CREDITS_CHECKOUT_KIND,
  expandableId,
  fulfilCreditCheckout,
  revokeCreditsForCharge,
} from "@/lib/services/credits/checkout";
import {
  HOURS_CHECKOUT_KIND,
  PLAN_CHECKOUT_KIND,
  fulfilHoursCheckout,
  fulfilPlanCheckout,
} from "./checkout";
import { syncSubscription } from "./subscription";

export interface WebhookAnswer {
  status: number;
  body: Record<string, unknown>;
}

const received = (extra: Record<string, unknown> = {}): WebhookAnswer => ({
  status: 200,
  body: { received: true, ...extra },
});

const retry = (error: string): WebhookAnswer => ({
  status: 500,
  body: { error },
});

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Purchases whose refund must wait for the purchase to be recorded. */
const HOURS_KINDS: ReadonlySet<string> = new Set([
  CREDITS_CHECKOUT_KIND,
  HOURS_CHECKOUT_KIND,
]);

async function handleCheckoutSession(
  event: Stripe.Event,
  stripe: Stripe,
  admin: SupabaseClient,
): Promise<WebhookAnswer> {
  const session = event.data.object as Stripe.Checkout.Session;
  const kind = session.metadata?.kind;

  if (kind === PLAN_CHECKOUT_KIND) {
    try {
      const result = await fulfilPlanCheckout({ admin, stripe, session });
      if (!result.ok && result.reason === "bad_metadata") {
        console.error("[stripe webhook] plan session with bad metadata", {
          eventId: event.id,
          sessionId: session.id,
          metadata: session.metadata,
        });
      }
      return received(
        result.ok
          ? { outcome: result.sync.outcome }
          : { skipped: result.reason },
      );
    } catch (error) {
      console.error("[stripe webhook] could not record the plan", {
        eventId: event.id,
        sessionId: session.id,
        error: message(error),
      });
      return retry("Could not record the plan");
    }
  }

  let result;
  try {
    result =
      kind === HOURS_CHECKOUT_KIND
        ? await fulfilHoursCheckout({ admin, session, eventId: event.id })
        : await fulfilCreditCheckout({ admin, session, eventId: event.id });
  } catch (error) {
    // 500 so Stripe retries; the insert is idempotent.
    console.error("[stripe webhook] could not record credits", {
      eventId: event.id,
      sessionId: session.id,
      error: message(error),
    });
    return retry("Could not record credits");
  }

  if (!result.ok && result.reason === "user_gone") {
    // The buyer deleted their account before the hours landed. Nothing to
    // credit and nothing a retry could change; the payment itself is in
    // Stripe for whoever reconciles it.
    console.error("[stripe webhook] credits for a deleted account", {
      eventId: event.id,
      sessionId: session.id,
    });
  }
  if (!result.ok && result.reason === "bad_metadata") {
    // A session we cannot attribute. Acknowledge (a retry cannot fix it) and
    // leave a trail for whoever reconciles it by hand.
    console.error("[stripe webhook] credits session with bad metadata", {
      eventId: event.id,
      sessionId: session.id,
      metadata: session.metadata,
    });
  }

  return received(
    result.ok ? { created: result.created } : { skipped: result.reason },
  );
}

async function handleSubscription(
  event: Stripe.Event,
  stripe: Stripe,
  admin: SupabaseClient,
  subscriptionId: string,
  fallback: Stripe.Subscription | null,
): Promise<WebhookAnswer> {
  try {
    const sync = await syncSubscription({
      admin,
      stripe,
      subscriptionId,
      fallback,
    });
    return received({ outcome: sync.outcome });
  } catch (error) {
    console.error("[stripe webhook] could not sync the subscription", {
      eventId: event.id,
      type: event.type,
      subscriptionId,
      error: message(error),
    });
    return retry("Could not sync the subscription");
  }
}

async function handleRefund(
  event: Stripe.Event,
  stripe: Stripe,
  admin: SupabaseClient,
): Promise<WebhookAnswer> {
  const disputed = event.type === "charge.dispute.created";
  const object = event.data.object as Stripe.Charge | Stripe.Dispute;
  const paymentIntent = expandableId(object.payment_intent);
  if (!paymentIntent) return received();

  const charge = disputed ? null : (object as Stripe.Charge);
  try {
    const revoked = await revokeCreditsForCharge({
      admin,
      paymentIntent,
      amountCents: charge?.amount ?? 0,
      refundedCents: charge?.amount_refunded ?? 0,
      disputed,
    });
    if (!revoked.found) {
      // No lot for this payment. Either it is not an hours purchase (a
      // subscription invoice, the retired Pro, anything else) — acknowledge —
      // or the purchase has not been recorded yet and the refund arrived
      // first: answer 500 so Stripe retries after fulfilment, rather than
      // lose the refund and later grant the full hours for money that went
      // back.
      const intent = await stripe.paymentIntents.retrieve(paymentIntent);
      if (HOURS_KINDS.has(intent.metadata?.kind ?? "")) {
        console.error(
          "[stripe webhook] refund before its credits were recorded",
          { eventId: event.id, paymentIntent },
        );
        return retry("Credits not recorded yet");
      }
    }
    if (revoked.found) {
      console.log("[stripe webhook] credits revoked", {
        eventId: event.id,
        paymentIntent,
        disputed,
        remainingSeconds: revoked.remainingSeconds,
      });
    }
  } catch (error) {
    console.error("[stripe webhook] could not revoke credits", {
      eventId: event.id,
      paymentIntent,
      error: message(error),
    });
    return retry("Could not revoke credits");
  }
  return received();
}

export async function handleStripeEvent(params: {
  event: Stripe.Event;
  stripe: Stripe;
  admin: SupabaseClient;
}): Promise<WebhookAnswer> {
  const { event, stripe, admin } = params;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutSession(event, stripe, admin);

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return handleSubscription(
        event,
        stripe,
        admin,
        subscription.id,
        subscription,
      );
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = expandableId(
        invoice.subscription as string | { id: string } | null,
      );
      // A one-off invoice (a college's, sent from the Dashboard) is not ours.
      if (!subscriptionId) return received({ skipped: "no_subscription" });
      return handleSubscription(event, stripe, admin, subscriptionId, null);
    }

    case "charge.refunded":
    case "charge.dispute.created":
      return handleRefund(event, stripe, admin);

    default:
      return received();
  }
}

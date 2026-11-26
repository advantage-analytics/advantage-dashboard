/**
 * `POST { sessionId }` — record a just-completed plan or extra-hours checkout
 * now, rather than waiting on the webhook.
 *
 * The checkout dialog calls it from Embedded Checkout's `onComplete`, so the
 * plan or the hours are on the account before the page re-reads them. It asks
 * Stripe for the session itself, insists it belongs to this signed-in user,
 * and writes through the same idempotent functions the webhook does —
 * whichever lands second changes nothing.
 *
 * Answers `{ kind: "hours", hours, seconds, expiresAt }` or
 * `{ kind: "plan", plan, period, status }`. A pack session bought before the
 * packs were retired is `/api/credits/confirm`'s, as it always was.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmCheckout } from "@/lib/services/billing/checkout";
import { billingResponse } from "@/lib/services/billing/http";
import { billingRouteContext } from "@/lib/services/billing/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await billingRouteContext(request, { body: true });
  if (!context.ok) return context.response;

  const result = await confirmCheckout({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    sessionId: context.body.sessionId,
  });
  return billingResponse(result);
}

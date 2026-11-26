/**
 * Open a checkout: `POST { kind: "plan", plan, period }` for Coach or Coach
 * Pro, monthly or yearly, or `POST { kind: "hours", hours }` for 1–50 extra
 * hours.
 *
 * Answers `{ clientSecret, sessionId, firstMonthDiscount }` for Stripe
 * Embedded Checkout, mounted in the one checkout dialog — never a redirect
 * (see `services/billing/checkout.ts`). The buyer is this request's own
 * signed-in user; the price, the amount and the first-month discount are the
 * server's, and nothing in the body can name them.
 *
 * Refusal codes: `unauthenticated`, `invalid_request`, `plans_not_on_sale`,
 * `price_not_configured`, `already_subscribed`, `checkout_unavailable`.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, jsonResponse } from "@/lib/services/match-video/http";
import { startCheckout } from "@/lib/services/billing/checkout";
import { asHttpError } from "@/lib/services/billing/http";
import { billingRouteContext } from "@/lib/services/billing/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await billingRouteContext(request, { body: true });
  if (!context.ok) return context.response;

  const result = await startCheckout({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    body: context.body,
  });
  return result.ok
    ? jsonResponse(result.value)
    : errorResponse(asHttpError(result.error));
}

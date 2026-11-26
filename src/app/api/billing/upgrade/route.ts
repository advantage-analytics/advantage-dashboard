/**
 * `POST { payTodayCents? }` — upgrade this user's Coach subscription to Coach
 * Pro on the same period, now. Decision 7: a new billing period starts today,
 * the full Coach Pro price less a credit for the unused part of Coach, and
 * the full Coach Pro hours fresh.
 *
 * `payTodayCents` is the figure the dialog showed (from
 * `/api/billing/upgrade/preview`). When sent and no longer right, the upgrade
 * is refused with `quote_changed` instead of charging a number nobody saw.
 *
 * Charges the card on file — there is no checkout form. The order of Stripe
 * calls and what each failure leaves is at the top of
 * `services/billing/upgrade.ts`.
 *
 * Refusal codes: `unauthenticated`, `no_subscription`, `not_an_upgrade`,
 * `price_not_configured`, `quote_changed`, `upgrade_in_progress`,
 * `payment_failed`, `checkout_unavailable`.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, transportError } from "@/lib/services/match-video/http";
import { billingResponse } from "@/lib/services/billing/http";
import { billingRouteContext } from "@/lib/services/billing/route-context";
import { executeUpgrade } from "@/lib/services/billing/upgrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await billingRouteContext(request, { body: true });
  if (!context.ok) return context.response;

  const expected = context.body.payTodayCents;
  if (
    expected !== undefined &&
    !(
      typeof expected === "number" &&
      Number.isInteger(expected) &&
      expected >= 0
    )
  ) {
    return errorResponse(transportError("invalid_request", "bad_pay_today"));
  }

  const result = await executeUpgrade({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    expectedPayTodayCents: expected,
  });
  return billingResponse(result);
}

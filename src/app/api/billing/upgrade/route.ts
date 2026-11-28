/**
 * `POST { payTodayCents?, period?, plan? }` — make one of the two plan changes
 * that are charged today:
 *
 *   `{}`                    Coach → Coach Pro on the same period (decision 7):
 *                           a new billing period starts today, the full Coach
 *                           Pro price less a credit for the unused part of
 *                           Coach, and the full Coach Pro hours fresh.
 *   `{ period: "yearly" }`  the same plan, paid yearly from today: the yearly
 *                           price less the same credit for the unused part of
 *                           the current month. Hours stay monthly.
 *
 * `plan` may name the target plan too; whatever is asked, only those two
 * changes are made (`upgradeKind()`), and anything else is `not_an_upgrade`.
 *
 * `payTodayCents` is the figure the dialog showed (from
 * `/api/billing/upgrade/preview`). When sent and no longer right, the upgrade
 * is refused with `quote_changed` instead of charging a number nobody saw.
 *
 * Charges the card on file — there is no checkout form. The order of Stripe
 * calls and what each failure leaves is at the top of
 * `services/billing/upgrade.ts`.
 *
 * Refusal codes: `unauthenticated`, `invalid_request`, `no_subscription`,
 * `past_due`, `not_an_upgrade`, `price_not_configured`, `quote_changed`,
 * `upgrade_in_progress`, `payment_failed`, `checkout_unavailable`.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, transportError } from "@/lib/services/match-video/http";
import { billingResponse } from "@/lib/services/billing/http";
import { billingRouteContext } from "@/lib/services/billing/route-context";
import {
  executeUpgrade,
  readUpgradeRequest,
} from "@/lib/services/billing/upgrade";

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

  const target = readUpgradeRequest(context.body);
  if (target === null) {
    return errorResponse(transportError("invalid_request", "bad_target"));
  }

  const result = await executeUpgrade({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    expectedPayTodayCents: expected,
    target,
  });
  return billingResponse(result);
}

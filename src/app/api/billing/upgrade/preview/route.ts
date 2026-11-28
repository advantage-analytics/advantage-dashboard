/**
 * `POST { period?, plan? }` — what a plan change charged today would cost
 * this user right now: Player → Player Pro with no body, the switch to yearly
 * with `{ period: "yearly" }`. Reads only; nothing is charged or changed.
 *
 * Answers `{ payTodayCents, creditCents, creditBasis: "days" | "hours",
 * daysLeft, hoursLeftSeconds, newPeriodPriceCents, nextBillingDay, … }` — the
 * numbers the checkout dialog shows and `/api/billing/upgrade` then charges,
 * from the same function (`quoteUpgrade()`). Before tax.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingResponse } from "@/lib/services/billing/http";
import { billingRouteContext } from "@/lib/services/billing/route-context";
import { errorResponse, transportError } from "@/lib/services/match-video/http";
import {
  previewUpgrade,
  readUpgradeRequest,
} from "@/lib/services/billing/upgrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // The body is optional: the Upgrade button sends none.
  const context = await billingRouteContext(request, {
    body: "optional",
  });
  if (!context.ok) return context.response;

  const target = readUpgradeRequest(context.body);
  if (target === null) {
    return errorResponse(transportError("invalid_request", "bad_target"));
  }

  const result = await previewUpgrade({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    target,
  });
  return billingResponse(result);
}

/**
 * `POST` — what upgrading Coach → Coach Pro would cost this user right now.
 * Reads only; nothing is charged or changed.
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
import { previewUpgrade } from "@/lib/services/billing/upgrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await billingRouteContext(request, { body: false });
  if (!context.ok) return context.response;

  const result = await previewUpgrade({
    stripe,
    admin: createAdminClient(),
    user: context.user,
  });
  return billingResponse(result);
}

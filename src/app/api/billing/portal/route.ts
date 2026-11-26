/**
 * `POST` — a Stripe Customer Portal session for this user: update the card,
 * read invoices, cancel at the end of the period. Answers `{ url }`.
 *
 * Plan switching is NOT done there: the portal configuration has it off
 * (`STRIPE_PORTAL_CONFIGURATION`, made by `scripts/stripe/setup-plans-2027.ts`)
 * and an upgrade goes through `/api/billing/upgrade`, which is the only place
 * decision 7's credit is worked out.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, jsonResponse } from "@/lib/services/match-video/http";
import { asHttpError } from "@/lib/services/billing/http";
import { openPortal } from "@/lib/services/billing/portal";
import { billingRouteContext } from "@/lib/services/billing/route-context";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const context = await billingRouteContext(request, { body: false });
  if (!context.ok) return context.response;

  const result = await openPortal({
    stripe,
    admin: createAdminClient(),
    user: context.user,
    origin: await requestOrigin(),
  });
  return result.ok
    ? jsonResponse(result.value)
    : errorResponse(asHttpError(result.error));
}

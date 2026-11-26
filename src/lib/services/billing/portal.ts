/**
 * The Stripe Customer Portal — server only. Card, invoices and cancelling
 * (at the end of the period, which the portal configuration sets); never a
 * plan switch.
 *
 * It opens ONLY on our own configuration (`STRIPE_PORTAL_CONFIGURATION`,
 * plan switching off). With none set, Stripe would fall back to the
 * account's default configuration, which anyone with Dashboard access can
 * turn plan switching on in — and a switch made there skips
 * `/api/billing/upgrade` and its credit rule. So an unset variable is a
 * refusal, never a session.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_HREF } from "@/lib/services/credits/packs";
import {
  PORTAL_CONFIGURATION_ENV,
  portalConfigurationId,
} from "@/lib/stripe/prices";
import {
  SIGN_IN_REFUSAL,
  errorMessage,
  refuse,
  type BillingResult,
} from "./http";
import type { CheckoutUser } from "./checkout";
import { readBillingUser } from "./subscription";

export async function openPortal(params: {
  stripe: Stripe;
  admin: SupabaseClient;
  user: CheckoutUser | null;
  /** Where the person is — the portal's "Return" goes back to Settings › Plan. */
  origin: string;
}): Promise<BillingResult<{ url: string }>> {
  const { stripe, admin, user, origin } = params;
  if (!user) return { ok: false, error: SIGN_IN_REFUSAL };

  try {
    const row = await readBillingUser(admin, "id", user.id);
    if (!row?.stripe_customer_id) {
      // Never bought anything: there is no card or invoice to show.
      return refuse(
        "no_subscription",
        409,
        "There's no billing to manage yet.",
        "no_customer",
      );
    }
    const configuration = portalConfigurationId();
    if (!configuration) {
      console.error("[billing] the portal has no configuration to open on", {
        userId: user.id,
        missing: PORTAL_CONFIGURATION_ENV,
      });
      return refuse(
        "price_not_configured",
        503,
        "Billing isn't available yet. Try again later.",
        PORTAL_CONFIGURATION_ENV,
      );
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}${PLAN_HREF}`,
      configuration,
    });
    return { ok: true, value: { url: session.url } };
  } catch (error) {
    console.error("[billing] could not open the portal", {
      userId: user.id,
      error: errorMessage(error),
    });
    return refuse(
      "checkout_unavailable",
      502,
      "Billing couldn't open. Try again in a moment.",
      "stripe_error",
    );
  }
}

/**
 * The Stripe Customer Portal — server only. Card, invoices and cancelling
 * (at the end of the period, which the portal configuration sets); never a
 * plan switch.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_HREF } from "@/lib/services/credits/packs";
import { portalConfigurationId } from "@/lib/stripe/prices";
import { SIGN_IN_REFUSAL, refuse, type BillingResult } from "./http";
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
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}${PLAN_HREF}`,
      ...(configuration ? { configuration } : {}),
    });
    return { ok: true, value: { url: session.url } };
  } catch (error) {
    console.error("[billing] could not open the portal", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return refuse(
      "checkout_unavailable",
      502,
      "Billing couldn't open. Try again in a moment.",
      "stripe_error",
    );
  }
}

/**
 * Start a credit-pack purchase: `POST { kind: "credits", pack: "1h" | "5h" }`.
 *
 * Answers `{ clientSecret, sessionId }` for Stripe Embedded Checkout, which
 * the paywall dialog and Settings › Plan mount in place — never a redirect,
 * because the wizard's picked video is an in-memory `File` (see
 * `services/credits/checkout.ts`). The buyer is always this request's own
 * signed-in user; nothing in the body names an account.
 *
 * The retired $4.99 Pro checkout that used to live here stays retired: any
 * other `kind` is refused.
 *
 * RETIRED with the 2027 plans: once plans and extra hours are on sale
 * (`plansOnSale()` — January 1, or the day `NEXT_PUBLIC_PLANS_ON_SALE` is
 * set), this refuses every request with `code: "packs_retired"` (410) and
 * hours are bought by the hour through `/api/billing/checkout`. Until then
 * the packs are the only way to buy hours, so they stay open. A pack session
 * already paid still confirms (`/api/credits/confirm`) and still records from
 * the webhook; the pack constants stay for reading old credits.
 */

import { stripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import {
  checkSameOrigin,
  errorResponse,
  isPlainObject,
  jsonResponse,
  readBoundedJson,
} from "@/lib/services/match-video/http";
import { createCreditCheckoutSession } from "@/lib/services/credits/checkout";
import { creditsRefusal } from "@/lib/services/credits/http";
import { isCreditPackId } from "@/lib/services/credits/packs";
import { siteUrl } from "@/lib/site-url";
import { plansOnSale } from "@/lib/billing/plans";
import { asHttpError, billingRefusal } from "@/lib/services/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return errorResponse(origin);

  if (plansOnSale()) {
    return errorResponse(
      asHttpError(
        billingRefusal(
          "packs_retired",
          410,
          "Hour packs are no longer sold. Add hours from Settings, Plan.",
          "plans_on_sale",
        ),
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return errorResponse(
      creditsRefusal(
        "unauthenticated",
        401,
        "Sign in to add video hours.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const body = raw.value;
  if (
    !isPlainObject(body) ||
    body.kind !== "credits" ||
    !isCreditPackId(body.pack)
  ) {
    return errorResponse(
      creditsRefusal(
        "invalid_pack",
        400,
        "Pick a pack to continue.",
        "bad_body",
      ),
    );
  }

  try {
    const session = await createCreditCheckoutSession({
      stripe,
      userId: user.id,
      email: user.email ?? null,
      pack: body.pack,
    });
    return jsonResponse({
      clientSecret: session.clientSecret,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("[credits] could not create checkout session", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      creditsRefusal(
        "checkout_unavailable",
        502,
        "Checkout couldn't open. Try again in a moment.",
        "stripe_error",
      ),
    );
  }
}

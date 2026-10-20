/**
 * `POST { sessionId }` — record a just-completed credit purchase now, rather
 * than waiting on the webhook.
 *
 * The paywall dialog calls it from Embedded Checkout's `onComplete`, so the
 * hours are on the account before the wizard re-reads its balance. It asks
 * Stripe for the session itself (the browser's word is not proof of payment),
 * insists it belongs to this signed-in user, and writes through the same
 * idempotent `fulfilCreditCheckout()` the webhook does — whichever lands
 * second inserts nothing.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  checkSameOrigin,
  errorResponse,
  isPlainObject,
  jsonResponse,
  readBoundedJson,
} from "@/lib/services/match-video/http";
import { fulfilCreditCheckout } from "@/lib/services/credits/checkout";
import { creditsRefusal } from "@/lib/services/credits/http";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export async function POST(request: Request): Promise<Response> {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return errorResponse(origin);

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
        "Sign in to continue.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const body = raw.value;
  if (
    !isPlainObject(body) ||
    typeof body.sessionId !== "string" ||
    !SESSION_ID.test(body.sessionId)
  ) {
    return errorResponse(
      creditsRefusal(
        "not_found",
        404,
        "That purchase wasn't found.",
        "bad_session_id",
      ),
    );
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(body.sessionId);
  } catch {
    return errorResponse(
      creditsRefusal(
        "not_found",
        404,
        "That purchase wasn't found.",
        "stripe_lookup",
      ),
    );
  }

  let result;
  try {
    result = await fulfilCreditCheckout({
      admin: createAdminClient(),
      session,
      expectedUserId: user.id,
    });
  } catch (error) {
    // The payment stands; the webhook will record it. Say so rather than fail.
    console.error("[credits] confirm could not record credits", {
      userId: user.id,
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      creditsRefusal(
        "checkout_unavailable",
        503,
        "Your payment went through. Your hours will appear in a minute.",
        "record_failed",
      ),
    );
  }

  if (!result.ok) {
    // `wrong_user` reads as not found: whose session it is is not ours to say.
    if (result.reason === "unpaid") {
      return errorResponse(
        creditsRefusal(
          "not_paid",
          409,
          "The payment hasn't gone through yet. Your hours will appear as soon as it does.",
          "unpaid",
        ),
      );
    }
    return errorResponse(
      creditsRefusal(
        "not_found",
        404,
        "That purchase wasn't found.",
        result.reason,
      ),
    );
  }

  return jsonResponse({
    pack: result.pack,
    seconds: result.seconds,
    expiresAt: result.expiresAt,
  });
}

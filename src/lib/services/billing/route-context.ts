/**
 * What every `/api/billing/*` route does before its own work: refuse a
 * cross-origin POST, read the signed-in user, and (where the route takes
 * one) read a bounded JSON body. Server only — it reads cookies.
 *
 * The user is `null` when signed out; each service function answers that
 * with the same 401, so the refusal is tested without a request.
 */

import {
  checkSameOrigin,
  errorResponse,
  isPlainObject,
  readBoundedJson,
  transportError,
} from "@/lib/services/match-video/http";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { CheckoutUser } from "./checkout";

export type BillingRouteContext =
  | { ok: false; response: Response }
  | { ok: true; user: CheckoutUser | null; body: Record<string, unknown> };

export async function billingRouteContext(
  request: Request,
  options: { body: boolean },
): Promise<BillingRouteContext> {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return { ok: false, response: errorResponse(origin) };

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const signedIn =
    error || !user ? null : { id: user.id, email: user.email ?? null };

  // Signed out is answered before the body is read, by the service.
  if (!options.body || !signedIn) {
    return { ok: true, user: signedIn, body: {} };
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return { ok: false, response: errorResponse(raw.error) };
  if (!isPlainObject(raw.value)) {
    return {
      ok: false,
      response: errorResponse(transportError("invalid_request", "bad_body")),
    };
  }
  return { ok: true, user: signedIn, body: raw.value };
}

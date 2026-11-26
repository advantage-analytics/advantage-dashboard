/**
 * Refusals the billing routes answer, in the `{ error, code?, detail? }`
 * shape every route here uses (`errorResponse()` in `match-video/http.ts`).
 * `code` is what a client branches on; `detail` names the cause for logs and
 * tests and is dropped in production.
 */

import {
  errorResponse,
  jsonResponse,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";

export type BillingRefusalCode =
  | "unauthenticated"
  | "invalid_request"
  /** Plans and hours are not being sold yet — `plansOnSale()`. */
  | "plans_not_on_sale"
  /**
   * A Stripe object this needs is not in the environment: a price, the
   * first-month coupon, or the portal configuration.
   */
  | "price_not_configured"
  /**
   * Already on a subscription: a change goes through upgrade, not checkout.
   * Also what confirm answers for a second subscription that was paid anyway
   * and has been cancelled and refunded (`detail: "duplicate_subscription"`).
   */
  | "already_subscribed"
  /** No subscription to upgrade, open a portal for, or change. */
  | "no_subscription"
  /** Not Coach → Coach Pro on a healthy subscription. */
  | "not_an_upgrade"
  /** The card on file was declined; nothing was changed. */
  | "payment_failed"
  /** The same upgrade is already being made, or was just tried. */
  | "upgrade_in_progress"
  /** The amount the dialog showed is no longer the amount. */
  | "quote_changed"
  | "checkout_unavailable"
  | "not_found"
  | "not_paid"
  /** The $14 / $60 packs are no longer sold. */
  | "packs_retired";

export type BillingRefusal = Omit<MatchVideoHttpError, "code"> & {
  code: BillingRefusalCode;
};

export function billingRefusal(
  code: BillingRefusalCode,
  status: number,
  message: string,
  detail: string,
): BillingRefusal {
  return { code, status, message, detail };
}

/** A `BillingRefusal` as the type `errorResponse()` takes. */
export function asHttpError(refusal: BillingRefusal): MatchVideoHttpError {
  return refusal as unknown as MatchVideoHttpError;
}

export type BillingResult<T> =
  { ok: true; value: T } | { ok: false; error: BillingRefusal };

/** The route's answer for a service result: the value, or the refusal. */
export function billingResponse<T>(result: BillingResult<T>): Response {
  return result.ok
    ? jsonResponse(result.value)
    : errorResponse(asHttpError(result.error));
}

export function refuse(
  code: BillingRefusalCode,
  status: number,
  message: string,
  detail: string,
): { ok: false; error: BillingRefusal } {
  return { ok: false, error: billingRefusal(code, status, message, detail) };
}

export const SIGN_IN_REFUSAL = billingRefusal(
  "unauthenticated",
  401,
  "Sign in to continue.",
  "no_session",
);

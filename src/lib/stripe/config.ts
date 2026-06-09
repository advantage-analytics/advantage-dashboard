/**
 * Stripe configuration constants for the Pro plan.
 *
 * The Pro plan is a one-time purchase (mirrors the original Founder's Pass) that
 * grants permanent access to unlimited uploads and premium analytics.
 */

export const STRIPE_CONFIG = {
  /** Pre-created Stripe price ID for the Pro plan ($4.99 one-time, live mode). */
  PRO_PRICE_ID: "price_1TfTr8Ra87cJ9TbvBIdjNDwS",

  /** Pro plan price in cents ($4.99) — fallback when building inline price_data. */
  PRO_PRICE: 499,

  /** Pro plan product name. */
  PRO_NAME: "Pro",

  /** Pro plan description. */
  PRO_DESCRIPTION: "Unlimited match reports and file uploads",

  /** Currency for all transactions. */
  CURRENCY: "usd",

  /** User type options for checkout. */
  USER_TYPES: [
    { label: "Coach", value: "coach" },
    { label: "Player", value: "player" },
    { label: "Analyst", value: "analyst" },
  ] as const,
} as const;

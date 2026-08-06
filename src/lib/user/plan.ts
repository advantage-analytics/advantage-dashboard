/**
 * `users.plan` value that marks a user as having purchased the one-time Pro
 * plan. Entitlement lives in `plan`, written only by the Stripe webhook;
 * `users.role` is the self-described profile persona (player/coach/parent/
 * academy) and must never be used for gating.
 *
 * Kept free of server-only imports so client components can use it.
 */
export const PRO_PLAN = "pro";

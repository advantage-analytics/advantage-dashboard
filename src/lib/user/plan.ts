/**
 * Paid entitlement lives in `users.plan`, not `users.role`.
 *
 * Migration 20260806144035 split the two and said why: `role` carried both a
 * profile persona (player/coach/parent/academy) AND the marker `'founder'` for
 * a paid account, so saving the profile form silently cleared Pro. It added
 * `users.plan`, backfilled it, and documented `plan` as the column billing
 * writes — but the app was never moved across, so billing kept writing
 * `role = 'founder'` and the Plan page kept reading it. Round 4 finishes the
 * migration: billing writes `plan`, every reader reads `plan`, and `role` is
 * persona-only in code as well as in the comment.
 *
 * Legacy `role = 'founder'` values are left alone. The migration already set
 * `plan = 'pro'` for every one of them, so nothing needs them. Settings no
 * longer edits `role` at all; only onboarding writes it.
 *
 * Client-safe: the Plan settings page is a client component and imports from
 * here. Keep this file free of server imports — the write that needs the
 * service role lives in `roles.ts`, which a client file must never import.
 */

/** `users.plan` value for a paid account. Constrained to 'free' | 'pro' in SQL. */
export const PRO_PLAN = "pro";

/** Whether a `users.plan` value entitles the account to Pro features. */
export function isProPlan(plan: string | null | undefined): boolean {
  return plan === PRO_PLAN;
}

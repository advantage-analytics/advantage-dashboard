/**
 * Pilot terms — the version a coach must have accepted before a team can be
 * created or claimed.
 *
 * The version literal lives in exactly two places that name each other:
 *
 *   * `PILOT_TERMS_VERSION` here
 *   * `public.current_pilot_terms_version()` in
 *     `supabase/migrations/20260926181544_pilot_terms_acceptances.sql`
 *
 * Bump both in the same change (the SQL side is a new migration replacing
 * the function body). A `pilot_terms_acceptances` row whose `terms_version`
 * is not the current one counts as no acceptance — a new version means every
 * coach accepts again before their next creation or claim.
 *
 * The terms' copy itself joins this module with the terms screen (T4), so
 * that the words a coach accepted and the version they accepted under can
 * never drift apart.
 */
export const PILOT_TERMS_VERSION = "2026-fall-pilot-1";

/**
 * SQLSTATE the program-creating RPCs raise when the acting user holds no
 * acceptance for `PILOT_TERMS_VERSION` — `supabase/migrations/
 * *_pilot_terms_enforcement.sql` documents the choice. The server actions
 * around `create_custom_program`, `complete_program_claim` and
 * `complete_program_claim_with_token` map it to the `"terms-not-accepted"`
 * result reason.
 */
export const TERMS_NOT_ACCEPTED_SQLSTATE = "TA001";

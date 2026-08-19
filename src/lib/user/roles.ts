import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Paid entitlement lives in `users.plan`, not `users.role`.
 *
 * Migration 20260806144035 split the two and said why: `role` carried both a
 * profile persona (player/coach/parent/academy) AND the marker `'founder'` for
 * a paid account, so saving the profile form silently cleared Pro. It added
 * `users.plan`, backfilled it, and documented `plan` as the column billing
 * writes — but the app was never moved across, so this file kept writing
 * `role = 'founder'` and the Plan page kept reading it. Round 4 finishes the
 * migration: billing writes `plan`, every reader reads `plan`, and `role` is
 * persona-only in code as well as in the comment.
 *
 * Legacy `role = 'founder'` values are left alone. The migration already set
 * `plan = 'pro'` for every one of them, so nothing needs them, and the next
 * profile save replaces them with a persona.
 */

/** `users.plan` value for a paid account. Constrained to 'free' | 'pro' in SQL. */
export const PRO_PLAN = "pro";

/** Whether a `users.plan` value entitles the account to Pro features. */
export function isProPlan(plan: string | null | undefined): boolean {
  return plan === PRO_PLAN;
}

/**
 * Upgrade a user to the paid Pro tier (admin operation, bypasses RLS).
 *
 * Must run as the service role: `users_block_plan_self_update` raises on any
 * UPDATE that changes `plan` from an `authenticated` or `anon` JWT, which is
 * what stops a signed-in user PATCHing themselves to Pro.
 */
export async function upgradeUserToPro(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("users")
      .update({ plan: PRO_PLAN })
      .eq("id", userId);

    if (error) {
      console.error("Error upgrading user to Pro:", error);
      return { success: false, error: error.message };
    }

    console.log(`User ${userId} upgraded to Pro (plan=${PRO_PLAN})`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Exception upgrading user to Pro:", error);
    return { success: false, error: message };
  }
}

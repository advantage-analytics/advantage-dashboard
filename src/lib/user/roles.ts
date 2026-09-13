import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_PLAN } from "@/lib/user/plan";

/**
 * SERVER ONLY — imports the service-role client. Why entitlement lives in
 * `users.plan` and not `users.role` is documented in `plan.ts`, which also
 * holds the pure helpers (`isProPlan`, `PRO_PLAN`) that client code may import.
 */

/**
 * Upgrade a user to the paid Pro tier (admin operation, bypasses RLS).
 *
 * Must run as the service role: `users_block_plan_self_update` raises on any
 * UPDATE that changes `plan` from an `authenticated` or `anon` JWT, which is
 * what stops a signed-in user PATCHing themselves to Pro.
 */
export async function upgradeUserToPro(
  userId: string,
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

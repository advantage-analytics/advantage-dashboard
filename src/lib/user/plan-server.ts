import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_PLAN } from "@/lib/user/plan";

/**
 * Upgrade a user to the paid Pro tier (admin operation, bypasses RLS).
 *
 * Sets `users.plan = 'pro'` — the entitlement the subscription UI and checkout
 * gate on. Called from the Stripe webhook after a successful payment. A DB
 * trigger blocks non-service-role writes to `plan`, so this must go through
 * the admin client. The profile persona (`users.role`) is untouched.
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

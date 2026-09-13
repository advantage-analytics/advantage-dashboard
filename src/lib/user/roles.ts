import { createAdminClient } from "@/lib/supabase/admin";

/** Role value that marks a user as having purchased the one-time Pro plan. */
export const PRO_ROLE = "founder";

/**
 * Upgrade a user to the paid Pro tier (admin operation, bypasses RLS).
 *
 * Sets `users.role = 'founder'` — the value the subscription UI treats as the
 * active Pro plan. Called from the Stripe webhook after a successful payment.
 */
export async function upgradeUserToPro(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("users")
      .update({ role: PRO_ROLE })
      .eq("id", userId);

    if (error) {
      console.error("Error upgrading user to Pro:", error);
      return { success: false, error: error.message };
    }

    console.log(`User ${userId} upgraded to Pro (role=${PRO_ROLE})`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Exception upgrading user to Pro:", error);
    return { success: false, error: message };
  }
}

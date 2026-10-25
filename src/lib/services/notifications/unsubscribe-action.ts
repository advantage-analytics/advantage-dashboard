import { verifyUnsubscribeToken } from "@/lib/services/email/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turn "Tips for getting started" off for the user a signed link names.
 *
 * SERVER ONLY — service-role write, because the person pressing the button is
 * usually signed out. The token is what authorises it, and it only ever
 * names the one column. An upsert of that column alone: a user with no
 * preferences row gets one with every other column at its default, and an
 * existing row keeps its other switches.
 */
export type UnsubscribeOutcome = "done" | "invalid" | "failed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function applyUnsubscribe(
  userId: string | null | undefined,
  token: string | null | undefined,
): Promise<UnsubscribeOutcome> {
  if (!userId || !token || !UUID.test(userId)) return "invalid";
  if (!verifyUnsubscribeToken(userId, token)) return "invalid";

  const { error } = await createAdminClient().from("user_preferences").upsert(
    {
      user_id: userId,
      email_getting_started: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[unsubscribe] could not write the preference", {
      error: error.message,
    });
    return "failed";
  }
  return "done";
}

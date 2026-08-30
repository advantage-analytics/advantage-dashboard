"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The four ways onboarding resolves. Step 1's "I coach" and "I manage a
 * junior's account" finish immediately; "I play" branches into step 2, whose
 * answers collapse to `college` (on a roster) or `solo` (everything else,
 * including Skip — a recruit is a club player with a college in their future).
 */
export type OnboardingChoice = "coach" | "junior" | "college" | "solo";

/**
 * What each resolution writes and where it lands.
 *
 * `role` uses the Settings profile vocabulary (`PERSONA_ROLES` in
 * `settings/actions.ts`): play → player, coach → coach, junior → parent. The
 * parent mapping is the closest of the four personas on day one; profile
 * settings can refine it to `academy` later. Persona only — entitlement lives
 * in `users.plan` and is never touched here.
 *
 * A coach lands on the team-workspace fork (`/claim/team`, screen 5.1), where
 * college-vs-other is decided; the earlier interim `/claim/program` skipped
 * that junction and sent every coach down the collegiate claim. A junior's
 * guardian goes to the dashboard (interim, T5). A college player keeps
 * `intent=join`, which keeps them on the program search but off the "Set up
 * this program" action — see `claim/role-choice.tsx` for why that routing
 * matters.
 */
const RESOLUTION: Record<
  OnboardingChoice,
  { role: "player" | "coach" | "parent"; destination: string }
> = {
  coach: { role: "coach", destination: "/claim/team" },
  junior: { role: "parent", destination: "/dashboard" },
  college: { role: "player", destination: "/claim/program?intent=join" },
  solo: { role: "player", destination: "/dashboard" },
};

/**
 * Persist the persona, stamp `onboarded_at`, and leave for the destination.
 *
 * Every path stamps — including `college`, which continues into the claim
 * flow: the questions are answered, and leaving the stamp for the claim to set
 * would bounce the player back into onboarding the first time they open the
 * dashboard from it. Own-row RLS (`auth.uid() = id`) authorizes the write; the
 * `.select("id")` confirms a row actually changed, because an update that
 * matched nothing would otherwise loop this person through the gate forever
 * while claiming success.
 */
export async function finishOnboarding(
  choice: OnboardingChoice
): Promise<{ ok: false; error: string }> {
  // A Server Action is callable as a raw RPC no matter what the TS signature
  // says, so `choice` can arrive as any string — including `"__proto__"`,
  // `"constructor"` or `"toString"`, which a plain index lookup resolves
  // truthily through the prototype chain and would stamp `onboarded_at`
  // without an answer ever being given. Only an own, allowlisted key of
  // RESOLUTION names a resolution.
  if (!Object.prototype.hasOwnProperty.call(RESOLUTION, choice)) {
    return { ok: false, error: "Pick an option to continue." };
  }
  const resolution = RESOLUTION[choice];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("users")
    .update({
      role: resolution.role,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id");

  if (error || !data?.length) {
    if (error) {
      console.error("[onboarding] could not save", { message: error.message });
    }
    return { ok: false, error: "We couldn't save that. Try again." };
  }

  // The dashboard layout read the null stamp when it bounced them here.
  revalidatePath("/dashboard", "layout");
  redirect(resolution.destination);
}

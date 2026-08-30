"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  GUARDIAN_PLAYER_NAME_MAX,
  isGuardianClassYear,
} from "./guardian-options";

/**
 * The three ways `finishOnboarding` resolves. Step 1's "I coach" finishes
 * immediately; "I play" branches into step 2, whose answers collapse to
 * `college` (on a roster) or `solo` (everything else, including Skip — a
 * recruit is a club player with a college in their future).
 *
 * "I manage a junior's account" is deliberately NOT here. That persona
 * continues into the guardian step (screen 3.1) and resolves only through
 * `finishGuardianOnboarding` below, where consent is recorded. Listing it in
 * RESOLUTION would leave a raw-RPC path that stamps `onboarded_at` for a
 * guardian who never saw the consent screen.
 */
export type OnboardingChoice = "coach" | "college" | "solo";

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
 * that junction and sent every coach down the collegiate claim. A college
 * player keeps `intent=join`, which keeps them on the program search but off
 * the "Set up this program" action — see `claim/role-choice.tsx` for why that
 * routing matters.
 */
const RESOLUTION: Record<
  OnboardingChoice,
  { role: "player" | "coach"; destination: string }
> = {
  coach: { role: "coach", destination: "/claim/team" },
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

/**
 * The guardian step's submit — screen 3.1, "Who's playing?".
 *
 * This is the ONLY resolution for the junior persona, and the split with
 * `finishOnboarding` is deliberate: picking "I manage a junior's account" on
 * step 1 writes nothing, so a guardian who bails on the consent screen stays
 * un-onboarded and is bounced back into the flow next visit. Consent, the
 * player's details, the role and `onboarded_at` land together, here, or not
 * at all.
 *
 * Trust boundaries, in order:
 *  - the payload is raw-RPC reachable, so every field is re-typed before use —
 *    the TS signature promises nothing (same reasoning as the
 *    `hasOwnProperty` guard above);
 *  - the disabled Continue button is UX; the `consent === true` check is the
 *    rule. No consent flag, no write — a `guardian_consent_at` must never
 *    exist for a guardian who didn't tick the box;
 *  - the consent timestamp is the server's clock, never a client value;
 *  - the write is the caller's own row (`.eq("id", user.id)` from the
 *    cookie-verified session), authorized by the same own-row RLS every
 *    onboarding write uses. `plan` is untouched, and `role` gets only the
 *    persona vocabulary onboarding already assigns.
 *
 * `role` is `parent` for academy staff too — the design routes both down this
 * path ("Parent or academy staff"), and profile settings can refine it to
 * `academy` later, exactly as `finishOnboarding`'s mapping notes.
 */
export async function finishGuardianOnboarding(input: {
  playerName: string;
  classYear: string;
  consent: boolean;
}): Promise<{ ok: false; error: string }> {
  const consent = input != null && input.consent === true;
  const playerName =
    input != null && typeof input.playerName === "string"
      ? input.playerName.trim()
      : "";
  const classYear =
    input != null && typeof input.classYear === "string" ? input.classYear : "";

  if (!consent) {
    return { ok: false, error: "Tick the consent box to continue." };
  }
  if (!playerName || playerName.length > GUARDIAN_PLAYER_NAME_MAX) {
    return { ok: false, error: "Enter the player's name." };
  }
  if (!isGuardianClassYear(classYear)) {
    return { ok: false, error: "Pick a graduating class." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // One timestamp for both columns: consent is what completes this
  // onboarding, so the two facts should never disagree about when.
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update({
      role: "parent",
      junior_player_name: playerName,
      junior_class_year: classYear,
      guardian_consent_at: now,
      onboarded_at: now,
    })
    .eq("id", user.id)
    .select("id");

  if (error || !data?.length) {
    if (error) {
      console.error("[onboarding] could not save guardian step", {
        message: error.message,
      });
    }
    return { ok: false, error: "We couldn't save that. Try again." };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

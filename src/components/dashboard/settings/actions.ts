"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { recoveryRedirectTo } from "@/lib/auth/recovery-handoff";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ProfileInput {
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  phone?: string;
  country?: string;
  state?: string;
  role?: string;
  hand?: string;
  backhand?: string;
}

const emptyToNull = (v?: string): string | null => {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
};

// Personas the profile form may write to users.role (mirrors ROLE_OPTIONS on
// the profile page). Paid entitlement lives in users.plan, never in role.
const PERSONA_ROLES = new Set(["player", "coach", "parent", "academy"]);

// The stored vocabulary for `users.hand` / `users.backhand`, which is not the
// displayed one: `formatPlayerStyle()` turns these into "RIGHT HANDED" and
// "2-HANDED BACKHAND" at read time, and the match filters on
// `matches-page-content.tsx` match against these raw values. Writing a label
// here would leave a row that every reader in the app silently drops.
const PLAYING_HANDS = new Set(["right", "left"]);
const BACKHAND_TYPES = new Set(["one-handed", "two-handed"]);

export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Not signed in. Please log back in." };
  }

  const role = emptyToNull(input.role);
  if (role !== null && !PERSONA_ROLES.has(role)) {
    return { ok: false, error: "Invalid role selection." };
  }

  const hand = emptyToNull(input.hand);
  if (hand !== null && !PLAYING_HANDS.has(hand)) {
    return { ok: false, error: "Invalid hand selection." };
  }

  const backhand = emptyToNull(input.backhand);
  if (backhand !== null && !BACKHAND_TYPES.has(backhand)) {
    return { ok: false, error: "Invalid backhand selection." };
  }

  const { error } = await supabase
    .from("users")
    .update({
      first_name: emptyToNull(input.firstName),
      last_name: emptyToNull(input.lastName),
      dob: emptyToNull(input.birthdate),
      phone: emptyToNull(input.phone),
      country: emptyToNull(input.country),
      state: emptyToNull(input.state),
      role,
      hand,
      backhand,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/settings/profile");
  return { ok: true };
}

export async function requestPasswordReset(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { ok: false, error: "Not signed in. Please log back in." };
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "https"}://${headerList.get("host")}`;

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: recoveryRedirectTo(origin),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Delete the signed-in user's account.
 *
 * Program-filed matches are NOT deleted. A match can only be filed under a
 * program by a current member, and where it is filed never changes, so
 * `program_id` alone says "uploaded while on the team". Those rows stay with
 * the program, attributed to the person's roster profile, which becomes
 * coach-managed. `release_my_account_from_programs()` does every program-side
 * write in one transaction — the second reviewed exception to
 * docs/ui-revamp-guardrails.md §2 — and is called with the USER's client so
 * it can only ever act on the caller. It refuses while the caller still owns
 * a program (42501); the page repeats that sentence.
 *
 * Personal matches (`program_id is null`) are purged, storage first. This
 * used to be a single `auth.admin.deleteUser()` call, and it could not work
 * for anyone who had ever uploaded a match: deleting an `auth.users` row
 * cascades into `public.users`, and three foreign keys point at that table
 * with NO ACTION — `matches.created_by`, `processing_jobs.created_by` and
 * `processing_usage.created_by`. Any one row under any of them pinned the
 * account in place, in Supabase Studio as well as here.
 *
 * The fix is NOT `ON DELETE CASCADE` on those keys. A database-level cascade
 * bypasses `purgeMatchStorage()`, which is what removes the Azure video
 * blobs, the vendor results and the uploaded provider files. So the ordering
 * is enforced here, in code, where the storage step exists.
 *
 * Order: release from programs, then storage, then personal matches, then
 * stragglers, then the auth user last. If an earlier step fails the account
 * still exists and the user can retry — every step is idempotent — where
 * the reverse would leave orphaned data belonging to nobody.
 */
export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Your session expired. Sign in again to delete your account." };
  }

  // 1. Programs first, and as the user: the RPC derives its subject from
  //    auth.uid(), so the admin client would have nobody to act for. Failing
  //    here changes nothing, which is the point of doing it first.
  const { data: released, error: releaseError } = await supabase.rpc(
    "release_my_account_from_programs"
  );

  if (releaseError) {
    if (releaseError.code === "42501") {
      return {
        ok: false,
        error:
          "You still own a program. Transfer ownership in Team settings, then delete your account.",
      };
    }
    console.error("[account delete] program release failed:", releaseError.message);
    return {
      ok: false,
      error: "We could not release your team data, so nothing was deleted. Try again.",
    };
  }

  for (const row of (released ?? []) as ReleasedProgram[]) {
    console.log(
      `[account delete] released from program ${row.program_id}: ` +
        `${row.retained} match(es) retained, ${row.repointed} re-pointed`
    );
  }

  // Admin client for the cleanup: the id is the authenticated caller's own,
  // never anything supplied by the request, so this widens what can be deleted
  // and not whose data can be reached.
  const adminClient = createAdminClient();

  // 2. Personal matches only. Program-filed rows were re-homed above and no
  //    longer carry this user as created_by; the filter makes that explicit
  //    rather than relying on it.
  const { data: matches, error: matchesError } = await adminClient
    .from("matches")
    .select("id")
    .eq("created_by", user.id)
    .is("program_id", null);

  if (matchesError) {
    console.error("[account delete] could not list matches:", matchesError.message);
    return {
      ok: false,
      error: "We could not read your matches, so nothing was deleted. Try again.",
    };
  }

  const matchIds = (matches ?? []).map((m) => m.id as string);

  // Storage BEFORE rows — the object keys live on `processing_jobs`, which
  // cascades away with the match.
  await purgeMatchStorage(adminClient, matchIds, "account delete");

  if (matchIds.length > 0) {
    const { error: matchDeleteError } = await adminClient
      .from("matches")
      .delete()
      .in("id", matchIds);

    if (matchDeleteError) {
      console.error("[account delete] match delete failed:", matchDeleteError.message);
      return {
        ok: false,
        error: "We could not delete your matches, so your account is unchanged. Try again.",
      };
    }
  }

  // 3. Stragglers: individual-ledger usage, and a job or usage row this user
  //    created against a match that was not theirs. Neither cascades from
  //    `matches`, and either one would block the auth delete below. Both are
  //    keyed to the caller and best-effort — a failure here surfaces as the
  //    auth delete refusing, which is the honest outcome.
  await adminClient.from("processing_jobs").delete().eq("created_by", user.id);
  await adminClient.from("processing_usage").delete().eq("created_by", user.id);

  // 4. The login, last.
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteAuthError) {
    console.error("[account delete] auth delete failed:", deleteAuthError.message);
    return {
      ok: false,
      error:
        "Your data was removed but the account itself could not be deleted. " +
        "Contact support and we will finish it by hand.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/** One row per program `release_my_account_from_programs()` touched. */
type ReleasedProgram = {
  program_id: string;
  profile_id: string | null;
  retained: number;
  repointed: number;
};

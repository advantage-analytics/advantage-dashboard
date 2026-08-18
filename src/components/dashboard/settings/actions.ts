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
}

const emptyToNull = (v?: string): string | null => {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
};

export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Not signed in. Please log back in." };
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
      role: emptyToNull(input.role),
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
 * Delete the signed-in user's account and everything belonging to it.
 *
 * This used to be a single `auth.admin.deleteUser()` call, and it could not
 * work for anyone who had ever uploaded a match. Deleting an `auth.users` row
 * cascades into `public.users`, and three foreign keys point at that table with
 * NO ACTION — `matches.created_by`, `processing_jobs.created_by` and
 * `processing_usage.created_by`. Any one row under any of them pinned the
 * account in place, in Supabase Studio as well as here, and the raw Postgres
 * constraint error was handed straight to the user.
 *
 * The fix is NOT `ON DELETE CASCADE` on those keys. A database-level cascade
 * bypasses `purgeMatchStorage()`, which is what removes the Azure video blobs,
 * the vendor results and the uploaded provider files. The rows would vanish and
 * several GB of athlete video would stay in the storage account — still billed,
 * still holding footage the person just asked to have erased, and no longer
 * nameable by anything in the database. So the ordering is enforced here, in
 * code, where the storage step exists.
 *
 * Order: storage, then matches (everything else cascades from them), then any
 * stragglers, then the auth user last. The auth user goes last on purpose — if
 * an earlier step fails the account still exists and the user can retry, where
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

  // Admin client for the cleanup: the id is the authenticated caller's own,
  // never anything supplied by the request, so this widens what can be deleted
  // and not whose data can be reached.
  const adminClient = createAdminClient();

  const { data: matches, error: matchesError } = await adminClient
    .from("matches")
    .select("id")
    .eq("created_by", user.id);

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

  // Stragglers: a job or usage row this user created against a match that was
  // not theirs. Neither cascades from `matches`, and either one would block the
  // auth delete below. Both are keyed to the caller and best-effort — a failure
  // here surfaces as the auth delete refusing, which is the honest outcome.
  await adminClient.from("processing_jobs").delete().eq("created_by", user.id);
  await adminClient.from("processing_usage").delete().eq("created_by", user.id);

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

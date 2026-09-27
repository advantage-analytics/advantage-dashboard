"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeMatchStorage } from "@/lib/services/matches/purge-match-storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { recoveryRedirectTo } from "@/lib/auth/recovery-handoff";
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  USER_AVATARS_BUCKET,
} from "@/lib/user/avatar";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ProfileInput {
  firstName?: string;
  lastName?: string;
  birthdate?: string;
  phone?: string;
  country?: string;
  state?: string;
  hand?: string;
  backhand?: string;
}

const emptyToNull = (v?: string): string | null => {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
};

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

/** The stored key of a user's current avatar, if any. */
async function getCurrentAvatarPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();
  return (data?.avatar_path as string | null | undefined) ?? null;
}

/**
 * Replace the profile photo.
 *
 * Same order as `uploadProgramCrest`: upload under a stamped key, point the
 * row at it, then remove what it replaced. A fixed key would sit behind the
 * CDN showing the old face for the cache's lifetime.
 */
export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in. Please log back in." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a photo first." };
  }
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a PNG, JPG or WebP." };
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "Keep the photo under 2 MB." };
  }

  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  // The lookup only matters after a successful upload (to know what to
  // remove), so it runs alongside the upload rather than before it.
  const [previous, { error: uploadError }] = await Promise.all([
    getCurrentAvatarPath(supabase, user.id),
    supabase.storage
      .from(USER_AVATARS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false }),
  ]);
  if (uploadError) {
    return {
      ok: false,
      error: `Couldn't upload the photo: ${uploadError.message}`,
    };
  }

  const { error } = await supabase
    .from("users")
    .update({ avatar_path: path })
    .eq("id", user.id);
  if (error) {
    await supabase.storage.from(USER_AVATARS_BUCKET).remove([path]);
    return { ok: false, error: "Couldn't save the photo." };
  }

  if (previous && previous !== path) {
    await supabase.storage.from(USER_AVATARS_BUCKET).remove([previous]);
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Back to initials. Row first, then the object it pointed at. */
export async function removeAvatar(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in. Please log back in." };

  // The update doesn't depend on the lookup's result — only the storage
  // cleanup below does — so the two run together.
  const [previous, { error }] = await Promise.all([
    getCurrentAvatarPath(supabase, user.id),
    supabase.from("users").update({ avatar_path: null }).eq("id", user.id),
  ]);
  if (error) return { ok: false, error: "Couldn't remove the photo." };

  if (previous) {
    await supabase.storage.from(USER_AVATARS_BUCKET).remove([previous]);
  }

  revalidatePath("/dashboard", "layout");
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
 *
 * Every failure return after `prepare_my_account_deletion` succeeded gives
 * back the claims it took — see `releaseDeletionClaims`. The success path
 * never does: both claim tables cascade from the rows the deletion removes.
 */
export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "Your session expired. Sign in again to delete your account.",
    };
  }

  // Claim deletion and release program data atomically. A refused release rolls
  // back the claim; successful release blocks concurrent console admissions.
  const { data: released, error: releaseError } = await supabase.rpc(
    "prepare_my_account_deletion",
  );

  if (releaseError) {
    if (releaseError.message?.includes("console-history-protected")) {
      return {
        ok: false,
        error:
          "Your account has retained console submissions. Contact support before deleting your account.",
      };
    }
    if (releaseError.code === "42501") {
      return {
        ok: false,
        error:
          "You still own a program. Transfer ownership in Team settings, then delete your account.",
      };
    }
    console.error(
      "[account delete] program release failed:",
      releaseError.message,
    );
    return {
      ok: false,
      error:
        "We could not release your team data, so nothing was deleted. Try again.",
    };
  }

  for (const row of (released ?? []) as ReleasedProgram[]) {
    console.log(
      `[account delete] released from program ${row.program_id}: ` +
        `${row.retained} match(es) retained, ${row.repointed} re-pointed`,
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
    console.error(
      "[account delete] could not list matches:",
      matchesError.message,
    );
    // No purge has run, so there are no purge claims to give back yet.
    await releaseDeletionClaims(supabase, adminClient, null);
    return {
      ok: false,
      error:
        "We could not read your matches, so nothing was deleted. Try again.",
    };
  }

  const matchIds = (matches ?? []).map((m) => m.id as string);

  // Storage BEFORE rows — the object keys live on `processing_jobs`, which
  // cascades away with the match.
  try {
    await purgeMatchStorage(adminClient, matchIds, "account delete");
  } catch (error) {
    // The purge claim is the first thing `purgeMatchStorage` takes, so a
    // throw may or may not have left one behind; releasing none is a no-op.
    await releaseDeletionClaims(supabase, adminClient, matchIds);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Match deletion is unavailable.",
    };
  }

  if (matchIds.length > 0) {
    const { error: matchDeleteError } = await adminClient
      .from("matches")
      .delete()
      .in("id", matchIds);

    if (matchDeleteError) {
      console.error(
        "[account delete] match delete failed:",
        matchDeleteError.message,
      );
      await releaseDeletionClaims(supabase, adminClient, matchIds);
      return {
        ok: false,
        error:
          "We could not delete your matches, so your account is unchanged. Try again.",
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
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
    user.id,
  );

  if (deleteAuthError) {
    console.error(
      "[account delete] auth delete failed:",
      deleteAuthError.message,
    );
    // Released on purpose although the data is gone: the claim guards
    // deletion I/O, which is over, and the person is being sent to support
    // — whose own console must be able to see them.
    await releaseDeletionClaims(supabase, adminClient, matchIds);
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

/**
 * Give back the claims a deletion took and then failed to use.
 *
 * `prepare_my_account_deletion` claims the caller in
 * `admin_actor_delete_claims`, and `purgeMatchStorage` claims every match in
 * `match_storage_purge_claims`; from then on the admin console refuses each
 * with `*-deletion-in-progress`. Both tables cascade from their parent, so a
 * deletion that completes cleans up on its own — but one that stops part-way
 * leaves the parent standing and the claim with it, for ever: a claim has no
 * expiry and a retry reuses the stuck row. So every failure return after the
 * claim calls this. The account claim always goes back; the purge claims only
 * once `purgeMatchStorage` has run and may have taken them (`purgedMatchIds`
 * is null before that point).
 *
 * The account release runs with the USER's client, and the RPC takes no
 * argument — it can only ever release the caller. The purge release is
 * service-role like the claim, for ids that are the caller's own matches.
 *
 * Best-effort on purpose. A release that fails is logged, and the caller's
 * message is unchanged: a claim left behind is recoverable by hand, while a
 * message about the wrong failure is not.
 */
async function releaseDeletionClaims(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminClient: ReturnType<typeof createAdminClient>,
  purgedMatchIds: string[] | null,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("release_my_account_deletion_claim");
    if (error) {
      console.error(
        "[account delete] could not release the account claim:",
        error.message,
      );
    }
  } catch (error) {
    console.error("[account delete] account claim release threw:", error);
  }

  if (purgedMatchIds === null || purgedMatchIds.length === 0) return;

  try {
    const { error } = await adminClient.rpc(
      "admin_release_match_storage_purge",
      { p_match_ids: purgedMatchIds },
    );
    if (error) {
      console.error(
        "[account delete] could not release the purge claims:",
        error.message,
      );
    }
  } catch (error) {
    console.error("[account delete] purge claim release threw:", error);
  }
}

/** One row per program `release_my_account_from_programs()` touched. */
type ReleasedProgram = {
  program_id: string;
  profile_id: string | null;
  retained: number;
  repointed: number;
};

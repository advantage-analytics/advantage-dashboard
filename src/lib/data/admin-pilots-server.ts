import { getInitials } from "@/lib/data/match-utils";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import type { AdminPilotRow } from "@/lib/data/admin-pilots-view";

/**
 * Admin › Pilots — every pilot individual (`users.individual_pilot`) with
 * this month's personal-workspace video.
 *
 * Service role, because `users` RLS is own-row only and `processing_usage` is
 * scoped to its creator. Re-runs the admin gate rather than trusting the
 * layout (see `requireAdminOrNotFound()`).
 *
 * Usage counts the PERSONAL ledger only (`account_type = 'individual'`, keyed
 * by the user id) — that is the workspace the pilot's 10h applies to. Video a
 * pilot sends inside a team files under the team and is not theirs to spend.
 */
export async function listAdminPilots(): Promise<AdminPilotRow[]> {
  await requireAdminOrNotFound();
  const db = createAdminClient();

  const { data: users, error } = await db
    .from("users")
    .select("id, email, first_name, last_name, avatar_path")
    .eq("individual_pilot", true)
    .order("first_name", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not read pilots: ${error.message}`);
  if (!users || users.length === 0) return [];

  const ids = users.map((user) => user.id);
  const { data: usage, error: usageError } = await db
    .from("processing_usage")
    .select("account_id, reserved_seconds, actual_seconds")
    .eq("account_type", "individual")
    .eq("billing_month", currentBillingMonth())
    .eq("released", false)
    .in("account_id", ids);
  if (usageError) {
    throw new Error(`Could not read pilot usage: ${usageError.message}`);
  }

  // The credit-paid part of this month's jobs. Spends carry no billing month,
  // so they are counted by when they were made, on the same UTC month.
  const { data: spends, error: spendsError } = await db
    .from("video_credit_spends")
    .select("user_id, seconds")
    .eq("released", false)
    .gte("created_at", `${currentBillingMonth()}T00:00:00Z`)
    .in("user_id", ids);
  if (spendsError) {
    throw new Error(`Could not read pilot credit use: ${spendsError.message}`);
  }
  const credit = new Map<string, number>();
  for (const row of spends ?? []) {
    credit.set(
      row.user_id,
      (credit.get(row.user_id) ?? 0) + Number(row.seconds ?? 0),
    );
  }

  const used = new Map<string, number>();
  for (const row of usage ?? []) {
    const seconds = Number(row.actual_seconds ?? row.reserved_seconds ?? 0);
    used.set(row.account_id, (used.get(row.account_id) ?? 0) + seconds);
  }

  return users.map((user) => {
    const email = user.email ?? "";
    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const localPart = email.split("@")[0] ?? email;
    return {
      id: user.id,
      name: fullName || localPart,
      email,
      initials:
        (fullName && getInitials(fullName)) ||
        localPart.slice(0, 2).toUpperCase(),
      avatarUrl: user.avatar_path
        ? db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(user.avatar_path)
            .data.publicUrl
        : null,
      usedSeconds: used.get(user.id) ?? 0,
      creditSeconds: credit.get(user.id) ?? 0,
    };
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import {
  pilotPlacesLabel,
  pilotUsageState,
  type AccountAllowance,
  type AdminPilotRow,
} from "@/lib/data/admin-pilots-view";

/**
 * Admin › Pilots — every pilot individual (`users.individual_pilot`) with
 * this month's personal-workspace video, their allowance and match count.
 *
 * Service role, because `users` RLS is own-row only and `processing_usage` is
 * scoped to its creator. Re-runs the admin gate rather than trusting the
 * layout (see `requireAdminOrNotFound()`).
 *
 * Usage counts the PERSONAL ledger only (`account_type = 'individual'`, keyed
 * by the user id) — that is the workspace the pilot's allowance applies to.
 * Video a pilot sends inside a team files under the team and is not theirs.
 */

/** The `users` columns an allowance is computed from. */
export const ALLOWANCE_COLUMNS =
  "individual_pilot, is_admin, video_hours_override" as const;

interface AllowanceSource {
  individual_pilot: boolean | null;
  is_admin: boolean | null;
  video_hours_override: number | string | null;
}

/**
 * One account's personal allowance, through the same `monthlyCapSecondsFor()`
 * every meter and `reserveQuota()` use, so this page names the figure the
 * database will enforce.
 */
export function personalAllowance(user: AllowanceSource): AccountAllowance {
  const overrideHours =
    user.video_hours_override == null
      ? null
      : Number(user.video_hours_override);
  return {
    overrideHours,
    capSeconds: monthlyCapSecondsFor({
      kind: "personal",
      orgType: null,
      individualPilot: user.individual_pilot === true,
      pilotEligible: false,
      unlimitedVideo: user.is_admin === true,
      videoHoursOverride: overrideHours,
    }),
  };
}

export function avatarUrlFor(
  db: SupabaseClient,
  avatarPath: string | null,
): string | null {
  return avatarPath
    ? db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(avatarPath).data
        .publicUrl
    : null;
}

export function displayName(
  first: string | null,
  last: string | null,
  email: string,
): string {
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || (email.split("@")[0] ?? email);
}

/** Personal-workspace matches per user — the same scope the dashboard lists. */
export async function countPersonalMatches(
  db: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await db
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("created_by", id)
        .is("program_id", null);
      if (error) throw new Error(`Could not count matches: ${error.message}`);
      return [id, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}

interface PilotUser extends AllowanceSource {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  created_at: string | null;
  individual_pilot_at: string | null;
}

async function readPilots(db: SupabaseClient): Promise<PilotUser[]> {
  const { data, error } = await db
    .from("users")
    .select(
      `id, email, first_name, last_name, avatar_path, created_at, individual_pilot_at, ${ALLOWANCE_COLUMNS}`,
    )
    .eq("individual_pilot", true)
    .order("first_name", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not read pilots: ${error.message}`);
  return (data ?? []) as PilotUser[];
}

/** This month's free-hours use per user, on the personal ledger. */
async function readUsedSeconds(
  db: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("processing_usage")
    .select("account_id, reserved_seconds, actual_seconds")
    .eq("account_type", "individual")
    .eq("billing_month", currentBillingMonth())
    .eq("released", false)
    .in("account_id", ids);
  if (error) throw new Error(`Could not read pilot usage: ${error.message}`);
  const used = new Map<string, number>();
  for (const row of data ?? []) {
    const seconds = Number(row.actual_seconds ?? row.reserved_seconds ?? 0);
    used.set(row.account_id, (used.get(row.account_id) ?? 0) + seconds);
  }
  return used;
}

export async function listAdminPilots(): Promise<AdminPilotRow[]> {
  const admin = await requireAdminOrNotFound();
  const db = createAdminClient();

  const users = await readPilots(db);
  if (users.length === 0) {
    await lookAtSurface(admin.id, "pilots");
    return [];
  }

  const ids = users.map((user) => user.id);
  // The credit-paid part of this month's jobs. Spends carry no billing month,
  // so they are counted by when they were made, on the same UTC month.
  const [used, matches, seen, spends] = await Promise.all([
    readUsedSeconds(db, ids),
    countPersonalMatches(db, ids),
    lookAtSurface(admin.id, "pilots"),
    db
      .from("video_credit_spends")
      .select("user_id, seconds")
      .eq("released", false)
      .gte("created_at", `${currentBillingMonth()}T00:00:00Z`)
      .in("user_id", ids),
  ]);
  if (spends.error) {
    throw new Error(`Could not read pilot credit use: ${spends.error.message}`);
  }
  const credit = new Map<string, number>();
  for (const row of spends.data ?? []) {
    credit.set(
      row.user_id,
      (credit.get(row.user_id) ?? 0) + Number(row.seconds ?? 0),
    );
  }

  return users.map((user) => {
    const email = user.email ?? "";
    return {
      id: user.id,
      name: displayName(user.first_name, user.last_name, email),
      email,
      avatarUrl: avatarUrlFor(db, user.avatar_path),
      usedSeconds: used.get(user.id) ?? 0,
      creditSeconds: credit.get(user.id) ?? 0,
      matchCount: matches.get(user.id) ?? 0,
      addedAt: user.individual_pilot_at,
      fresh: isFresh(seen, `pilot:${user.id}`, user.individual_pilot_at),
      ...personalAllowance(user),
    };
  });
}

/**
 * The nav's count for Pilots: pilots at or past 90% of their own cap this
 * month — the ones an admin may want to give more hours. An admin pilot with
 * no override is unlimited and never counts.
 */
export async function countPilotsForNav(adminId: string): Promise<number> {
  void adminId; // Not a "new since" count: it reads the same for every admin.
  const db = createAdminClient();
  const users = await readPilots(db);
  if (users.length === 0) return 0;
  const used = await readUsedSeconds(
    db,
    users.map((user) => user.id),
  );
  return users.filter((user) => {
    const state = pilotUsageState(
      used.get(user.id) ?? 0,
      personalAllowance(user).capSeconds,
    );
    return state === "low" || state === "spent";
  }).length;
}

/** The More menu's sub-line for Pilots: "4 of 20 places used". */
export async function pilotsNavSub(): Promise<string> {
  const { count, error } = await createAdminClient()
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("individual_pilot", true);
  if (error) throw new Error(`Could not count pilots: ${error.message}`);
  return pilotPlacesLabel(count ?? 0);
}

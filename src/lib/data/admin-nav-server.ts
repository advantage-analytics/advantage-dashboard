import type { AdminNavCounts } from "@/components/admin/admin-header";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What the admin header prints beside each destination.
 *
 * Every count is one cheap `head: true` read or a small loader the surface
 * already owns; a failed read prints no count rather than failing the page.
 * Service role, not the session client: `program_requests` carries no RLS
 * policies at all, so a cookie-scoped read would return zero rows rather
 * than an error. The layout's `requireAdminOrNotFound()` has already run.
 */

/** Claims a human still has to decide — `needsReview()`'s two statuses. */
const REVIEWABLE_CLAIM_STATUSES = ["pending_review", "objected"];

/** Claims waiting on a decision plus open program requests. */
export async function countWaitingRequests(): Promise<number> {
  const db = createAdminClient();
  const [claims, requests] = await Promise.all([
    db
      .from("program_claims")
      .select("id", { count: "exact", head: true })
      .in("status", REVIEWABLE_CLAIM_STATUSES),
    db
      .from("program_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);
  return (claims.count ?? 0) + (requests.count ?? 0);
}

export async function loadAdminNav(adminId: string): Promise<AdminNavCounts> {
  void adminId;
  const requests = await countWaitingRequests().catch(() => 0);
  return { tabs: { requests }, more: {} };
}

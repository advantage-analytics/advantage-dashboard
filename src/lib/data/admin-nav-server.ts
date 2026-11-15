import type { AdminNavCounts } from "@/components/admin/admin-header";
import { countNewMatchesForNav } from "@/lib/data/admin-matches-server";
import { countNewTeamsForNav } from "@/lib/data/admin-teams-server";
import { countLabelsForNav } from "@/lib/data/label-overview-server";

/**
 * What the admin header prints beside each destination.
 *
 * Every count is a small loader the surface already owns; a failed read prints
 * no count rather than failing the page.
 */

/** A count or a line that failed prints nothing; the header never fails. */
async function settle<T>(
  read: Promise<T>,
  label: string,
): Promise<T | undefined> {
  try {
    return await read;
  } catch (error) {
    console.error("[admin nav] read failed", {
      label,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Today carries no count (the board shows none, and its loader is the
 * heaviest in the console). Labels, Matches and Teams count rows new since
 * this admin last looked.
 */
export async function loadAdminNav(adminId: string): Promise<AdminNavCounts> {
  const [matches, teams, labels] = await Promise.all([
    settle(countNewMatchesForNav(adminId), "matches"),
    settle(countNewTeamsForNav(adminId), "teams"),
    settle(countLabelsForNav(adminId), "labels"),
  ]);

  return { tabs: { labels, matches, teams } };
}

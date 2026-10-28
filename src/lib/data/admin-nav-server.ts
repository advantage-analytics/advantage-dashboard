import type { AdminNavCounts } from "@/components/admin/admin-header";
import { countNewMatchesForNav } from "@/lib/data/admin-matches-server";
import { countNewTeamsForNav } from "@/lib/data/admin-teams-server";
import { conferencesNavSub } from "@/lib/data/admin-conferences-server";
import {
  countPilotsForNav,
  pilotsNavSub,
} from "@/lib/data/admin-pilots-server";
import { countAskForNav } from "@/lib/data/ask-admin-server";
import { countLabelsForNav } from "@/lib/data/label-overview-server";
import { outreachNavSub } from "@/lib/data/outreach-admin-server";
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
 * heaviest in the console). Matches, Teams and Labels count rows new since
 * this admin last looked; Requests counts what is waiting on a decision;
 * Pilots counts pilots at 90%+ of their cap; Ask counts new thumbs-down.
 */
export async function loadAdminNav(adminId: string): Promise<AdminNavCounts> {
  const [
    requests,
    matches,
    teams,
    labels,
    pilots,
    ask,
    pilotsSub,
    conferencesSub,
    outreachSub,
  ] = await Promise.all([
    settle(countWaitingRequests(), "requests"),
    settle(countNewMatchesForNav(adminId), "matches"),
    settle(countNewTeamsForNav(adminId), "teams"),
    settle(countLabelsForNav(adminId), "labels"),
    settle(countPilotsForNav(adminId), "pilots"),
    settle(countAskForNav(adminId), "ask"),
    settle(pilotsNavSub(), "pilots sub"),
    settle(conferencesNavSub(), "conferences sub"),
    settle(outreachNavSub(), "outreach sub"),
  ]);

  return {
    tabs: { requests, matches, teams, labels },
    more: {
      conferences: { sub: conferencesSub ?? undefined },
      pilots: { count: pilots, sub: pilotsSub ?? undefined },
      outreach: { sub: outreachSub ?? undefined },
      ask: { count: ask, sub: "Feedback on Ask’s answers" },
    },
  };
}

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * How many of a player's own matches have a report to read — the number the
 * first-report tour (`firstReportTourEligible`, `src/lib/onboarding/tours.ts`)
 * and the getting-set-up line (`setupSteps`) key off: exactly one such match
 * opens the tour, more than one marks a veteran.
 *
 * "Finished" means **a `match_stats` row exists for the match**. That is the
 * fact the codebase already uses to say a match has statistics:
 * `withStatsPublished()` in `match-analysis.ts` demotes a vendor-`completed`
 * job to `timeline` when none exist, and the Home and processing hooks poll
 * `match_stats` for existence to learn that a report landed. It is the one
 * definition that holds across providers — a SwingVision import has its rows
 * once `process-match` ran `calculate_match_stats`, and an Advantage
 * Intelligence upload only once derivation published them (the vendor's
 * `completed` on `processing_jobs` is NOT stats; guardrails §3.2). The
 * alternatives are worse: `matches.status` is null on every live row, and a
 * `processing_jobs` status would miss imports entirely. A match whose
 * derivation refused the data (`stats_unavailable`) has no rows and does not
 * count, which is right — there is no report there to tour.
 *
 * Scope is the viewer's personal workspace: `created_by = userId` and
 * `program_id is null`, the same pair `getPersonalMatches` filters on. A team
 * match a coach filed is not the coach's first report. The read goes through
 * the cookie client, so RLS bounds it to what the viewer may see anyway.
 *
 * One `head: true, count: "exact"` query: the `match_stats!inner` embed
 * (through `match_stats_match_id_fkey`) keeps only matches with at least one
 * stats row, and PostgREST counts the parent `matches` rows, so a match's two
 * seat rows (`unique (match_id, is_player1)`) count once. Request-cached: the
 * match page and the Home line may both ask in one render.
 */
export const countFinishedMatchesFor = cache(
  async (userId: string): Promise<number> => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("matches")
      .select("id, match_stats!inner(match_id)", {
        count: "exact",
        head: true,
      })
      .eq("created_by", userId)
      .is("program_id", null);

    if (error) {
      throw new Error("Could not count finished matches", { cause: error });
    }
    return count ?? 0;
  },
);

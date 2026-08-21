import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getStatisticsPageData,
  getSelectableMatches,
} from "@/lib/data/statistics-server";
import { StatisticsPageContent } from "@/components/dashboard/statistics/statistics-page-content";

export const metadata = { title: "Statistics" };

/**
 * Aggregate trends across every match you have logged.
 *
 * This was replaced by a ComingSoonPage in #113 and the replacement outlived
 * its reason: the entire data layer survived — `statistics-server.ts`, its
 * client twin, and all twenty-one components under
 * `components/dashboard/statistics/`. Nothing needed rebuilding, only
 * reconnecting.
 *
 * ── Why unanalysed matches do not skew this ─────────────────────────────────
 * A match with no `match_stats` row yields `null` for every stat, and
 * `avgOrNull` drops nulls before averaging rather than counting them as zero.
 * So a match still in analysis is absent from the averages instead of dragging
 * them down — the aggregate version of the empty-serve-chart failure the match
 * page guards against, and it was already handled here.
 *
 * ── Personal scope, deliberately ────────────────────────────────────────────
 * `getSelectableMatches` filters on `created_by = auth.uid()`, so this is the
 * viewer's own record whichever workspace is active. That is why Statistics
 * sits in the personal rail only and needs no workspace guard: a coach who
 * reaches it from a team workspace sees their own playing history, which is
 * whose history it is. A program-wide version is a different page against a
 * different scope, not a filter on this one.
 */
export default async function StatisticsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");

  // Independent reads the page needs together before it renders anything.
  const [initialData, allMatches] = await Promise.all([
    getStatisticsPageData(),
    getSelectableMatches(),
  ]);

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-light leading-[1.2] tracking-[-0.4px] text-[var(--ink-900)]">
            Statistics
          </h1>
          <p className="max-w-[56ch] text-[13px] leading-[1.6] text-[var(--ink-700)]">
            Serve, return, rally and pressure numbers rolled up across every
            match in your account. Narrow it with the match selector to compare
            a stretch of the season against the rest of it.
          </p>
        </div>

        <StatisticsPageContent
          initialData={initialData}
          allMatches={allMatches}
        />
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { StatisticsDayZero } from "@/components/dashboard/statistics/statistics-day-zero";
import {
  StatisticsColumn,
  StatisticsGround,
} from "@/components/dashboard/statistics/statistics-layout";
import { StatisticsPageContent } from "@/components/dashboard/statistics/statistics-page-content";
import { StatisticsPending } from "@/components/dashboard/statistics/statistics-skeleton";
import { StatisticsTitleRow } from "@/components/dashboard/statistics/statistics-title-row";
import {
  getPersonalStatistics,
  getPersonalStatisticsPoints,
} from "@/lib/data/statistics-server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const metadata = { title: "Statistics" };

/**
 * A player's own season, read across every analyzed match.
 *
 * Personal only. A program's statistics are a different page against a
 * different scope (`/dashboard/team/statistics`), so a team workspace is sent
 * there rather than shown one member's numbers under the program's name —
 * the wrong-attribution failure `docs/ui-revamp-guardrails.md` warns about.
 *
 * The page draws its ground and column at once and streams everything else:
 * the title row's counts, the season strip and every region come from one
 * read (`getPersonalStatistics`, the same cached pair Home's strip uses), and
 * until it lands the region shows `StatisticsPending` — the body the route's
 * `loading.tsx` draws, so the two fallbacks cannot disagree.
 *
 * Filters are not read here. The query string is the page's only filter
 * state and it changes without a server round trip, so it is parsed in the
 * browser (`StatisticsPageContent`) over the full set this hands down.
 */
export default async function StatisticsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  if (workspace.active.kind === "team") redirect("/dashboard/team/statistics");

  return (
    <StatisticsGround>
      <StatisticsColumn>
        <WidgetBoundary label="Statistics">
          <Suspense fallback={<StatisticsPending />}>
            <Statistics userId={workspace.viewer.id} />
          </Suspense>
        </WidgetBoundary>
      </StatisticsColumn>
    </StatisticsGround>
  );
}

async function Statistics({ userId }: { userId: string }) {
  const { matches, totalMatches } = await getPersonalStatistics(userId);
  // Nothing analyzed: the offer over the page's own shape, and no further
  // read. `totalMatches` tells "no match yet" from "a report on its way".
  if (matches.length === 0) {
    return <StatisticsDayZero awaitingReport={totalMatches > 0} />;
  }

  // Every analyzed match's points, read once; a region narrows them to the
  // filtered set itself. `null` is a failed read, which the point regions say.
  const points = await getPersonalStatisticsPoints(matches.map((m) => m.id));
  return (
    <>
      <StatisticsTitleRow matches={matches} />
      <StatisticsPageContent matches={matches} points={points} />
    </>
  );
}

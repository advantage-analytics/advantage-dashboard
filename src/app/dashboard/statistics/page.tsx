import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Statistics" };

/**
 * Aggregate trends across every match you have logged — not finalised, so the
 * page says so rather than showing a half-answer.
 *
 * The implementation is not gone. `statistics-server.ts`, its client twin and
 * the twenty-one components under `components/dashboard/statistics/` are all
 * still here and all still wired to each other; only this route's body is
 * replaced. Restoring the page is a matter of putting the loader and
 * `StatisticsPageContent` back — see the history of this file.
 *
 * Why this is a coming-soon and not a day zero: those are different states
 * with different treatments (SKILL.md → Empty State). A day zero dims the
 * page's own shape, because the shape is finished and only the data is
 * missing. This page's shape is not settled, so an offer promising what it
 * will look like is a promise it cannot keep.
 */
export default function StatisticsPage() {
  return (
    <ComingSoonPage
      title="Statistics"
      heading="Season statistics are still being built."
      description="Serve, return and rally numbers, rolled up across every match you've sent, with a selector to compare one stretch of the season against another."
      action={{ label: "View your matches", href: "/dashboard/matches" }}
    />
  );
}

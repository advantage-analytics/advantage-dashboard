import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Statistics" };

export default function TeamStatisticsPage() {
  return (
    <ComingSoonPage
      title="Statistics"
      heading="Program statistics are still being built."
      description="Serve, return and rally numbers across every match the program has logged, with roster and lineup breakdowns beside the season view. Per-match analysis is ready now."
      action={{ label: "View program matches", href: "/dashboard/matches" }}
    />
  );
}

import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Statistics" };

export default function TeamStatisticsPage() {
  return (
    <ComingSoonPage
      title="Statistics"
      heading="Aggregate trends for your program"
      description="Serve, return, rally and pressure numbers rolled up across every match your program has logged, with roster and lineup breakdowns alongside the season view. Per-match analysis is ready now, in every match your program has already sent for review."
      action={{ label: "View program matches", href: "/dashboard/matches" }}
    />
  );
}

import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export default function StatisticsPage() {
  return (
    <ComingSoonPage
      title="Statistics"
      heading="Aggregate trends are on the way"
      description="Serve, return, rally, and trend breakdowns will roll up across every match you log, right here. Per-match analysis is ready now, with nothing to re-upload."
      action={{ label: "View your matches", href: "/dashboard/matches" }}
    />
  );
}

import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export default function TeamHomePage() {
  return (
    <ComingSoonPage
      title="Team Home"
      heading="Your program at a glance"
      description="Squad activity, this month's processing hours, and what has come back from analysis, in one place. Team workspaces open with the collegiate pilot."
      action={{ label: "View your matches", href: "/dashboard/matches" }}
    />
  );
}

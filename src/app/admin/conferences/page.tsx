import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Conferences" };

export default function AdminConferencesPage() {
  return (
    <ComingSoonPage
      title="Conferences"
      heading="Conferences are coming soon"
      description="Grouping programs by conference — standings, shared schedules, cross-team views — isn't built yet."
      action={{ label: "Back to teams", href: "/admin/teams" }}
    />
  );
}

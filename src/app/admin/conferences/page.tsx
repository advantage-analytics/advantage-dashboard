import { AdminPage } from "@/components/admin/admin-page";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Conferences" };

export default function AdminConferencesPage() {
  return (
    <AdminPage>
      <h1 className="text-display">Conferences</h1>
      <ComingSoon
        heading="Conferences are coming soon"
        description="Grouping programs by conference — standings, shared schedules, cross-team views — isn't built yet."
        action={{ label: "Back to teams", href: "/admin/teams" }}
      />
    </AdminPage>
  );
}

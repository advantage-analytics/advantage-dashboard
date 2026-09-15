import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Overview" };

/**
 * The Overview tab is not built yet — the summary cards it will show (people,
 * requests, usage) all already exist on `getAdminTeam()`'s return via the
 * layout above this page; this page just does not read them yet. That's T21.
 */
export default async function AdminTeamOverviewPage() {
  return (
    <ComingSoonPage
      title="Overview"
      heading="Overview isn't built yet."
      description="A summary of this program's people, open requests and usage, in one glance an admin can act on directly."
      action={{ label: "Back to all teams", href: "/admin/teams" }}
    />
  );
}

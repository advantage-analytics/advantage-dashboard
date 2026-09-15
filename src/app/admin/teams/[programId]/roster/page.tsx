import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Roster" };

/**
 * The Roster tab is not built yet — a program's players, distinct from the
 * People tab's staff/membership view.
 */
export default async function AdminTeamRosterPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  return (
    <ComingSoonPage
      title="Roster"
      heading="Roster isn't built yet."
      description="Every player on this program's roster, with the same detail Team Home's own roster page gives its coaches."
      action={{ label: "Back to overview", href: `/admin/teams/${programId}` }}
    />
  );
}

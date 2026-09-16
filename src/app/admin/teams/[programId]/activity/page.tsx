import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Activity log" };

/**
 * The Activity log tab is not built yet — a timeline of what has happened on
 * this program: claims, invites, role changes, the events an admin
 * investigating a support case would otherwise have to reconstruct by hand.
 */
export default async function AdminTeamActivityPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  return (
    <ComingSoon
      heading="Activity log isn't built yet."
      description="A timeline of what has happened on this program — claims, invites and role changes — so a support case does not have to be reconstructed by hand."
      action={{ label: "Back to overview", href: `/admin/teams/${programId}` }}
    />
  );
}

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata = { title: "People" };

/**
 * The People tab is not built yet — the roster, invites and join requests it
 * will show all already exist on `getAdminTeam()`'s return (`members`,
 * `invites`, `joinRequests`); this page just does not read them yet.
 */
export default async function AdminTeamPeoplePage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  return (
    <ComingSoon
      heading="People isn't built yet."
      description="Members, outstanding invites and open join requests for this program, in one roster an admin can act on directly."
      action={{ label: "Back to overview", href: `/admin/teams/${programId}` }}
    />
  );
}

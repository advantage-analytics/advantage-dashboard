import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Schedule & results" };

/**
 * The Schedule & results tab is not built yet — this program's matches and
 * events, as an admin would need to see them to investigate a support case.
 */
export default async function AdminTeamSchedulePage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  return (
    <ComingSoonPage
      title="Schedule & results"
      heading="Schedule & results isn't built yet."
      description="This program's matches and scheduled events, so an admin can see what it has played without asking its coach."
      action={{ label: "Back to overview", href: `/admin/teams/${programId}` }}
    />
  );
}

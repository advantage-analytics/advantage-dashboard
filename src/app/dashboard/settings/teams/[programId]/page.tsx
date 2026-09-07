import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { getProgramUsage } from "@/lib/data/usage-server";
import {
  crestUrl,
  getProgramSeatUsage,
  getProgramUsagePending,
} from "@/lib/data/teams-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { TeamDetail } from "@/components/dashboard/settings/teams/team-detail";

/**
 * Settings › Teams › one program.
 *
 * The id in the URL is checked against the viewer's memberships before any
 * read — an id that is not in `available` is not one this person may look at,
 * and lands them back on the list. Every read below is also membership-gated
 * in SQL; this is the redirect that keeps a hand-typed id from rendering an
 * empty page with a stranger's name in the header.
 *
 * Not the active workspace, necessarily. The page says so to its children,
 * which is what decides whether "Manage on Roster" is a link or a switch.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const program = workspace.available.find(
    (candidate) => candidate.kind === "team" && candidate.id === programId
  );
  if (!program) redirect("/dashboard/settings/teams");

  const billingMonth = currentBillingMonth();
  const [data, usage, pendingSeconds, seats] = await Promise.all([
    getTeamSettings(programId),
    getProgramUsage(programId, billingMonth, program.orgType),
    getProgramUsagePending(programId, billingMonth),
    getProgramSeatUsage(programId),
  ]);
  if (!data) redirect("/dashboard/settings/teams");

  return (
    <TeamDetail
      programId={programId}
      data={data}
      crestUrl={await crestUrl(data.program.crestPath)}
      usage={usage}
      pendingSeconds={pendingSeconds}
      seats={seats}
      viewerId={workspace.viewer.id}
      viewerName={workspace.viewer.name}
      viewerRole={program.role}
      isActiveWorkspace={workspace.active.id === programId}
    />
  );
}

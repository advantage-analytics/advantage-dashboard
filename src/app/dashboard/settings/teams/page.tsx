import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { crestUrl, listTeamsForViewer } from "@/lib/data/teams-server";
import { TeamsList } from "@/components/dashboard/settings/teams/teams-list";

/**
 * Settings › Teams.
 *
 * The rail hides this item from anyone with no program. That is presentation.
 * This is the check: a viewer with no team workspace lands on Profile rather
 * than on an empty card. Membership at any standing is enough to be here —
 * what a player may do on a program is that program's page's question.
 */
export default async function TeamsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const rows = await listTeamsForViewer(workspace.available);
  if (rows.length === 0) redirect("/dashboard/settings/profile");

  const withCrests = await Promise.all(
    rows.map(async (row) => ({ ...row, crestUrl: await crestUrl(row.crestPath) }))
  );

  return <TeamsList rows={withCrests} />;
}

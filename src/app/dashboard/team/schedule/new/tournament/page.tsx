import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { TournamentForm } from "@/components/dashboard/schedule/tournament-form";

/**
 * 3c — the new tournament, master and detail: the ladder on the left is what
 * the field is built from, so the roster fetch is not decoration here. Without
 * it the right pane has nothing to enter.
 */
export default async function NewTournamentPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [roster, settings] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
  ]);

  return (
    <TournamentForm
      roster={roster}
      defaultSurface={settings?.program.defaultSurface ?? null}
    />
  );
}

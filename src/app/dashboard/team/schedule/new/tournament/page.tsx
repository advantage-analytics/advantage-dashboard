import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { TournamentForm } from "@/components/dashboard/schedule/tournament-form";

/** 25e — the new tournament: facts plus who's going. */
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

import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { TeamSettingsForm } from "@/components/dashboard/settings/team-settings-form";

/**
 * Settings › Team.
 *
 * The rail hides this item outside a program, and hides it from players. That
 * is presentation. This is the check: a personal workspace, or a player who
 * typed the URL, lands back on Profile rather than on an empty form whose every
 * write the database would refuse anyway.
 */
export default async function TeamSettingsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team" || active.role === "player") {
    redirect("/dashboard/settings/profile");
  }

  const data = await getTeamSettings(active.id);
  if (!data) redirect("/dashboard/settings/profile");

  return <TeamSettingsForm data={data} />;
}

import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
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
  // `isProgramStaff` rather than the same test spelled by hand: the workspace
  // switcher's `RESTRICTED_PAGES` predicts this redirect by calling that exact
  // function, and its comment claims the two cannot drift. That is only true
  // while this guard and that entry share one spelling.
  if (!isProgramStaff(active)) {
    redirect("/dashboard/settings/profile");
  }

  const data = await getTeamSettings(active.id);
  if (!data) redirect("/dashboard/settings/profile");

  return <TeamSettingsForm data={data} />;
}

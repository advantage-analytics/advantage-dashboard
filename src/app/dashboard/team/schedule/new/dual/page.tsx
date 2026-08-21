import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { DualForm } from "@/components/dashboard/schedule/dual-form";

/** 25b — the new dual, opponent picked and both lineups editable. */
export default async function NewDualPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  // A hidden menu item is not authorization. A player who types this URL gets
  // the schedule they are allowed to read, not a form whose every write the
  // database would refuse.
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [ladder, settings] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
  ]);

  return (
    <DualForm
      ourName={active.name}
      ladder={ladder}
      defaultSurface={settings?.program.defaultSurface ?? null}
    />
  );
}

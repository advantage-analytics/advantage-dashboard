import { redirect } from "next/navigation";
import { plansHaveBegun } from "@/lib/billing/plans";
import { teamPageHref } from "@/lib/billing/plan-copy";
import { SETTINGS_DEFAULT_HREF } from "@/lib/dashboard/nav";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Where the Settings entry lands. Your own first section, always — except
 * that from January 1, 2027, opened from a TEAM workspace, it lands on that
 * team's own page, which is where the team's plan and hours now live. The
 * sections themselves never switch with the workspace.
 */
export default async function SettingsPage() {
  if (plansHaveBegun()) {
    const workspace = await getWorkspaceContext();
    if (workspace?.active.kind === "team") {
      redirect(teamPageHref(workspace.active.id));
    }
  }
  redirect(SETTINGS_DEFAULT_HREF);
}

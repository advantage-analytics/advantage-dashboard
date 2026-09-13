import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { PreferencesForm } from "@/components/dashboard/settings/preferences-form";

/**
 * Plan comes off the workspace context, so the page needs no `users` query of
 * its own.
 */
export default async function PreferencesPage() {
  const [preferences, workspace] = await Promise.all([
    getPreferences(),
    getWorkspaceContext(),
  ]);

  return (
    <PreferencesForm
      initial={preferences}
      plan={workspace?.viewer.plan ?? "free"}
      showTeamDigest={workspace?.active.kind === "team"}
    />
  );
}

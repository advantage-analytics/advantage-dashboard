import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { PreferencesForm } from "@/components/dashboard/settings/preferences-form";

/**
 * Role and plan both come off the workspace context. The page used to call
 * `auth.getUser()` itself and then re-select the same `users` row for `role` —
 * a second query, serialized after the one the layout had already paid for.
 */
export default async function PreferencesPage() {
  const [preferences, workspace] = await Promise.all([
    getPreferences(),
    getWorkspaceContext(),
  ]);

  return (
    <PreferencesForm
      initial={preferences}
      role={workspace?.viewer.role ?? null}
      plan={workspace?.viewer.plan ?? "free"}
      showTeamDigest={workspace?.active.kind === "team"}
    />
  );
}

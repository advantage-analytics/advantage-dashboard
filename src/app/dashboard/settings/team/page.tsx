import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Settings › Team became Settings › Teams — a list of every program you
 * belong to, each with its own page. The old address still works: inside a
 * team workspace it lands on that program's page, anywhere else on the list.
 */
export default async function TeamSettingsRedirect() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  redirect(
    active.kind === "team"
      ? `/dashboard/settings/teams/${active.id}`
      : "/dashboard/settings/teams"
  );
}

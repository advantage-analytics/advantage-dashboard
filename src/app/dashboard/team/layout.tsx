import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Team routes belong to a team workspace.
 *
 * Without this, `/dashboard/team/roster` renders for anyone who types it —
 * beside a sidebar showing personal navigation, since the sidebar picks its
 * menu from the active workspace. Harmless today because no team workspace is
 * reachable, but the alternative to one guard here is the same check repeated
 * on four stubs and on every real page that replaces them, enforced by
 * remembering.
 *
 * `getWorkspaceContext()` is React-`cache()`d, so this costs nothing beyond
 * the dashboard layout's own call.
 */
export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  if (workspace.active.kind !== "team") redirect("/dashboard");

  return <>{children}</>;
}

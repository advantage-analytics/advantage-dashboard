import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * The Opponents entry is available in both workspaces. Authenticate here,
 * but let the index render its Coming Soon page for personal members too.
 * The index's finalised path and both opponent detail pages enforce their
 * own team-only guards before reading program data.
 *
 * The route sits outside `/dashboard/team` on purpose. Most of what it renders
 * is not this program's — the roster and lineup history come from the pooled
 * public-record views and belong to whoever recorded them — and nesting it
 * under `team` would imply a scope it does not have.
 *
 * `getWorkspaceContext()` is React-`cache()`d, so this costs nothing beyond the
 * dashboard layout's own call.
 */
export default async function OpponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  return <>{children}</>;
}

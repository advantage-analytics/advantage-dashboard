import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * Opponents belongs to a program.
 *
 * Same guard, and the same reasoning, as `dashboard/team/layout.tsx`: the rail
 * picks its menu from the active workspace, so without this a personal-workspace
 * visitor who types the URL gets a scouting page beside personal navigation.
 * One check here rather than the same check repeated on three pages and
 * enforced by remembering.
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
  if (workspace.active.kind !== "team") redirect("/dashboard");

  return <>{children}</>;
}

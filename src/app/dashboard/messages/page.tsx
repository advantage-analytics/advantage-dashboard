import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

/**
 * The link that opens a player's support thread from outside the app — the
 * reply email's "Reply in Advantage" button.
 *
 * Not a page. The thread dialog is opened by `?messages=open` on any dashboard
 * route (`SupportDialogMount`), but a link to `/dashboard?messages=open` dies
 * in the home page's own redirect for a team-workspace viewer, which drops the
 * query. This resolves the workspace once and lands on the right home with
 * the dialog already open.
 */
export default async function MessagesPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  redirect(
    workspace.active.kind === "team"
      ? "/dashboard/team?messages=open"
      : "/dashboard?messages=open",
  );
}
